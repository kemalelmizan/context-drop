# frozen_string_literal: true

module ContextDrop
  module MCP
    module Tools
      class UpdateFeedbackStatus
        DEFINITION = {
          name: "update_feedback_status",
          description: "Transition a ContextDrop feedback record's status ('new', 'reviewed', 'resolved', 'dismissed').",
          inputSchema: {
            type: "object",
            required: %w[id status],
            properties: {
              id: {
                type: %w[integer string],
                description: "The ID of the ContextDrop::Feedback record."
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
          feedback_id = params["id"] || params["feedback_id"]
          next_status = params["status"].to_s.strip

          return error_result("Missing required parameter: id") if feedback_id.nil? || feedback_id.to_s.strip.empty?

          unless ContextDrop::Feedback::STATUSES.include?(next_status)
            return error_result(
              "Invalid status '#{next_status}'. Must be one of: #{ContextDrop::Feedback::STATUSES.join(', ')}"
            )
          end

          feedback = ContextDrop::Feedback.find_by(id: feedback_id)
          return error_result("Feedback ##{feedback_id} not found") unless feedback

          previous_status = feedback.status
          feedback.update!(status: next_status)

          {
            content: [
              {
                type: "text",
                text: JSON.pretty_generate(
                  id: feedback.id,
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
