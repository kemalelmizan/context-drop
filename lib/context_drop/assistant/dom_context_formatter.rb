# frozen_string_literal: true

module ContextDrop
  module Assistant
    module DomContextFormatter
      module_function

      def format(page_url, element_references)
        els = Array(element_references)
        return "" if els.empty?

        lines = ["---", "Pinned Live DOM Context (on `#{page_url || '/'}`):"]
        els.each_with_index do |raw_el, idx|
          el = if defined?(ContextDrop::MetadataSanitizer)
                 ContextDrop::MetadataSanitizer.sanitize_element_reference(raw_el)
               else
                 raw_el.is_a?(Hash) ? raw_el.transform_keys(&:to_s) : {}
               end
          lines << "#{idx + 1}. `<#{el[:tag_name] || el['tag_name']}>` selector=`#{el[:selector] || el['selector']}`"
        end
        lines.join("\n")
      end
    end
  end
end