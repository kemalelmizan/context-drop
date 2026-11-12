# frozen_string_literal: true

module ContextDrop
  class FeedbacksController < ApplicationController
    before_action :enforce_submission_authorization!
    before_action :enforce_rate_limit!

    def create
      payload = extract_feedback_payload
      raw_elements = Array(payload["element_references"])
      raw_attachments = Array(payload["attachments"])

      if raw_attachments.size > ContextDrop.config.max_attachments.to_i
        render json: {
          error: "Attachments count (#{raw_attachments.size}) exceeds maximum allowed (#{ContextDrop.config.max_attachments})"
        }, status: :unprocessable_entity
        return
      end

      if raw_elements.size > ContextDrop.config.max_element_references.to_i
        render json: {
          error: "Element references count (#{raw_elements.size}) exceeds maximum allowed (#{ContextDrop.config.max_element_references})"
        }, status: :unprocessable_entity
        return
      end

      feedback = nil

      ContextDrop::Feedback.transaction do
        sanitized_meta = ContextDrop::MetadataSanitizer.sanitize_feedback_metadata(payload["metadata"])
        host_env = ContextDrop.config.resolved_environment
        sanitized_meta["environment"] = host_env

        feedback_attrs = {
          submitter: current_context_drop_submitter,
          session_id: hashed_session_identifier,
          message: payload["message"].to_s.strip.presence,
          page_url: (payload["page_url"].presence || request.referer).to_s.strip,
          user_agent: (payload["user_agent"].presence || request.user_agent).to_s.strip.presence,
          metadata: sanitized_meta,
          status: "new"
        }
        if ContextDrop::Feedback.column_names.include?("environment")
          feedback_attrs[:environment] = host_env
        end

        feedback = ContextDrop::Feedback.new(feedback_attrs)

        element_refs_by_client_ref = {}
        raw_elements.each_with_index do |raw_el, idx|
          sanitized_el = ContextDrop::MetadataSanitizer.sanitize_element_reference(raw_el)
          el_record = feedback.element_references.build(sanitized_el)
          client_key = sanitized_el[:client_ref].presence || idx.to_s
          element_refs_by_client_ref[client_key] = el_record
        end

        pending_file_attachments = []
        raw_attachments.each do |raw_att|
          att_hash = stringify_hash(raw_att)
          att_type = (att_hash["attachment_type"] || att_hash["type"] || "image").to_s.strip.downcase
          att_meta = ContextDrop::MetadataSanitizer.sanitize_attachment_metadata(att_hash["metadata"])

          linked_ref_key = (
            att_hash["element_reference_ref"] ||
            att_hash["element_attachment_ref"] ||
            att_hash["client_ref"] ||
            att_meta["element_attachment_ref"] ||
            att_meta["client_ref"]
          ).to_s.strip.presence

          linked_el = linked_ref_key ? element_refs_by_client_ref[linked_ref_key] : nil
          file_source = resolve_attachment_file_source(att_hash)

          if file_source[:dimensions] && att_meta["image_dimensions"].nil?
            att_meta["image_dimensions"] = {
              "width" => file_source[:dimensions][0],
              "height" => file_source[:dimensions][1]
            }
          end

          att_record = feedback.attachments.build(
            attachment_type: att_type,
            element_reference: linked_el,
            metadata: att_meta
          )
          pending_file_attachments << [att_record, linked_el, file_source]
        end

        unless feedback.valid?
          render json: { error: feedback.errors.full_messages.join(", "), errors: feedback.errors.full_messages },
                 status: :unprocessable_entity
          raise ActiveRecord::Rollback
        end

        feedback.save!

        pending_file_attachments.each do |att_record, linked_el, file_source|
          if linked_el && att_record.element_reference_id.nil?
            att_record.update_column(:element_reference_id, linked_el.id)
          end
          attach_binary_to_record!(att_record, file_source)
        end
      end

      return if performed?

      invoke_on_feedback_created(feedback)

      render json: {
        id: feedback.id,
        environment: feedback.environment_name,
        status: feedback.status,
        attachments_count: feedback.attachments.size,
        element_references_count: feedback.element_references.size,
        created_at: feedback.created_at.iso8601
      }, status: :created
    end

    private

    def extract_feedback_payload
      raw = params[:feedback].is_a?(ActionController::Parameters) || params[:feedback].is_a?(Hash) ? params[:feedback] : params
      hash = stringify_hash(raw)

      %w[metadata element_references attachments].each do |key|
        next unless hash[key].is_a?(String)

        begin
          hash[key] = JSON.parse(hash[key])
        rescue JSON::ParserError
          # Leave as-is if not valid JSON string
        end
      end

      hash
    end

    def resolve_attachment_file_source(att_hash)
      if att_hash["signed_blob_id"].present?
        { type: :signed_blob, signed_blob_id: att_hash["signed_blob_id"].to_s }
      elsif att_hash["file"].present?
        validated = ContextDrop::UploadValidator.validate!(att_hash["file"])
        { type: :validated_io, validated: validated, dimensions: validated[:dimensions] }
      elsif att_hash["data_url"].present? || att_hash["data"].present?
        raw_data = (att_hash["data_url"] || att_hash["data"]).to_s
        decoded = decode_base64_image(raw_data, att_hash["filename"])
        validated = ContextDrop::UploadValidator.validate!(decoded)
        { type: :validated_io, validated: validated, dimensions: validated[:dimensions] }
      else
        { type: :none }
      end
    end

    def attach_binary_to_record!(att_record, file_source)
      return unless att_record.respond_to?(:file)

      case file_source[:type]
      when :signed_blob
        blob = ActiveStorage::Blob.find_signed!(file_source[:signed_blob_id])
        validate_existing_blob!(blob)
        att_record.file.attach(blob)
      when :validated_io
        val = file_source[:validated]
        att_record.file.attach(
          io: val[:io],
          filename: val[:filename],
          content_type: val[:content_type]
        )
      end
    rescue ActiveSupport::MessageVerifier::InvalidSignature, ActiveRecord::RecordNotFound
      raise ContextDrop::UploadValidator::ValidationError, "Invalid or expired signed_blob_id"
    end

    def validate_existing_blob!(blob)
      max_size = ContextDrop.config.max_attachment_size.to_i
      if max_size.positive? && blob.byte_size > max_size
        raise ContextDrop::UploadValidator::ValidationError, "Attached blob exceeds maximum allowed size"
      end

      allowed_types = Array(ContextDrop.config.allowed_content_types)
      return if allowed_types.include?(blob.content_type)

      raise ContextDrop::UploadValidator::ValidationError, "Attached blob has disallowed content type"
    end

    def decode_base64_image(raw_data, custom_filename = nil)
      b64_payload = if raw_data.include?(";base64,")
                      raw_data.split(";base64,", 2).last
                    else
                      raw_data
                    end
      bytes = ContextDrop::Base64Util.strict_decode64(b64_payload.strip)
      {
        io: StringIO.new(bytes),
        filename: custom_filename.presence || "screenshot.png"
      }
    rescue ArgumentError
      raise ContextDrop::UploadValidator::ValidationError, "Invalid base64 attachment data"
    end

    def invoke_on_feedback_created(feedback)
      callback = ContextDrop.config.on_feedback_created
      callback.call(feedback) if callback.respond_to?(:call)
    rescue StandardError => e
      Rails.logger.error("[ContextDrop] on_feedback_created callback error: #{e.class}: #{e.message}") if defined?(Rails.logger) && Rails.logger
    end

    def stringify_hash(obj)
      if obj.respond_to?(:to_unsafe_h)
        obj.to_unsafe_h.transform_keys(&:to_s)
      elsif obj.is_a?(Hash)
        obj.transform_keys(&:to_s)
      else
        {}
      end
    end
  end
end
