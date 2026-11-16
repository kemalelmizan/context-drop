# frozen_string_literal: true

module ContextDrop
  module MCP
    module Tools
      class AddFeedbackComment
        DEFINITION = {
          name: "add_feedback_comment",
          description: "Add a follow-up comment to a ContextDrop feedback record (optionally transitioning its status, defaulting to 'updated' unless specified).",
          inputSchema: {
            type: "object",
            required: %w[id body],
            properties: {
              id: {
                type: %w[integer string],
                description: "The ID of the ContextDrop::Feedback record, or a qualified '<environment>:<id>' string."
              },
              environment: {
                type: "string",
                description: "Optional environment name ('local', 'staging', 'production', etc.)."
              },
              body: {
                type: "string",
                description: "Comment text."
              },
              author_label: {
                type: "string",
                description: "Optional display label for the comment author (defaults to 'AI Agent')."
              },
              status: {
                type: "string",
                enum: %w[new updated fixed reviewed dismissed],
                description: "Optional target workflow status (defaults to 'updated')."
              }
            }
          }
        }.freeze

        def self.call(args = {})
          params = args.is_a?(Hash) ? args.transform_keys(&:to_s) : {}
          raw_id = params["id"] || params["feedback_id"]
          body = params["body"].to_s.strip
          author_label = params["author_label"].to_s.strip.presence || "AI Agent"
          next_status = params["status"].to_s.strip.presence || "updated"

          return error_result("Missing required parameter: id") if raw_id.nil? || raw_id.to_s.strip.empty?
          return error_result("Missing required parameter: body") if body.empty?

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
              remote_args = {
                "id" => feedback_id,
                "body" => body,
                "author_label" => author_label,
                "status" => next_status
              }
              res = ContextDrop::MCP::RemoteClient.call_tool(target_env, remote_cfg, "add_feedback_comment", remote_args)
              return res if res[:isError]

              updated_blocks = Array(res[:content]).map do |block|
                if block.is_a?(Hash) && block[:type].to_s == "text"
                  begin
                    parsed = JSON.parse(block[:text].to_s)
                    if parsed.is_a?(Hash)
                      parsed["environment"] = target_env
                      parsed["qualified_id"] = ContextDrop::MCP::EnvironmentRouter.qualify_id(target_env, parsed["feedback_id"] || feedback_id)
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

          comment = nil
          ContextDrop::Feedback.transaction do
            comment = feedback.comments.create!(
              author_type: "Agent",
              author_label: author_label,
              body: body,
              metadata: {}
            )
            feedback.update!(status: next_status)
          end

          env_name = ContextDrop::MCP::EnvironmentRouter.record_environment(feedback)

          {
            content: [
              {
                type: "text",
                text: JSON.pretty_generate(
                  id: comment.id,
                  feedback_id: feedback.id,
                  qualified_id: ContextDrop::MCP::EnvironmentRouter.qualify_id(env_name, feedback.id),
                  environment: env_name,
                  author_label: comment.display_author_label,
                  body: comment.body,
                  status: feedback.status,
                  created_at: comment.created_at&.iso8601
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
