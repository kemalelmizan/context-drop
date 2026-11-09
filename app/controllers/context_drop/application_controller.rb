# frozen_string_literal: true

require "digest"

module ContextDrop
  class ApplicationController < ActionController::Base
    protect_from_forgery with: :exception

    before_action :ensure_context_drop_enabled!

    rescue_from ActionController::InvalidAuthenticityToken, with: :handle_invalid_csrf_token
    rescue_from ContextDrop::UploadValidator::ValidationError, with: :handle_upload_validation_error
    rescue_from ContextDrop::MetadataSanitizer::SensitiveElementError, with: :handle_sensitive_element_error

    class << self
      def rate_limit_store
        @rate_limit_store ||= {}
      end

      def rate_limit_mutex
        @rate_limit_mutex ||= Mutex.new
      end

      def reset_rate_limits!
        rate_limit_mutex.synchronize { rate_limit_store.clear }
      end
    end

    private

    def ensure_context_drop_enabled!
      return if ContextDrop.enabled?

      respond_to do |format|
        format.json { render json: { error: "Not Found" }, status: :not_found }
        format.any { head :not_found }
      end
    end

    def current_context_drop_submitter
      return @current_context_drop_submitter if defined?(@current_context_drop_submitter)

      @current_context_drop_submitter = ContextDrop.config.resolve_submitter(self)
    end

    def enforce_submission_authorization!
      submitter = current_context_drop_submitter
      if !ContextDrop.config.allow_anonymous && submitter.nil?
        render json: { error: "Authentication required to submit feedback" }, status: :unauthorized
        return
      end

      return if ContextDrop.config.submission_authorized?(self)

      render json: { error: "Forbidden" }, status: :forbidden
    end

    def enforce_rate_limit!
      limit_cfg = ContextDrop.config.rate_limit
      return unless limit_cfg.is_a?(Hash)

      max_requests = (limit_cfg[:max_requests] || limit_cfg["max_requests"]).to_i
      period_seconds = (limit_cfg[:period] || limit_cfg["period"]).to_i
      return if max_requests <= 0 || period_seconds <= 0

      client_identifier = request.remote_ip.presence || "unknown"
      bucket = (Time.now.to_i / period_seconds)
      cache_key = "context_drop:rate_limit:#{client_identifier}:#{bucket}"

      count = increment_rate_limit_counter(cache_key, period_seconds)
      return if count <= max_requests

      render json: { error: "Rate limit exceeded. Please try again later." }, status: :too_many_requests
    end

    def increment_rate_limit_counter(cache_key, period_seconds)
      if defined?(Rails) && Rails.respond_to?(:cache) && Rails.cache && !Rails.cache.is_a?(ActiveSupport::Cache::NullStore)
        current = Rails.cache.read(cache_key).to_i + 1
        Rails.cache.write(cache_key, current, expires_in: period_seconds)
        current
      else
        self.class.rate_limit_mutex.synchronize do
          store = self.class.rate_limit_store
          now = Time.now.to_i
          store.delete_if { |_k, v| v[:expires_at] <= now }
          entry = store[cache_key] ||= { count: 0, expires_at: now + period_seconds }
          entry[:count] += 1
          entry[:count]
        end
      end
    end

    def hashed_session_identifier
      raw_id = session.id.to_s if respond_to?(:session) && session.respond_to?(:id) && session.id
      return nil if raw_id.nil? || raw_id.empty?

      Digest::SHA256.hexdigest(raw_id)[0, 32]
    rescue StandardError
      nil
    end

    def handle_invalid_csrf_token
      render json: { error: "Invalid or missing CSRF authenticity token" }, status: :unprocessable_entity
    end

    def handle_upload_validation_error(exception)
      render json: { error: exception.message }, status: exception.http_status
    end

    def handle_sensitive_element_error(exception)
      render json: { error: exception.message }, status: :unprocessable_entity
    end
  end
end
