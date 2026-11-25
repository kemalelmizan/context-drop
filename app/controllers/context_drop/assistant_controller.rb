# frozen_string_literal: true

module ContextDrop
  class AssistantController < ApplicationController
    before_action :enforce_assistant_enabled!
    before_action :enforce_assistant_rate_limit!, only: %i[turn approve_change_set]

    def turn
      mode = params[:mode].to_s.strip.downcase
      unless ContextDrop.config.assistant_mode_enabled?(mode)
        render json: { error: "Assistant mode '#{mode}' is not enabled for this environment" }, status: :forbidden
        return
      end

      unless ContextDrop.config.assistant_authorized?(self, mode)
        render json: { error: "Forbidden for assistant mode '#{mode}'" }, status: :forbidden
        return
      end

      if %w[ask build].include?(mode) && !ContextDrop.config.assistant_llm_configured?
        render json: { error: "Assistant LLM is not configured (org BYOK required for Ask and Build)" },
               status: :unprocessable_entity
        return
      end

      raw_messages = params[:messages].is_a?(Array) ? params[:messages].map { |m| to_plain_hash(m) } : []
      raw_elements = params[:element_references].is_a?(Array) ? params[:element_references].map { |e| to_plain_hash(e) } : []
      raw_attachments = params[:attachments].is_a?(Array) ? params[:attachments].map { |a| to_plain_hash(a) } : []

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

      allow_override = !!ContextDrop.config.assistant_allow_client_model_override
      requested_provider = allow_override ? params[:provider].to_s.strip.presence : nil
      requested_model = allow_override ? params[:model].to_s.strip.presence : nil
      if requested_model && !ContextDrop.config.assistant_model_allowed?(mode, requested_model)
        render json: { error: "Model '#{requested_model}' is not permitted for assistant mode '#{mode}'" },
               status: :unprocessable_entity
        return
      end

      change_set = nil
      if params[:change_set_id].present?
        change_set = ChangeSet.find_by(id: params[:change_set_id])
        unless change_set
          render json: { error: "Change set not found" }, status: :not_found
          return
        end

        unless change_set_visible?(change_set)
          render json: { error: "Forbidden" }, status: :forbidden
          return
        end
      end

      orchestrator = Assistant::Orchestrator.new
      result = orchestrator.run_turn(
        mode: mode,
        messages: raw_messages,
        page_url: params[:page_url].to_s.strip.presence || request.referer,
        element_references: raw_elements,
        attachments: raw_attachments,
        change_set: change_set,
        submitter: current_context_drop_submitter,
        session_id: assistant_session_id(initialize_if_missing: true),
        provider: requested_provider,
        model: requested_model,
        feedback_id: params[:feedback_id],
        ownership_token: combined_ownership_token
      )

      render json: result, status: :ok
    rescue ContextDrop::Error => e
      status = forbidden_assistant_error?(e) ? :forbidden : :unprocessable_entity
      render json: { error: e.message }, status: status
    end

    def show_change_set
      record = ChangeSet.find_by(id: params[:id])
      unless record
        render json: { error: "Change set not found" }, status: :not_found
        return
      end

      unless change_set_visible?(record)
        render json: { error: "Forbidden" }, status: :forbidden
        return
      end

      Assistant::BuildExecutor.new(change_set: record).refresh_status! if ContextDrop.config.build_enabled?

      render json: { change_set: record.reload.as_widget_json }, status: :ok
    end

    def approve_change_set
      unless ContextDrop.config.build_enabled?
        render json: { error: "Build mode is not enabled" }, status: :forbidden
        return
      end

      unless ContextDrop.config.assistant_authorized?(self, "build")
        render json: { error: "Forbidden" }, status: :forbidden
        return
      end

      record = ChangeSet.find_by(id: params[:id])
      unless record
        render json: { error: "Change set not found" }, status: :not_found
        return
      end

      unless change_set_visible?(record)
        render json: { error: "Forbidden" }, status: :forbidden
        return
      end

      unless record.status == "draft"
        render json: { error: "Change set is not in draft status" }, status: :unprocessable_entity
        return
      end

      raw_approval = params[:approval_token].to_s.strip
      if raw_approval.empty?
        render json: { error: "approval_token is required" }, status: :unprocessable_entity
        return
      end

      record.approve!(raw_token: raw_approval)

      result = Assistant::BuildExecutor.new(change_set: record).execute_after_approval!
      if result[:is_error]
        render json: { error: result[:error] || "Build execution failed", details: result }, status: :unprocessable_entity
      else
        render json: result, status: :ok
      end
    rescue ContextDrop::Error => e
      render json: { error: e.message }, status: :unprocessable_entity
    end

    def status
      render json: {
        enabled: ContextDrop.config.assistant_enabled?,
        modes: ContextDrop.config.resolved_assistant_modes,
        llm_configured: ContextDrop.config.assistant_llm_configured?,
        build_enabled: ContextDrop.config.build_enabled?
      }, status: :ok
    end

    private

    def enforce_assistant_enabled!
      return if ContextDrop.config.assistant_enabled?

      render json: { error: "Assistant is disabled" }, status: :not_found
    end

    def assistant_session_id(initialize_if_missing: false)
      hashed_session_identifier(initialize_if_missing: initialize_if_missing)
    end

    def change_set_visible?(record)
      submitter = current_context_drop_submitter

      if record.submitter_id.present? || record.submitter_type.present?
        return false unless submitter && submitter.respond_to?(:id) && !submitter.id.nil?

        return record.submitter_type.to_s == submitter.class.name.to_s &&
               record.submitter_id.to_s == submitter.id.to_s
      end

      return false unless ContextDrop.config.anonymous_change_sets_allowed?

      sid = assistant_session_id(initialize_if_missing: false)
      return false if sid.blank? || record.session_id.blank?

      ActiveSupport::SecurityUtils.secure_compare(record.session_id.to_s, sid.to_s)
    end

    def combined_ownership_token
      [
        params[:ownership_token],
        request.headers["X-Context-Drop-Ownership-Token"]
      ].map { |t| t.to_s.strip }.reject(&:empty?).first
    end

    def forbidden_assistant_error?(err)
      msg = err.message.to_s
      msg == "Forbidden" || msg.start_with?("Forbidden ") || msg.start_with?("Forbidden:")
    end

    def to_plain_hash(obj)
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