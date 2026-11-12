# frozen_string_literal: true

require "uri"

module ContextDrop
  class AgentController < ApplicationController
    before_action :enforce_local_agent_security_wall!

    def status
      key_store = ContextDrop::Agent::KeyStore.new
      provider_info = key_store.providers_status

      render json: {
        enabled: true,
        environment: ContextDrop.config.resolved_environment,
        workspace_name: File.basename(ContextDrop.config.resolved_workspace_root),
        mcp_environments: ContextDrop::MCP::EnvironmentRouter.available_environments,
        active_provider: provider_info[:active_provider],
        providers: provider_info[:providers]
      }, status: :ok
    end

    def save_keys
      provider = params[:provider].to_s.strip.downcase
      api_key = params.key?(:api_key) ? params[:api_key].to_s : nil
      model = params.key?(:model) ? params[:model].to_s : nil
      base_url = params.key?(:base_url) ? params[:base_url].to_s : nil
      make_active = params.key?(:make_active) ? ActiveModel::Type::Boolean.new.cast(params[:make_active]) : true

      if provider == "custom" && base_url && !base_url.strip.empty?
        ContextDrop::Agent::LlmClient.validate_custom_base_url!(base_url, resolve_dns: false)
      end

      key_store = ContextDrop::Agent::KeyStore.new
      updated = key_store.save_provider_config!(
        provider: provider,
        api_key: api_key,
        model: model,
        base_url: base_url,
        make_active: make_active
      )

      render json: updated, status: :ok
    rescue ContextDrop::Error => e
      render json: { error: e.message }, status: :unprocessable_entity
    end

    def destroy_keys
      provider = (params[:provider] || "all").to_s
      key_store = ContextDrop::Agent::KeyStore.new
      updated = key_store.clear_provider_key!(provider: provider)

      render json: updated, status: :ok
    rescue ContextDrop::Error => e
      render json: { error: e.message }, status: :unprocessable_entity
    end

    def feedbacks
      env_filter = (params[:environment] || "all").to_s
      status_filter = (params[:status] || "new").to_s
      res = ContextDrop::MCP::Tools::ListFeedbacks.call(
        "environment" => env_filter,
        "status" => status_filter == "all" ? "" : status_filter,
        "limit" => (params[:limit] || 20).to_i
      )

      if res[:isError]
        err = JSON.parse(res.dig(:content, 0, :text).to_s)["error"] rescue "Failed to list feedbacks"
        render json: { error: err }, status: :unprocessable_entity
      else
        render json: JSON.parse(res.dig(:content, 0, :text).to_s), status: :ok
      end
    end

    def chat
      raw_messages = params[:messages].is_a?(Array) ? params[:messages].map { |m| to_plain_hash(m) } : []
      raw_elements = params[:element_references].is_a?(Array) ? params[:element_references].map { |e| to_plain_hash(e) } : []
      raw_attachments = params[:attachments].is_a?(Array) ? params[:attachments].map { |a| to_plain_hash(a) } : []

      orchestrator = ContextDrop::Agent::Orchestrator.new
      result = orchestrator.run_turn(
        messages: raw_messages,
        page_url: params[:page_url].to_s.strip.presence || request.referer,
        element_references: raw_elements,
        attachments: raw_attachments,
        provider: params[:provider].to_s.strip.presence,
        model: params[:model].to_s.strip.presence
      )

      render json: result, status: :ok
    rescue ContextDrop::Error => e
      render json: { error: e.message }, status: :unprocessable_entity
    end

    def apply_edit
      sandbox = ContextDrop::Agent::WorkspaceSandbox.new
      updated = sandbox.apply_edit!(params[:id].to_s)
      render json: { edit: updated }, status: :ok
    rescue ContextDrop::Error => e
      render json: { error: e.message }, status: :unprocessable_entity
    end

    def reject_edit
      sandbox = ContextDrop::Agent::WorkspaceSandbox.new
      updated = sandbox.reject_edit!(params[:id].to_s)
      render json: { edit: updated }, status: :ok
    rescue ContextDrop::Error => e
      render json: { error: e.message }, status: :unprocessable_entity
    end

    def revert_edit
      sandbox = ContextDrop::Agent::WorkspaceSandbox.new
      updated = sandbox.revert_edit!(params[:id].to_s)
      render json: { edit: updated }, status: :ok
    rescue ContextDrop::Error => e
      render json: { error: e.message }, status: :unprocessable_entity
    end

    private

    # Defense-in-depth gate:
    # 1. Hard-disabled in production or non-development environments (`404 Not Found`).
    # 2. Loopback IP + loopback Host header required (blocks LAN/tunnel exposure & DNS rebinding).
    # 3. Same-Origin header verification on mutating requests (blocks cross-origin browser attacks).
    # 4. Dashboard / developer authorization policy check.
    def enforce_local_agent_security_wall!
      unless ContextDrop.config.local_agent_allowed?
        render json: { error: "Not Found" }, status: :not_found
        return
      end

      unless ContextDrop.config.loopback_request?(request)
        render json: { error: "Forbidden: ContextDrop Agent is restricted to local loopback (127.0.0.1 / ::1)" },
               status: :forbidden
        return
      end

      if !request.get? && !request.head? && !valid_same_origin_request?
        render json: { error: "Forbidden: Cross-origin request blocked" }, status: :forbidden
        return
      end

      return if ContextDrop.config.dashboard_authorized?(self)

      render json: { error: "Forbidden: Unauthorized for ContextDrop Local Agent" }, status: :forbidden
    end

    def valid_same_origin_request?
      origin = request.headers["Origin"].to_s.strip
      return true if origin.empty? # Same-origin non-CORS or test harness without Origin; CSRF still protects POST/DELETE

      origin_uri = URI.parse(origin)
      expected_host = request.host.to_s.downcase
      expected_port = request.port
      origin_uri.host.to_s.downcase == expected_host && origin_uri.port == expected_port
    rescue URI::InvalidURIError
      false
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
