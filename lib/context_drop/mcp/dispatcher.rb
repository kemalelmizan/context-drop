# frozen_string_literal: true

require "json"

module ContextDrop
  module MCP
    class Dispatcher
      PROTOCOL_VERSION = "2025-03-26"

      TOOLS = {
        "list_environments" => ContextDrop::MCP::Tools::ListEnvironments,
        "list_feedbacks" => ContextDrop::MCP::Tools::ListFeedbacks,
        "get_feedback" => ContextDrop::MCP::Tools::GetFeedback,
        "get_feedback_attachment" => ContextDrop::MCP::Tools::GetFeedbackAttachment,
        "update_feedback_status" => ContextDrop::MCP::Tools::UpdateFeedbackStatus
      }.freeze

      PROMPTS = {
        "investigate_feedback" => ContextDrop::MCP::Prompts::InvestigateFeedback
      }.freeze

      RESOURCES = [
        {
          uri: "contextdrop://environments",
          name: "Connected ContextDrop Environments",
          description: "Host Rails environment and all federated remote ContextDrop environments.",
          mimeType: "application/json"
        },
        {
          uri: "contextdrop://feedbacks/new",
          name: "Unresolved New Feedbacks (All Connected Environments)",
          description: "List of unresolved ContextDrop feedback records currently in 'new' status across local and federated environments.",
          mimeType: "application/json"
        }
      ].freeze

      RESOURCE_TEMPLATES = [
        {
          uriTemplate: "contextdrop://feedbacks/{id}",
          name: "Feedback Record by ID",
          description: "Full ContextDrop feedback submission, DOM element snapshots, and attachment metadata for a local ID or '<env>:<id>'.",
          mimeType: "application/json"
        },
        {
          uriTemplate: "contextdrop://{environment}/feedbacks/new",
          name: "Unresolved New Feedbacks by Environment",
          description: "Unresolved 'new' feedback records scoped to a specific environment ('local', 'staging', 'production', 'all').",
          mimeType: "application/json"
        },
        {
          uriTemplate: "contextdrop://{environment}/feedbacks/{id}",
          name: "Feedback Record by Environment and ID",
          description: "Full ContextDrop feedback submission for a specific environment and ID.",
          mimeType: "application/json"
        }
      ].freeze

      class << self
        def call(raw_message)
          if raw_message.is_a?(Array)
            responses = raw_message.filter_map { |item| dispatch_single(item) }
            return responses.empty? ? nil : responses
          end

          dispatch_single(raw_message)
        end

        private

        def dispatch_single(msg)
          unless msg.is_a?(Hash)
            return jsonrpc_error(nil, -32_600, "Invalid Request: expected JSON object")
          end

          req = msg.transform_keys(&:to_s)
          id = req["id"]
          method = req["method"].to_s
          params = req["params"].is_a?(Hash) ? req["params"].transform_keys(&:to_s) : {}

          # Notifications have no `id` and expect no response
          return nil if method.start_with?("notifications/") || (id.nil? && !req.key?("id"))

          case method
          when "initialize"
            client_version = params["protocolVersion"].to_s.strip
            negotiated_version = client_version.empty? ? PROTOCOL_VERSION : client_version
            jsonrpc_result(id, {
              protocolVersion: negotiated_version,
              capabilities: {
                tools: { listChanged: false },
                resources: { subscribe: false, listChanged: false },
                prompts: { listChanged: false }
              },
              serverInfo: {
                name: "context_drop",
                version: ContextDrop::VERSION,
                environment: ContextDrop::MCP::EnvironmentRouter.host_environment,
                connectedEnvironments: ContextDrop::MCP::EnvironmentRouter.available_environments.map { |e| e[:name] }
              }
            })
          when "ping"
            jsonrpc_result(id, {})
          when "tools/list"
            jsonrpc_result(id, {
              tools: TOOLS.values.map { |tool_cls| tool_cls::DEFINITION }
            })
          when "tools/call"
            handle_tool_call(id, params)
          when "resources/list"
            jsonrpc_result(id, { resources: RESOURCES })
          when "resources/templates/list"
            jsonrpc_result(id, { resourceTemplates: RESOURCE_TEMPLATES })
          when "resources/read"
            handle_resource_read(id, params)
          when "prompts/list"
            jsonrpc_result(id, {
              prompts: PROMPTS.values.map { |prompt_cls| prompt_cls::DEFINITION }
            })
          when "prompts/get"
            handle_prompt_get(id, params)
          else
            jsonrpc_error(id, -32_601, "Method not found: #{method}")
          end
        rescue StandardError => e
          jsonrpc_error(id, -32_603, "Internal error: #{e.message}")
        end

        def handle_tool_call(id, params)
          tool_name = params["name"].to_s
          tool_cls = TOOLS[tool_name]
          unless tool_cls
            return jsonrpc_error(id, -32_602, "Unknown tool: #{tool_name}")
          end

          arguments = params["arguments"].is_a?(Hash) ? params["arguments"] : {}
          result = tool_cls.call(arguments)
          jsonrpc_result(id, result)
        end

        def handle_resource_read(id, params)
          uri = params["uri"].to_s.strip
          case uri
          when "contextdrop://environments"
            jsonrpc_result(id, {
              contents: [
                {
                  uri: uri,
                  mimeType: "application/json",
                  text: JSON.pretty_generate(
                    host_environment: ContextDrop::MCP::EnvironmentRouter.host_environment,
                    environments: ContextDrop::MCP::EnvironmentRouter.available_environments
                  )
                }
              ]
            })
          when "contextdrop://feedbacks/new"
            res = ContextDrop::MCP::Tools::ListFeedbacks.call("status" => "new", "limit" => 50, "environment" => "all")
            text = res[:content].first[:text]
            jsonrpc_result(id, {
              contents: [{ uri: uri, mimeType: "application/json", text: text }]
            })
          when %r{\Acontextdrop://([a-z0-9_-]+)/feedbacks/new\z}i
            env_name = Regexp.last_match(1).downcase
            res = ContextDrop::MCP::Tools::ListFeedbacks.call("status" => "new", "limit" => 50, "environment" => env_name)
            return jsonrpc_error(id, -32_602, extract_tool_error(res)) if res[:isError]

            jsonrpc_result(id, {
              contents: [{ uri: uri, mimeType: "application/json", text: res[:content].first[:text] }]
            })
          when %r{\Acontextdrop://feedbacks/([a-z0-9_:-]+)\z}i
            raw_id = Regexp.last_match(1)
            res = ContextDrop::MCP::Tools::GetFeedback.call("id" => raw_id, "include_images" => false)
            return jsonrpc_error(id, -32_602, extract_tool_error(res)) if res[:isError]

            jsonrpc_result(id, {
              contents: [{ uri: uri, mimeType: "application/json", text: res[:content].first[:text] }]
            })
          when %r{\Acontextdrop://([a-z0-9_-]+)/feedbacks/(\d+)\z}i
            env_name = Regexp.last_match(1).downcase
            feedback_id = Regexp.last_match(2)
            res = ContextDrop::MCP::Tools::GetFeedback.call(
              "id" => feedback_id,
              "environment" => env_name,
              "include_images" => false
            )
            return jsonrpc_error(id, -32_602, extract_tool_error(res)) if res[:isError]

            jsonrpc_result(id, {
              contents: [{ uri: uri, mimeType: "application/json", text: res[:content].first[:text] }]
            })
          else
            jsonrpc_error(id, -32_602, "Unknown resource URI: #{uri}")
          end
        end

        def extract_tool_error(res)
          raw = res.dig(:content, 0, :text).to_s
          parsed = JSON.parse(raw)
          parsed["error"] || raw
        rescue StandardError
          raw
        end

        def handle_prompt_get(id, params)
          prompt_name = params["name"].to_s
          prompt_cls = PROMPTS[prompt_name]
          unless prompt_cls
            return jsonrpc_error(id, -32_602, "Unknown prompt: #{prompt_name}")
          end

          arguments = params["arguments"].is_a?(Hash) ? params["arguments"] : {}
          result = prompt_cls.call(arguments)
          jsonrpc_result(id, result)
        rescue ContextDrop::Error => e
          jsonrpc_error(id, -32_602, e.message)
        end

        def jsonrpc_result(id, result)
          {
            jsonrpc: "2.0",
            id: id,
            result: result
          }
        end

        def jsonrpc_error(id, code, message)
          {
            jsonrpc: "2.0",
            id: id,
            error: {
              code: code,
              message: message
            }
          }
        end
      end
    end
  end
end
