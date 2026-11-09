# frozen_string_literal: true

require "time"

module ContextDrop
  class MetadataSanitizer
    ALLOWED_ATTRIBUTE_KEYS = %w[
      id
      class
      role
      name
      type
      href
      title
      placeholder
      alt
      data-testid
      data-test
      data-cy
      data-qa
      data-turbo-frame
    ].freeze

    FORBIDDEN_METADATA_KEYS = %w[
      outerhtml
      innerhtml
      value
      defaultvalue
      password
      secret
      token
      authorization
      cookie
    ].freeze

    MAX_TEXT_LENGTH = 500
    MAX_SELECTOR_LENGTH = 500
    MAX_DOM_PATH_LENGTH = 1000
    MAX_ATTR_VALUE_LENGTH = 300

    class SensitiveElementError < ContextDrop::Error; end

    class << self
      def sanitize_element_reference(raw_params)
        params = stringify_hash(raw_params)
        tag_name = params["tag_name"].to_s.strip.downcase
        raw_attrs = stringify_hash(params["attributes_snapshot"] || params["attributes"] || {})

        if sensitive_element?(tag_name, raw_attrs, params["selector"].to_s)
          raise SensitiveElementError, "Cannot attach excluded or sensitive DOM element"
        end

        {
          client_ref: truncate_str(params["client_ref"], 128),
          tag_name: tag_name,
          selector: truncate_str(params["selector"], MAX_SELECTOR_LENGTH).to_s,
          dom_path: truncate_str(params["dom_path"], MAX_DOM_PATH_LENGTH),
          text_content: sanitize_text_content(tag_name, params["text_content"]),
          attributes_snapshot: sanitize_attributes(raw_attrs),
          bounding_rect: sanitize_bounding_rect(params["bounding_rect"]),
          viewport: sanitize_viewport(params["viewport"]),
          metadata: sanitize_generic_hash(params["metadata"]),
          captured_at: parse_timestamp(params["captured_at"])
        }
      end

      def sanitize_feedback_metadata(raw_metadata)
        sanitize_generic_hash(raw_metadata)
      end

      def sanitize_attachment_metadata(raw_metadata)
        sanitize_generic_hash(raw_metadata)
      end

      def sensitive_element?(tag_name, attrs, selector = "")
        input_type = attrs["type"].to_s.strip.downcase
        return true if tag_name == "input" && %w[password hidden].include?(input_type)
        return true if attrs.key?("data-feedback-ignore") || attrs.key?("data-feedback-sensitive")

        autocomplete = attrs["autocomplete"].to_s.strip.downcase
        return true if autocomplete.start_with?("cc-")

        sel_down = selector.to_s.downcase
        return true if sel_down.include?("data-feedback-ignore") || sel_down.include?("data-feedback-sensitive")

        false
      end

      def sanitize_attributes(raw_attrs)
        attrs = stringify_hash(raw_attrs)
        sanitized = {}

        attrs.each do |key, value|
          normalized_key = key.to_s.strip.downcase
          next if normalized_key.empty?
          next if FORBIDDEN_METADATA_KEYS.include?(normalized_key)
          next if normalized_key.start_with?("on")

          allowed = ALLOWED_ATTRIBUTE_KEYS.include?(normalized_key) ||
                    (normalized_key.start_with?("aria-") && normalized_key != "aria-hidden")
          next unless allowed

          str_val = value.to_s.strip
          if normalized_key == "href" && str_val.downcase.start_with?("javascript:", "data:")
            next
          end

          sanitized[normalized_key] = truncate_str(str_val, MAX_ATTR_VALUE_LENGTH)
        end

        sanitized
      end

      def sanitize_bounding_rect(raw_rect)
        rect = stringify_hash(raw_rect)
        return {} if rect.empty?

        result = {}
        %w[x y width height].each do |coord|
          next unless rect.key?(coord) && !rect[coord].nil?

          num = Float(rect[coord])
          result[coord] = num.finite? ? num.round(2) : 0.0
        rescue ArgumentError, TypeError
          next
        end
        result
      end

      def sanitize_viewport(raw_viewport)
        vp = stringify_hash(raw_viewport)
        return {} if vp.empty?

        result = {}
        %w[width height].each do |dim|
          next unless vp.key?(dim) && !vp[dim].nil?

          num = Integer(Float(vp[dim]))
          result[dim] = num.positive? ? num : 0
        rescue ArgumentError, TypeError
          next
        end
        result
      end

      def sanitize_generic_hash(input, depth = 0)
        return {} if depth > 4 || !input.is_a?(Hash)

        cleaned = {}
        input.each do |k, v|
          key_str = k.to_s.strip
          next if key_str.empty?
          next if FORBIDDEN_METADATA_KEYS.include?(key_str.downcase)

          cleaned[key_str] = case v
                             when Hash
                               sanitize_generic_hash(v, depth + 1)
                             when Array
                               v.first(25).map { |item| item.is_a?(Hash) ? sanitize_generic_hash(item, depth + 1) : sanitize_scalar(item) }
                             else
                               sanitize_scalar(v)
                             end
        end
        cleaned
      end

      private

      def sanitize_text_content(tag_name, text)
        return nil if text.nil?
        return nil if %w[input textarea select password].include?(tag_name)

        normalized = text.to_s.gsub(/\s+/, " ").strip
        return nil if normalized.empty?

        truncate_str(normalized, MAX_TEXT_LENGTH)
      end

      def sanitize_scalar(val)
        case val
        when Numeric, TrueClass, FalseClass, NilClass
          val
        else
          truncate_str(val.to_s, MAX_TEXT_LENGTH)
        end
      end

      def truncate_str(value, max_len)
        return nil if value.nil?

        str = value.to_s
        str.length > max_len ? str[0, max_len] : str
      end

      def parse_timestamp(val)
        return Time.now.utc if val.nil? || val.to_s.strip.empty?
        return val if val.is_a?(Time)

        Time.iso8601(val.to_s)
      rescue ArgumentError
        Time.now.utc
      end

      def stringify_hash(obj)
        if obj.respond_to?(:to_unsafe_h)
          obj.to_unsafe_h.transform_keys(&:to_s)
        elsif obj.is_a?(Hash)
          obj.transform_keys(&:to_s)
        else
          {}
        end
      end
    end
  end
end
