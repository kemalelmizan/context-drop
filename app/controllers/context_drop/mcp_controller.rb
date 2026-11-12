# frozen_string_literal: true

require "json"

module ContextDrop
  class McpController < ApplicationController
    skip_before_action :verify_authenticity_token
    skip_before_action :ensure_context_drop_enabled!

    before_action :ensure_mcp_enabled!
    before_action :authenticate_mcp_request!

    def create
      raw_body = request.raw_post.to_s
      payload = JSON.parse(raw_body)
      # Remote HTTP endpoints strictly serve their own host environment and never recursively fan out
      response = ContextDrop::MCP::Server.handle_http_payload(payload, local_only: true)

      if response.nil?
        head :accepted
      else
        render json: response, status: :ok
      end
    rescue JSON::ParserError => e
      render json: {
        jsonrpc: "2.0",
        id: nil,
        error: {
          code: -32_700,
          message: "Parse error: #{e.message}"
        }
      }, status: :ok
    end

    private

    def ensure_mcp_enabled!
      return if ContextDrop.config.mcp_enabled

      render json: { error: "Not Found" }, status: :not_found
    end

    def authenticate_mcp_request!
      if ContextDrop.config.authorize_mcp.respond_to?(:call)
        return if ContextDrop.config.authorize_mcp.call(self)

        render json: { error: "Unauthorized MCP request" }, status: :unauthorized
        return
      end

      expected_key = ContextDrop.config.mcp_api_key.to_s
      if expected_key.strip.empty?
        render json: { error: "Unauthorized: MCP API key is not configured" }, status: :unauthorized
        return
      end

      auth_header = request.headers["Authorization"].to_s
      provided_token = auth_header.start_with?("Bearer ") ? auth_header.sub(/\ABearer\s+/i, "").strip : ""

      if provided_token.bytesize == expected_key.bytesize &&
         ActiveSupport::SecurityUtils.secure_compare(provided_token, expected_key)
        return
      end

      render json: { error: "Unauthorized: Invalid or missing Bearer token" }, status: :unauthorized
    end
  end
end
