# frozen_string_literal: true

module ContextDrop
  module MCP
    module Prompts
      class InvestigateFeedback
        DEFINITION = {
          name: "investigate_feedback",
          description: "Generate a structured investigation brief for a ContextDrop feedback record (local or remote), including its originating environment, URL, DOM element selectors/paths, and visual screenshots.",
          arguments: [
            {
              name: "feedback_id",
              description: "ID of the ContextDrop::Feedback record to investigate, or '<environment>:<id>' (e.g. 'staging:42').",
              required: true
            },
            {
              name: "environment",
              description: "Optional environment name ('local', 'staging', 'production', etc.).",
              required: false
            }
          ]
        }.freeze

        def self.call(args = {})
          params = args.is_a?(Hash) ? args.transform_keys(&:to_s) : {}
          raw_id = params["feedback_id"] || params["id"]
          raise ContextDrop::Error, "Missing required argument: feedback_id" if raw_id.nil? || raw_id.to_s.strip.empty?

          target_env, feedback_id = ContextDrop::MCP::EnvironmentRouter.parse_target(raw_id, params["environment"])

          unless ContextDrop::MCP::EnvironmentRouter.local_target?(target_env)
            remote_cfg = ContextDrop::MCP::EnvironmentRouter.remote_config_for(target_env)
            raise ContextDrop::Error, "Unknown remote environment '#{target_env}'" unless remote_cfg

            return build_remote_prompt(target_env, remote_cfg, feedback_id)
          end

          feedback = ContextDrop::Feedback
                     .includes(:submitter, :element_references, :attachments)
                     .find_by(id: feedback_id)
          if !feedback || (feedback.respond_to?(:deleted?) && feedback.deleted?)
            raise ContextDrop::Error, "Feedback ##{feedback_id} not found"
          end

          env_name = ContextDrop::MCP::EnvironmentRouter.record_environment(feedback)
          qualified = ContextDrop::MCP::EnvironmentRouter.qualify_id(env_name, feedback.id)

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
            Investigate and resolve ContextDrop Feedback ##{feedback.id} (`#{qualified}`, environment: `#{env_name}`, status: #{feedback.status}).

            ## Reported Feedback
            - **Environment:** `#{env_name}`
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
            3. Inspect any attached screenshots (`get_feedback` with `id: "#{qualified}"`) to verify the visual layout issue.
            4. Propose and verify a fix, then call `update_feedback_status` (`id: "#{qualified}"`, `status: "resolved"`) once complete.
          PROMPT

          message_content = [{ type: "text", text: instructions }]

          feedback.attachments.each do |att|
            img_block = ContextDrop::MCP::Tools::GetFeedback.build_image_content_block(att)
            message_content << img_block if img_block
          end

          {
            description: "Investigation brief for ContextDrop Feedback #{qualified} on #{feedback.page_url}",
            messages: [
              {
                role: "user",
                content: message_content.size == 1 ? message_content.first : message_content
              }
            ]
          }
        end

        def self.build_remote_prompt(env_name, remote_cfg, feedback_id)
          tool_res = ContextDrop::MCP::Tools::GetFeedback.fetch_remote_feedback(env_name, remote_cfg, feedback_id, include_images: true)
          if tool_res[:isError]
            err_text = Array(tool_res[:content]).first&.dig(:text).to_s
            raise ContextDrop::Error, err_text
          end

          text_block = Array(tool_res[:content]).find { |b| b.is_a?(Hash) && b[:type].to_s == "text" }
          fb = text_block ? JSON.parse(text_block[:text].to_s) : {}
          qualified = ContextDrop::MCP::EnvironmentRouter.qualify_id(env_name, fb["id"] || feedback_id)

          els = Array(fb["element_references"])
          element_lines = if els.any?
                            els.map.with_index(1) do |el, idx|
                              <<~EL.strip
                                #{idx}. `<#{el['tag_name']}>` — Selector: `#{el['selector']}`
                                   - DOM Path: `#{el['dom_path'] || 'N/A'}`
                                   - Visible Text: #{el['text_content'].inspect}
                                   - Bounding Box: `#{JSON.generate(el['bounding_rect'] || {})}`
                                   - Attributes: `#{JSON.generate(el['attributes_snapshot'] || {})}`
                              EL
                            end.join("\n")
                          else
                            "None selected."
                          end

          instructions = <<~PROMPT
            Investigate and resolve ContextDrop Feedback ##{fb['id'] || feedback_id} (`#{qualified}`, environment: `#{env_name}`, status: #{fb['status']}).

            ## Reported Feedback
            - **Environment:** `#{env_name}`
            - **Message:** #{fb['message'].presence || '(No text message provided)'}
            - **Originating Page URL:** `#{fb['page_url']}`
            - **Submitter:** #{fb.dig('submitter', 'label') || 'Anonymous'}
            - **Submitted At:** #{fb['created_at']}
            - **Viewport / Metadata:** `#{JSON.generate(fb['metadata'] || {})}`

            ## Attached DOM Element References
            #{element_lines}

            ## Recommended Investigation Steps
            1. Locate the Rails route and controller action corresponding to `#{fb['page_url']}` in `config/routes.rb` and `app/controllers/`.
            2. Search the view templates (`app/views/`, ViewComponents, or frontend components) for the attached DOM selectors (`#{els.map { |e| e['selector'] }.join(', ')}`).
            3. Inspect any attached screenshots (`get_feedback` with `id: "#{qualified}"`) to verify the visual layout issue.
            4. Propose and verify a fix locally, then call `update_feedback_status` (`id: "#{qualified}"`, `status: "resolved"`) once complete.
          PROMPT

          image_blocks = Array(tool_res[:content]).select { |b| b.is_a?(Hash) && b[:type].to_s == "image" }
          message_content = [{ type: "text", text: instructions }] + image_blocks

          {
            description: "Investigation brief for ContextDrop Feedback #{qualified} on #{fb['page_url']}",
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
