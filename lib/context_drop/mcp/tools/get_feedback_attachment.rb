# frozen_string_literal: true

module ContextDrop
  module MCP
    module Tools
      class GetFeedbackAttachment
        DEFINITION = {
          name: "get_feedback_attachment",
          description: "Retrieve a specific ContextDrop::Attachment record and its binary image/screenshot as an MCP image content block from local or remote environments.",
          inputSchema: {
            type: "object",
            required: ["attachment_id"],
            properties: {
              attachment_id: {
                type: %w[integer string],
                description: "The ID of the ContextDrop::Attachment record, or a qualified '<environment>:<attachment_id>' string (e.g. 'staging:201')."
              },
              environment: {
                type: "string",
                description: "Optional environment name ('local', 'staging', 'production', etc.)."
              }
            }
          }
        }.freeze

        def self.call(args = {})
          params = args.is_a?(Hash) ? args.transform_keys(&:to_s) : {}
          raw_att_id = params["attachment_id"] || params["id"]
          return error_result("Missing required parameter: attachment_id") if raw_att_id.nil? || raw_att_id.to_s.strip.empty?

          target_env, att_id = ContextDrop::MCP::EnvironmentRouter.parse_target(raw_att_id, params["environment"])

          unless ContextDrop::MCP::EnvironmentRouter.local_target?(target_env)
            remote_cfg = ContextDrop::MCP::EnvironmentRouter.remote_config_for(target_env)
            return error_result("Unknown remote environment '#{target_env}'") unless remote_cfg

            begin
              return ContextDrop::MCP::RemoteClient.call_tool(target_env, remote_cfg, "get_feedback_attachment", {
                "attachment_id" => att_id
              })
            rescue ContextDrop::MCP::RemoteClient::RemoteError => e
              return error_result(e.message)
            end
          end

          attachment = ContextDrop::Attachment.includes(:element_reference).find_by(id: att_id)
          return error_result("Attachment ##{att_id} not found") unless attachment
          if attachment.respond_to?(:feedback) && attachment.feedback.respond_to?(:deleted?) && attachment.feedback.deleted?
            return error_result("Attachment ##{att_id} not found")
          end

          env_name = ContextDrop::MCP::EnvironmentRouter.host_environment
          attached = attachment.respond_to?(:file) && attachment.file.attached?
          meta_payload = {
            id: attachment.id,
            qualified_id: ContextDrop::MCP::EnvironmentRouter.qualify_id(env_name, attachment.id),
            environment: env_name,
            feedback_id: attachment.feedback_id,
            element_reference_id: attachment.element_reference_id,
            element_selector: attachment.element_reference&.selector,
            attachment_type: attachment.attachment_type,
            metadata: attachment.metadata || {},
            filename: attached ? attachment.file.filename.to_s : nil,
            content_type: attached ? attachment.file.content_type : nil,
            byte_size: attached ? attachment.file.byte_size : nil
          }

          blocks = [{ type: "text", text: JSON.pretty_generate(meta_payload) }]

          if attached
            raw_bytes = attachment.file.download
            if raw_bytes && !raw_bytes.empty?
              blocks << {
                type: "image",
                data: ContextDrop::Base64Util.strict_encode64(raw_bytes),
                mimeType: attachment.file.content_type || "image/png"
              }
            end
          end

          {
            content: blocks,
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
