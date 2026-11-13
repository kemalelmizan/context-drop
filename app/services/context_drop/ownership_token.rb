# frozen_string_literal: true

require "openssl"
require "securerandom"

module ContextDrop
  module OwnershipToken
    MAX_TOKENS_HEADER_COUNT = 50
    TOKEN_DOMAIN = "cd_own:v1"

    class << self
      def generate(feedback_id, secret: nil)
        id_str = feedback_id.to_s.strip
        raise ArgumentError, "feedback_id cannot be blank" if id_str.empty?

        nonce = SecureRandom.hex(8)
        sig = compute_hmac(id_str, nonce, secret || resolved_secret)
        "#{id_str}.#{nonce}.#{sig}"
      end

      def valid?(token, feedback_id, secret: nil)
        return false if token.nil? || feedback_id.nil?

        raw_token = token.to_s.strip
        target_id = feedback_id.to_s.strip
        return false if raw_token.empty? || target_id.empty?

        id_part, nonce_part, sig_part = raw_token.split(".", 3)
        return false if id_part.nil? || nonce_part.nil? || sig_part.nil?
        return false unless id_part == target_id
        return false if nonce_part.empty? || sig_part.empty?

        expected = compute_hmac(target_id, nonce_part, secret || resolved_secret)
        ActiveSupport::SecurityUtils.secure_compare(sig_part, expected)
      rescue StandardError
        false
      end

      def extract_verified_ids(raw_tokens, secret: nil)
        tokens = case raw_tokens
                 when Array
                   raw_tokens
                 when String
                   raw_tokens.split(",")
                 else
                   []
                 end

        key = secret || resolved_secret
        verified = []

        tokens.first(MAX_TOKENS_HEADER_COUNT).each do |raw|
          tok = raw.to_s.strip
          next if tok.empty?

          id_part, nonce_part, sig_part = tok.split(".", 3)
          next if id_part.nil? || nonce_part.nil? || sig_part.nil?
          next if id_part.empty? || nonce_part.empty? || sig_part.empty?

          expected = compute_hmac(id_part, nonce_part, key)
          verified << id_part if ActiveSupport::SecurityUtils.secure_compare(sig_part, expected)
        end

        verified.uniq
      rescue StandardError
        []
      end

      def find_token_for(raw_tokens, feedback_id, secret: nil)
        tokens = case raw_tokens
                 when Array
                   raw_tokens
                 when String
                   raw_tokens.split(",")
                 else
                   []
                 end

        key = secret || resolved_secret
        tokens.first(MAX_TOKENS_HEADER_COUNT).each do |raw|
          tok = raw.to_s.strip
          return tok if valid?(tok, feedback_id, secret: key)
        end
        nil
      end

      def resolved_secret
        configured = ContextDrop.config.respond_to?(:ownership_secret) ? ContextDrop.config.ownership_secret.to_s.strip : ""
        return configured unless configured.empty?

        env_secret = ENV["CONTEXT_DROP_SECRET_KEY"].to_s.strip
        return env_secret unless env_secret.empty?

        if defined?(Rails) && Rails.respond_to?(:application) && Rails.application
          rails_secret = Rails.application.secret_key_base.to_s.strip rescue ""
          return rails_secret unless rails_secret.empty?
        end

        fallback_secret
      end

      private

      def compute_hmac(id_str, nonce, secret)
        OpenSSL::HMAC.hexdigest("SHA256", secret.to_s, "#{TOKEN_DOMAIN}:#{id_str}:#{nonce}")
      end

      def fallback_secret
        @fallback_secret ||= SecureRandom.hex(32)
      end
    end
  end
end

