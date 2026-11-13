# frozen_string_literal: true

$LOAD_PATH.unshift File.expand_path("../lib", __dir__)
$LOAD_PATH.unshift File.expand_path("../app/helpers", __dir__)
$LOAD_PATH.unshift File.expand_path("../app/services", __dir__)
$LOAD_PATH.unshift File.expand_path("../app/models", __dir__)
$LOAD_PATH.unshift File.expand_path("../app/controllers", __dir__)

# Minimal ActiveSupport-like extensions when running outside a full Rails bundle
unless "".respond_to?(:blank?)
  class Object
    def blank?
      respond_to?(:empty?) ? !!empty? : !self
    end

    def present?
      !blank?
    end

    def presence
      present? ? self : nil
    end

    def try(method_name, *args, &block)
      respond_to?(method_name) ? public_send(method_name, *args, &block) : nil
    end
  end

  class NilClass
    def blank?
      true
    end
  end

  class String
    def blank?
      strip.empty?
    end
  end
end

unless defined?(ActiveSupport::SecurityUtils)
  module ActiveSupport
    module SecurityUtils
      def self.secure_compare(a, b)
        return false unless a.bytesize == b.bytesize

        l = a.unpack("C*")
        res = 0
        b.each_byte { |byte| res |= byte ^ l.shift }
        res.zero?
      end
    end
  end
end

require "context_drop"
require "context_drop/widget_helper"
require "context_drop/metadata_sanitizer"
require "context_drop/upload_validator"
require "context_drop/ownership_token"
