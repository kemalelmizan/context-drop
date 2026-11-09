# frozen_string_literal: true

module ContextDrop
  module MCP
    module Prompts
      class InvestigateFeedback
        DEFINITION = {
          name: "investigate_feedback",
          description: "Generate a structured investigation brief for a ContextDrop feedback record, including its originating URL, DOM element selectors/paths, and visual screenshots.",
          arguments: [
            {
              name: "feedback_id",
              description: "ID of the ContextDrop::Feedback record to investigate.",
              required: true
            }
          ]
        }.freeze

        def self.call(args = {})
          params = args.is_a?(Hash) ? args.transform_keys(&:to_s) : {}
          feedback_id = params["feedback_id"] || params["id"]
          raise ContextDrop::Error, "Missing required argument: feedback_id" if feedback_id.nil? || feedback_id.to_s.strip.empty?

          feedback = ContextDrop::Feedback
                     .includes(:submitter, :element_references, :attachments)
                     .find_by(id: feedback_id)
          raise ContextDrop::Error, "Feedback ##{feedback_id} not found" unless feedback

          element_lines = if feedback.element_references.any?
                            feedback.element_references.map.with_index(1) do |el, idx|
                              <<~EL.strip
                                #{idx}. `<#{el.tag_name}>` — Selector: `#{el.selector}`
                                   - DOM Path: `#{el.dom_path || 'N/A'}`
                                   - Visible Text: #{el.text_content.inspect}
                                   - Bounding Box: `#{JSON.generate(el.bounding_rect || {})}`
                                   - Attributes: `#{JSON.generate(el.attributes_snapshot || {})}`
                              EL
                            end.join("\n")
                          else
                            "None selected."
                          end

          instructions = <<~PROMPT
            Investigate and resolve ContextDrop Feedback ##{feedback.id} (status: #{feedback.status}).

            ## Reported Feedback
            - **Message:** #{feedback.message.presence || '(No text message provided)'}
            - **Originating Page URL:** `#{feedback.page_url}`
            - **Submitter:** #{feedback.submitter_label}
            - **Submitted At:** #{feedback.created_at&.iso8601}
            - **Viewport / Metadata:** `#{JSON.generate(feedback.metadata || {})}`

            ## Attached DOM Element References
            #{element_lines}

            ## Recommended Investigation Steps
            1. Locate the Rails route and controller action corresponding to `#{feedback.page_url}` in `config/routes.rb` and `app/controllers/`.
            2. Search the view templates (`app/views/`, ViewComponents, or frontend components) for the attached DOM selectors (`#{feedback.element_references.map(&:selector).join(', ')}`) and structural DOM paths (`#{feedback.element_references.map(&:dom_path).compact.join(', ')}`).
            3. Inspect any attached screenshots (`get_feedback` with `id: #{feedback.id}`) to verify the visual layout issue.
            4. Propose and verify a fix, then call `update_feedback_status` (`id: #{feedback.id}`, `status: "resolved"`) once complete.
          PROMPT

          message_content = [{ type: "text", text: instructions }]

          feedback.attachments.each do |att|
            img_block = ContextDrop::MCP::Tools::GetFeedback.build_image_content_block(att)
            message_content << img_block if img_block
          end

          {
            description: "Investigation brief for ContextDrop Feedback ##{feedback.id} on #{feedback.page_url}",
            messages: [
              {
                role: "user",
                content: message_content.size == 1 ? message_content.first : message_content
              }
            ]
          }
        end
      end
    end
  end
end
