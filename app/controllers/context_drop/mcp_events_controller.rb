# frozen_string_literal: true

require "json"

module ContextDrop
  class McpEventsController < ApplicationController
    skip_before_action :verify_authenticity_token
    skip_before_action :reject_unallowed_cross_site_mutation!
    skip_before_action :ensure_context_drop_enabled!

    before_action :ensure_mcp_enabled!
    before_action :authenticate_mcp_request!
    include ActionController::Live

    HEARTBEAT_INTERVAL_SECONDS = 15

    def stream
      queue = nil
      begin
        queue = ContextDrop::MCP::EventStreamRegistry.subscribe
      rescue ContextDrop::MCP::EventStreamRegistry::CapacityError
        head :too_many_requests
        return
      end

      response.headers["Content-Type"] = "text/event-stream"
      response.headers["Cache-Control"] = "no-cache"
      response.headers["X-Accel-Buffering"] = "no"

      response.stream.write("event: ready\ndata: {}\n\n")

      loop do
        payload = queue.pop(timeout: HEARTBEAT_INTERVAL_SECONDS)
        if payload.nil?
          response.stream.write(": ping\n\n")
        else
          response.stream.write("event: mcp-event\ndata: #{JSON.generate(payload)}\n\n")
        end
      end
    rescue IOError, ActionController::Live::ClientDisconnected
      nil
    ensure
      ContextDrop::MCP::EventStreamRegistry.unsubscribe(queue) if queue
      response.stream.close rescue nil
    end

    private

    def ensure_mcp_enabled!
      return if ContextDrop.config.mcp_enabled

      head :not_found
    end

    def authenticate_mcp_request!
      if ContextDrop.config.authorize_mcp.respond_to?(:call)
        return if ContextDrop.config.authorize_mcp.call(self)

        head :unauthorized
        return
      end

      expected_key = ContextDrop.config.mcp_api_key.to_s
      if expected_key.strip.empty?
        head :unauthorized
        return
      end

      auth_header = request.headers["Authorization"].to_s
      provided_token = auth_header.start_with?("Bearer ") ? auth_header.sub(/\ABearer\s+/i, "").strip : ""

      unless provided_token.bytesize == expected_key.bytesize &&
             ActiveSupport::SecurityUtils.secure_compare(provided_token, expected_key)
        head :unauthorized
      end
    end
  end
end