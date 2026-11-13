# frozen_string_literal: true

module ContextDrop
  class FeedbacksController < ApplicationController
    before_action :enforce_submission_authorization!
    before_action :enforce_rate_limit!, only: %i[create update destroy]

    MAX_OWN_FEEDBACKS_LIMIT = 50
    DEFAULT_OWN_FEEDBACKS_LIMIT = 20

    def index
      raw_limit = params[:limit] ? params[:limit].to_i : DEFAULT_OWN_FEEDBACKS_LIMIT
      limit = raw_limit.clamp(1, MAX_OWN_FEEDBACKS_LIMIT)

      scope = own_active_feedbacks_scope
      total = scope.count
      raw_tokens = combined_raw_ownership_tokens

      records = scope
                .includes(:element_references, :attachments)
                .recent
                .limit(limit)
                .map do |fb|
                  existing_tok = ContextDrop::OwnershipToken.find_token_for(raw_tokens, fb.id)
                  tok = existing_tok || ContextDrop::OwnershipToken.generate(fb.id)
                  serialize_own_feedback(fb, ownership_token: tok)
                end

      render json: {
        total_count: total,
        total: total,
        feedbacks: records
      }, status: :ok
    end

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
          session_id: hashed_session_identifier(initialize_if_missing: true),
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
          linked_ref_key = extract_linked_element_ref_key(att_hash, att_meta)
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
            element_reference: (linked_el && !linked_el.new_record? ? linked_el : nil),
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

      feedback.reload
      invoke_lifecycle_callback(:on_feedback_created, feedback)
      ownership_token = ContextDrop::OwnershipToken.generate(feedback.id)

      render json: {
        id: feedback.id,
        environment: feedback.environment_name,
        status: feedback.status,
        attachments_count: feedback.attachments.size,
        element_references_count: feedback.element_references.size,
        ownership_token: ownership_token,
        feedback: serialize_own_feedback(feedback, ownership_token: ownership_token),
        created_at: feedback.created_at.iso8601,
        updated_at: feedback.updated_at.iso8601
      }, status: :created
    end

    def update
      feedback = ContextDrop::Feedback.includes(:element_references, :attachments).find_by(id: params[:id])
      if feedback.nil? || feedback.deleted?
        render json: { error: "Feedback not found" }, status: :not_found
        return
      end

      payload = extract_feedback_payload
      unless owns_feedback?(feedback, payload_token: payload["ownership_token"])
        render json: { error: "Forbidden" }, status: :forbidden
        return
      end

      has_elements_key = payload.key?("element_references")
      has_attachments_key = payload.key?("attachments")
      raw_elements = has_elements_key ? Array(payload["element_references"]) : nil
      raw_attachments = has_attachments_key ? Array(payload["attachments"]) : nil

      if has_attachments_key && raw_attachments.size > ContextDrop.config.max_attachments.to_i
        render json: {
          error: "Attachments count (#{raw_attachments.size}) exceeds maximum allowed (#{ContextDrop.config.max_attachments})"
        }, status: :unprocessable_entity
        return
      end

      if has_elements_key && raw_elements.size > ContextDrop.config.max_element_references.to_i
        render json: {
          error: "Element references count (#{raw_elements.size}) exceeds maximum allowed (#{ContextDrop.config.max_element_references})"
        }, status: :unprocessable_entity
        return
      end

      ContextDrop::Feedback.transaction do
        if payload.key?("message")
          feedback.message = payload["message"].to_s.strip.presence
        end

        if payload.key?("metadata")
          sanitized_meta = ContextDrop::MetadataSanitizer.sanitize_feedback_metadata(payload["metadata"])
          sanitized_meta["environment"] = feedback.environment_name
          feedback.metadata = sanitized_meta
        end

        element_refs_by_client_ref = {}
        if has_elements_key
          sanitized_elements = raw_elements.map do |raw_el|
            ContextDrop::MetadataSanitizer.sanitize_element_reference(raw_el)
          end

          feedback.element_references.each(&:mark_for_destruction)
          sanitized_elements.each_with_index do |sanitized_el, idx|
            el_record = feedback.element_references.build(sanitized_el)
            client_key = sanitized_el[:client_ref].presence || idx.to_s
            element_refs_by_client_ref[client_key] = el_record
          end
        else
          feedback.element_references.each_with_index do |el_record, idx|
            client_key = el_record.client_ref.presence || idx.to_s
            element_refs_by_client_ref[client_key] = el_record
          end
        end

        retained_attachment_updates = []
        pending_file_attachments = []

        if has_attachments_key
          existing_by_id = feedback.attachments.index_by { |a| a.id.to_s }
          retained_ids = {}

          raw_attachments.each do |raw_att|
            att_hash = stringify_hash(raw_att)
            has_new_binary = att_hash["signed_blob_id"].present? ||
                             att_hash["file"].present? ||
                             att_hash["data_url"].present? ||
                             att_hash["data"].present?
            existing_id = (att_hash["existing_id"] || (!has_new_binary ? att_hash["id"] : nil)).to_s.strip

            if existing_id.present?
              existing_att = existing_by_id[existing_id]
              unless existing_att
                render json: { error: "Attachment does not belong to this feedback" }, status: :unprocessable_entity
                raise ActiveRecord::Rollback
              end

              retained_ids[existing_id] = true
              has_custom_meta = att_hash.key?("metadata") && att_hash["metadata"].is_a?(Hash)
              att_meta = if has_custom_meta
                           merged_meta = (existing_att.metadata.is_a?(Hash) ? existing_att.metadata : {}).merge(
                             ContextDrop::MetadataSanitizer.sanitize_attachment_metadata(att_hash["metadata"])
                           )
                           merged_meta
                         else
                           existing_att.metadata.is_a?(Hash) ? existing_att.metadata : {}
                         end

              linked_ref_key = extract_linked_element_ref_key(att_hash, att_meta)
              linked_el = if linked_ref_key
                            element_refs_by_client_ref[linked_ref_key]
                          elsif !has_elements_key
                            existing_att.element_reference
                          end

              retained_attachment_updates << [existing_att, linked_el, att_meta, has_custom_meta]
            else
              att_type = (att_hash["attachment_type"] || att_hash["type"] || "image").to_s.strip.downcase
              att_meta = ContextDrop::MetadataSanitizer.sanitize_attachment_metadata(att_hash["metadata"])
              linked_ref_key = extract_linked_element_ref_key(att_hash, att_meta)
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
                element_reference: (linked_el && !linked_el.new_record? ? linked_el : nil),
                metadata: att_meta
              )
              pending_file_attachments << [att_record, linked_el, file_source]
            end
          end

          feedback.attachments.each do |att|
            next if att.new_record?
            next if retained_ids[att.id.to_s]

            att.mark_for_destruction
          end
        end

        unless feedback.valid?
          render json: { error: feedback.errors.full_messages.join(", "), errors: feedback.errors.full_messages },
                 status: :unprocessable_entity
          raise ActiveRecord::Rollback
        end

        feedback.element_references.select(&:marked_for_destruction?).each(&:destroy!)
        feedback.attachments.select(&:marked_for_destruction?).each(&:destroy!)
        feedback.updated_at = Time.current
        feedback.save!

        retained_attachment_updates.each do |existing_att, linked_el, att_meta, has_custom_meta|
          attrs_to_update = { element_reference_id: linked_el&.id }
          attrs_to_update[:metadata] = att_meta if has_custom_meta
          existing_att.update_columns(attrs_to_update)
        end

        pending_file_attachments.each do |att_record, linked_el, file_source|
          if linked_el && att_record.element_reference_id.nil?
            att_record.update_column(:element_reference_id, linked_el.id)
          end
          attach_binary_to_record!(att_record, file_source)
        end
      end

      return if performed?

      feedback.reload
      invoke_lifecycle_callback(:on_feedback_updated, feedback)

      raw_tokens = combined_raw_ownership_tokens(payload["ownership_token"])
      ownership_token = ContextDrop::OwnershipToken.find_token_for(raw_tokens, feedback.id) ||
                        ContextDrop::OwnershipToken.generate(feedback.id)

      render json: {
        id: feedback.id,
        environment: feedback.environment_name,
        status: feedback.status,
        message: feedback.message,
        attachments_count: feedback.attachments.size,
        element_references_count: feedback.element_references.size,
        ownership_token: ownership_token,
        feedback: serialize_own_feedback(feedback, ownership_token: ownership_token),
        created_at: feedback.created_at.iso8601,
        updated_at: feedback.updated_at.iso8601
      }, status: :ok
    end

    def destroy
      feedback = ContextDrop::Feedback.find_by(id: params[:id])
      if feedback.nil? || feedback.deleted?
        render json: { error: "Feedback not found" }, status: :not_found
        return
      end

      payload = extract_feedback_payload
      unless owns_feedback?(feedback, payload_token: payload["ownership_token"])
        render json: { error: "Forbidden" }, status: :forbidden
        return
      end

      feedback.soft_delete!
      invoke_lifecycle_callback(:on_feedback_deleted, feedback)

      render json: {
        id: feedback.id,
        deleted: true,
        deleted_at: feedback.deleted_at_value&.iso8601
      }, status: :ok
    end

    def attachment
      feedback = ContextDrop::Feedback.find_by(id: params[:feedback_id])
      if feedback.nil? || feedback.deleted?
        head :not_found
        return
      end

      unless owns_feedback?(feedback)
        head :forbidden
        return
      end

      att = feedback.attachments.find_by(id: params[:id])
      if att.nil? || !att.respond_to?(:file) || !att.file.attached?
        head :not_found
        return
      end

      response.set_header("Cache-Control", "private, max-age=3600")
      response.set_header("Content-Security-Policy", "default-src 'none'; sandbox")
      send_data att.file.download,
                type: att.file.content_type || "image/png",
                disposition: "inline",
                filename: att.file.filename.to_s
    end

    private

    def own_active_feedbacks_scope
      base = ContextDrop::Feedback.active
      clauses = []

      submitter = current_context_drop_submitter
      if submitter && submitter.respond_to?(:id) && !submitter.id.nil?
        clauses << base.where(submitter_type: submitter.class.name, submitter_id: submitter.id)
      end

      anon_base = base.where(submitter_id: nil)
      sid = hashed_session_identifier(initialize_if_missing: false)
      clauses << anon_base.where(session_id: sid) if sid.present?

      token_ids = ContextDrop::OwnershipToken
                  .extract_verified_ids(combined_raw_ownership_tokens)
                  .map(&:to_i)
                  .select(&:positive?)
      clauses << anon_base.where(id: token_ids) if token_ids.any?

      return ContextDrop::Feedback.none if clauses.empty?

      clauses.reduce { |acc, rel| acc.or(rel) }
    end

    def owns_feedback?(feedback, payload_token: nil)
      submitter = current_context_drop_submitter

      if feedback.submitter_id.present? || feedback.submitter_type.present?
        return false unless submitter && submitter.respond_to?(:id) && !submitter.id.nil?

        return feedback.submitter_type.to_s == submitter.class.name.to_s &&
               feedback.submitter_id.to_s == submitter.id.to_s
      end

      raw_tokens = combined_raw_ownership_tokens(payload_token)
      return true if ContextDrop::OwnershipToken.find_token_for(raw_tokens, feedback.id)

      sid = hashed_session_identifier(initialize_if_missing: false)
      return false if sid.blank? || feedback.session_id.blank?

      ActiveSupport::SecurityUtils.secure_compare(feedback.session_id.to_s, sid.to_s)
    end

    def combined_raw_ownership_tokens(extra_token = nil)
      [
        extra_token,
        request.headers["X-Context-Drop-Ownership-Token"],
        request.headers["X-Context-Drop-Ownership-Tokens"],
        params[:ownership_token],
        params[:ownership_tokens]
      ].compact.map(&:to_s).reject(&:empty?).join(",")
    end

    def serialize_own_feedback(feedback, ownership_token: nil)
      elements_by_id = feedback.element_references.index_by(&:id)

      {
        id: feedback.id,
        environment: feedback.environment_name,
        status: feedback.status,
        message: feedback.message,
        page_url: feedback.page_url,
        ownership_token: ownership_token,
        created_at: feedback.created_at&.iso8601,
        updated_at: feedback.updated_at&.iso8601,
        element_references: feedback.element_references.map do |el|
          {
            id: el.id,
            client_ref: el.client_ref,
            tag_name: el.tag_name,
            selector: el.selector,
            dom_path: el.dom_path,
            text_content: el.text_content,
            attributes_snapshot: el.attributes_snapshot || {},
            bounding_rect: el.bounding_rect || {},
            viewport: el.viewport || {},
            metadata: el.metadata || {},
            captured_at: el.captured_at&.iso8601
          }
        end,
        attachments: feedback.attachments.map do |att|
          attached = att.respond_to?(:file) && att.file.attached?
          linked_el = att.element_reference_id ? elements_by_id[att.element_reference_id] : att.element_reference
          {
            id: att.id,
            attachment_type: att.attachment_type,
            element_reference_id: att.element_reference_id,
            element_reference_ref: linked_el&.client_ref,
            filename: attached ? att.file.filename.to_s : nil,
            content_type: attached ? att.file.content_type : nil,
            byte_size: attached ? att.file.byte_size : nil,
            metadata: att.metadata || {},
            created_at: att.created_at&.iso8601
          }
        end
      }
    end

    def extract_linked_element_ref_key(att_hash, att_meta)
      (
        att_hash["element_reference_ref"] ||
        att_hash["element_attachment_ref"] ||
        att_hash["client_ref"] ||
        att_meta["element_attachment_ref"] ||
        att_meta["client_ref"]
      ).to_s.strip.presence
    end

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

    def invoke_lifecycle_callback(hook_name, feedback)
      return unless ContextDrop.config.respond_to?(hook_name)

      callback = ContextDrop.config.public_send(hook_name)
      callback.call(feedback) if callback.respond_to?(:call)
    rescue StandardError => e
      Rails.logger.error("[ContextDrop] #{hook_name} callback error: #{e.class}: #{e.message}") if defined?(Rails.logger) && Rails.logger
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
