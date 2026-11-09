# frozen_string_literal: true

module ContextDrop
  module MCP
    module Tools
      class GetFeedback
        MAX_INLINE_IMAGE_BYTES = 5 * 1024 * 1024 # 5 MB

        DEFINITION = {
          name: "get_feedback",
          description: "Retrieve a complete ContextDrop feedback record, all DOM ElementReference snapshots, and screenshots/images as multimodal MCP image blocks.",
          inputSchema: {
            type: "object",
            required: ["id"],
            properties: {
              id: {
                type: %w[integer string],
                description: "The ID of the ContextDrop::Feedback record."
              },
              include_images: {
                type: "boolean",
                description: "When true (default), includes attached screenshots and images as base64 MCP image content blocks."
              }
            }
          }
        }.freeze

        def self.call(args = {})
          params = args.is_a?(Hash) ? args.transform_keys(&:to_s) : {}
          feedback_id = params["id"] || params["feedback_id"]
          return error_result("Missing required parameter: id") if feedback_id.nil? || feedback_id.to_s.strip.empty?

          include_images = params.key?("include_images") ? !!params["include_images"] : true

          feedback = ContextDrop::Feedback
                     .includes(:submitter, :element_references, :attachments)
                     .find_by(id: feedback_id)

          return error_result("Feedback ##{feedback_id} not found") unless feedback

          payload = serialize_feedback(feedback)
          content_blocks = [
            {
              type: "text",
              text: JSON.pretty_generate(payload)
            }
          ]

          if include_images
            feedback.attachments.each do |att|
              img_block = build_image_content_block(att)
              content_blocks << img_block if img_block
            end
          end

          {
            content: content_blocks,
            isError: false
          }
        end

        def self.serialize_feedback(feedback)
          {
            id: feedback.id,
            status: feedback.status,
            message: feedback.message,
            page_url: feedback.page_url,
            user_agent: feedback.user_agent,
            submitter: {
              type: feedback.submitter_type,
              id: feedback.submitter_id,
              label: feedback.submitter_label
            },
            metadata: feedback.metadata || {},
            created_at: feedback.created_at&.iso8601,
            updated_at: feedback.updated_at&.iso8601,
            element_references: feedback.element_references.map do |el|
              {
                id: el.id,
                client_ref: el.client_ref,
                tag_name: el.tag_name,
                selector: el.selector,
                dom_path: el.dom_path,
                text_content: el.text_content,
                attributes_snapshot: el.attributes_snapshot || {},
                bounding_rect: el.bounding_rect || {},
                viewport: el.viewport || {},
                metadata: el.metadata || {},
                captured_at: el.captured_at&.iso8601
              }
            end,
            attachments: feedback.attachments.map do |att|
              attached = att.respond_to?(:file) && att.file.attached?
              {
                id: att.id,
                attachment_type: att.attachment_type,
                element_reference_id: att.element_reference_id,
                metadata: att.metadata || {},
                filename: attached ? att.file.filename.to_s : nil,
                content_type: attached ? att.file.content_type : nil,
                byte_size: attached ? att.file.byte_size : nil,
                created_at: att.created_at&.iso8601
              }
            end
          }
        end

        def self.build_image_content_block(attachment)
          return nil unless attachment.respond_to?(:file) && attachment.file.attached?
          return nil if attachment.file.byte_size.to_i > MAX_INLINE_IMAGE_BYTES

          raw_bytes = attachment.file.download
          return nil if raw_bytes.nil? || raw_bytes.empty?

          {
            type: "image",
            data: ContextDrop::Base64Util.strict_encode64(raw_bytes),
            mimeType: attachment.file.content_type || "image/png"
          }
        rescue StandardError
          nil
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
