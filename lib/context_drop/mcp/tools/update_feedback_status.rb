# frozen_string_literal: true

module ContextDrop
  module MCP
    module Tools
      class UpdateFeedbackStatus
        DEFINITION = {
          name: "update_feedback_status",
          description: "Transition a ContextDrop feedback record's status ('new', 'reviewed', 'resolved', 'dismissed') in local or remote environments.",
          inputSchema: {
            type: "object",
            required: %w[id status],
            properties: {
              id: {
                type: %w[integer string],
                description: "The ID of the ContextDrop::Feedback record, or a qualified '<environment>:<id>' string (e.g. 'staging:42')."
              },
              environment: {
                type: "string",
                description: "Optional environment name ('local', 'staging', 'production', etc.)."
              },
              status: {
                type: "string",
                enum: %w[new reviewed resolved dismissed],
                description: "Target workflow status."
              }
            }
          }
        }.freeze

        def self.call(args = {})
          params = args.is_a?(Hash) ? args.transform_keys(&:to_s) : {}
          raw_id = params["id"] || params["feedback_id"]
          next_status = params["status"].to_s.strip

          return error_result("Missing required parameter: id") if raw_id.nil? || raw_id.to_s.strip.empty?

          unless ContextDrop::Feedback::STATUSES.include?(next_status)
            return error_result(
              "Invalid status '#{next_status}'. Must be one of: #{ContextDrop::Feedback::STATUSES.join(', ')}"
            )
          end

          target_env, feedback_id = ContextDrop::MCP::EnvironmentRouter.parse_target(raw_id, params["environment"])

          unless ContextDrop::MCP::EnvironmentRouter.local_target?(target_env)
            remote_cfg = ContextDrop::MCP::EnvironmentRouter.remote_config_for(target_env)
            return error_result("Unknown remote environment '#{target_env}'") unless remote_cfg

            begin
              res = ContextDrop::MCP::RemoteClient.call_tool(target_env, remote_cfg, "update_feedback_status", {
                "id" => feedback_id,
                "status" => next_status
              })
              return res if res[:isError]

              updated_blocks = Array(res[:content]).map do |block|
                if block.is_a?(Hash) && block[:type].to_s == "text"
                  begin
                    parsed = JSON.parse(block[:text].to_s)
                    if parsed.is_a?(Hash)
                      parsed["environment"] = target_env
                      parsed["qualified_id"] = ContextDrop::MCP::EnvironmentRouter.qualify_id(target_env, parsed["id"] || feedback_id)
                      next block.merge(text: JSON.pretty_generate(parsed))
                    end
                  rescue JSON::ParserError
                    # Keep original block
                  end
                end
                block
              end
              return { content: updated_blocks, isError: false }
            rescue ContextDrop::MCP::RemoteClient::RemoteError => e
              return error_result(e.message)
            end
          end

          feedback = ContextDrop::Feedback.find_by(id: feedback_id)
          if !feedback || (feedback.respond_to?(:deleted?) && feedback.deleted?)
            return error_result("Feedback ##{feedback_id} not found")
          end

          previous_status = feedback.status
          feedback.update!(status: next_status)
          env_name = ContextDrop::MCP::EnvironmentRouter.record_environment(feedback)

          {
            content: [
              {
                type: "text",
                text: JSON.pretty_generate(
                  id: feedback.id,
                  qualified_id: ContextDrop::MCP::EnvironmentRouter.qualify_id(env_name, feedback.id),
                  environment: env_name,
                  previous_status: previous_status,
                  status: feedback.status,
                  page_url: feedback.page_url,
                  updated_at: feedback.updated_at&.iso8601
                )
              }
            ],
            isError: false
          }
        end

        def self.error_result(msg)
          {
            content: [{ type: "text", text: JSON.generate(error: msg) }],
            isError: true
          }
        end
      end
    end
  end
end
