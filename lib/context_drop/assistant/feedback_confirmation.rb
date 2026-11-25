# frozen_string_literal: true

module ContextDrop
  module Assistant
    class FeedbackConfirmation
      DEFAULT_TEMPLATES = [
        'Thanks — we recorded your feedback **#{{id}}** ({{environment}}). ' \
        'Status: {{status}} · {{pins_count}} pinned area(s) · {{attachments_count}} attachment(s) · captured {{created_at}}.',
        'Your report **#{{id}}** is saved. We are tracking it as **{{status}}** with {{pins_count}} pin(s) and ' \
        '{{attachments_count}} file(s) from this page.',
        'Feedback **#{{id}}** received. Reference: {{environment}} · {{status}} · page {{page_url}} · {{pins_summary}}.'
      ].freeze

      DEFAULT_GUIDANCE = [
        "Pin the part of the page that's wrong, add a short note, then press Send — we'll attach structured context automatically.",
        "You can attach a screenshot or highlight a button or field before sending. Your report won't include passwords or hidden fields.",
        "After you send, you'll get a reference number and a summary of what ContextDrop captured (pins, screenshots, page URL)."
      ].freeze

      class << self
        def render_for_feedback(feedback, smart: false)
          template = pick_template(ContextDrop.config.assistant_feedback_confirmations, seed: feedback.id.to_i)
          metadata = public_metadata(feedback, smart: smart)
          {
            message: interpolate(template, metadata),
            metadata: metadata
          }
        end

        def render_guidance
          templates = Array(ContextDrop.config.assistant_feedback_guidance)
          templates = DEFAULT_GUIDANCE if templates.empty?
          pick = templates.sample(random: Random.new)
          { message: pick, metadata: {} }
        end

        private

        def pick_template(custom, seed: nil)
          list = Array(custom)
          list = DEFAULT_TEMPLATES if list.empty?
          rng = seed.nil? ? Random.new : Random.new(seed)
          list.sample(random: rng)
        end

        def public_metadata(feedback, smart:)
          pins = Array(feedback.element_references)
          pin_labels = pins.map do |el|
            if smart && el.metadata.is_a?(Hash) && el.metadata["friendly_label"].present?
              el.metadata["friendly_label"].to_s
            elsif smart
              el.metadata.is_a?(Hash) && el.metadata["component_kind"].present? ? el.metadata["component_kind"].to_s : "Area on page"
            else
              el.selector.to_s.presence || el.tag_name.to_s
            end
          end

          {
            id: feedback.id,
            environment: feedback.respond_to?(:environment_name) ? feedback.environment_name : feedback.environment.to_s,
            status: feedback.status.to_s,
            page_url: feedback.page_url.to_s,
            pins_count: pins.size,
            attachments_count: feedback.attachments.size,
            pins_summary: pin_labels.empty? ? "no pins" : pin_labels.join(", "),
            created_at: feedback.created_at&.iso8601 || Time.current.utc.iso8601,
            selection_mode: smart ? "smart" : "verbose"
          }
        end

        def interpolate(template, metadata)
          out = template.to_s.dup
          metadata.each do |key, value|
            out.gsub!("{{#{key}}}", value.to_s)
          end
          out
        end
      end
    end
  end
end