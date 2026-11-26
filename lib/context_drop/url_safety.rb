# frozen_string_literal: true

require "uri"

module ContextDrop
  module UrlSafety
    MAX_URL_LENGTH = 2048
    MAX_PROMPT_URL_LENGTH = 512
    CONTROL_CHARS_RE = /[\r\n\0\t]/

    module_function

    def valid_page_url?(raw)
      !safe_href(raw).nil?
    end

    # Permits only single-slash relative paths (`/checkout`) or valid `http://` / `https://` URLs.
    def safe_href(raw)
      str = raw.to_s.strip
      return nil if str.empty? || str.length > MAX_URL_LENGTH
      return nil if CONTROL_CHARS_RE.match?(str)
      return str if str.match?(/\A\/(?!\/)/)

      safe_external_http_url(str)
    end

    # Permits strictly `http://` or `https://` URLs with a non-empty host and no userinfo.
    def safe_external_http_url(raw)
      str = raw.to_s.strip
      return nil if str.empty? || str.length > MAX_URL_LENGTH
      return nil if CONTROL_CHARS_RE.match?(str)

      uri = URI.parse(str)
      return nil unless uri.is_a?(URI::HTTP) || uri.is_a?(URI::HTTPS)
      return nil if uri.host.to_s.strip.empty?
      return nil unless uri.userinfo.nil?

      str
    rescue URI::InvalidURIError
      nil
    end

    # Permits strictly same-host single-slash relative paths (`/app/orders?page=2`), rejecting `//` and schemes.
    def safe_relative_path(raw)
      str = raw.to_s.strip
      return nil if str.empty? || str.length > MAX_URL_LENGTH
      return nil if CONTROL_CHARS_RE.match?(str)
      return nil unless str.match?(/\A\/(?!\/)/)

      str
    end

    # Strips newlines/control characters and bounds length before interpolating a URL into an LLM prompt.
    def sanitize_prompt_url(raw, fallback: "unknown")
      cleaned = raw.to_s.gsub(/[\r\n\0\t]+/, " ").gsub(/\s+/, " ").strip
      return fallback if cleaned.empty?

      cleaned[0, MAX_PROMPT_URL_LENGTH]
    end
  end
end
