# frozen_string_literal: true

module ContextDrop
  module SecretRedactor
    FILTERED_PARAMETER_KEYS = %i[
      api_key
      app_secret
      signing_secret
      mcp_api_key
      ownership_secret
      ownership_token
      ownership_tokens
      approval_token
      secrets_ciphertext
    ].freeze

    BEARER_PATTERN = /\b(Bearer\s+)[A-Za-z0-9._~+\/=-]{6,}/i
    TOKEN_PREFIX_PATTERN = /\b(?:sk-ant-[A-Za-z0-9_-]{8,}|sk-[A-Za-z0-9_-]{12,}|AIza[0-9A-Za-z_-]{16,}|whsec_[A-Za-z0-9_-]{8,})\b/
    KV_SECRET_PATTERN = /\b(ownership_tokens?|approval_token|api[_-]?key|app_secret|signing_secret|mcp_api_key|x-goog-api-key|x-api-key)(\s*[=:]\s*["']?)([^&\s"',;]+)/i

    module_function

    def scrub(input, extra_secrets: [])
      str = input.to_s
      return str if str.empty?

      out = str.dup
      literal_secrets(extra_secrets).each do |secret|
        out.gsub!(secret, "[FILTERED]")
      end

      out.gsub!(BEARER_PATTERN, '\1[FILTERED]')
      out.gsub!(TOKEN_PREFIX_PATTERN, "[FILTERED]")
      out.gsub!(KV_SECRET_PATTERN, '\1\2[FILTERED]')
      out
    end

    def literal_secrets(extra = [])
      candidates = Array(extra).dup
      if defined?(ContextDrop) && ContextDrop.respond_to?(:config)
        cfg = ContextDrop.config
        candidates << cfg.mcp_api_key if cfg.respond_to?(:mcp_api_key)
        candidates << cfg.ownership_secret if cfg.respond_to?(:ownership_secret)
      end
      %w[
        CONTEXT_DROP_MCP_API_KEY
        CONTEXT_DROP_SECRET_KEY
        CONTEXT_DROP_OWNERSHIP_SECRET
        CONTEXT_DROP_INTEGRATIONS_API_KEY
        CONTEXT_DROP_LLM_API_KEY
        CONTEXT_DROP_ASSISTANT_LLM_API_KEY
        CONTEXT_DROP_ASSISTANT_ANTHROPIC_API_KEY
        CONTEXT_DROP_ASSISTANT_OPENAI_API_KEY
        CONTEXT_DROP_ASSISTANT_GEMINI_API_KEY
        ANTHROPIC_API_KEY
        OPENAI_API_KEY
        GEMINI_API_KEY
      ].each do |env_name|
        candidates << ENV[env_name]
      end

      candidates
        .filter_map { |v| s = v.to_s.strip; s if s.length >= 8 }
        .uniq
        .sort_by { |s| -s.length }
    end
  end
end
