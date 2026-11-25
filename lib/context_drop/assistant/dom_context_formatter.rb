# frozen_string_literal: true

module ContextDrop
  module Assistant
    module DomContextFormatter
      module_function

      def format(page_url, element_references, disclosure: :full)
        els = Array(element_references)
        return "" if els.empty?

        lines = ["---", "Pinned Live DOM Context (on `#{page_url || '/'}`):"]
        els.each_with_index do |raw_el, idx|
          el = if defined?(ContextDrop::MetadataSanitizer)
                 ContextDrop::MetadataSanitizer.sanitize_element_reference(raw_el)
               else
                 raw_el.is_a?(Hash) ? raw_el.transform_keys(&:to_s) : {}
               end
          str_el = el.transform_keys(&:to_s)
          meta = str_el["metadata"].is_a?(Hash) ? str_el["metadata"] : {}
          if disclosure == :friendly
            label = meta["friendly_label"].presence || meta["component_kind"].presence || "UI area"
            lines << "#{idx + 1}. #{label}"
          else
            lines << "#{idx + 1}. `<#{str_el['tag_name']}>` selector=`#{str_el['selector']}`"
          end
        end
        lines.join("\n")
      end
    end
  end
end