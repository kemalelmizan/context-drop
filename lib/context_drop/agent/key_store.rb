# frozen_string_literal: true

require "json"
require "openssl"
require "securerandom"
require "fileutils"

module ContextDrop
  module Agent
    class KeyStore
      PROVIDERS = {
        "anthropic" => {
          label: "Anthropic Claude",
          env_keys: %w[ANTHROPIC_API_KEY],
          default_model: "claude-sonnet-4-20250514",
          models: %w[claude-sonnet-4-20250514 claude-3-7-sonnet-latest claude-3-5-haiku-latest],
          supports_base_url: false
        },
        "gemini" => {
          label: "Google Gemini",
          env_keys: %w[GEMINI_API_KEY GOOGLE_API_KEY],
          default_model: "gemini-2.5-pro",
          models: %w[gemini-2.5-pro gemini-2.5-flash],
          supports_base_url: false
        },
        "openai" => {
          label: "OpenAI",
          env_keys: %w[OPENAI_API_KEY],
          default_model: "gpt-4.1",
          models: %w[gpt-4.1 gpt-4.1-mini o4-mini],
          supports_base_url: false
        },
        "custom" => {
          label: "OpenAI-Compatible (OpenRouter / Ollama)",
          env_keys: %w[CONTEXT_DROP_LLM_API_KEY OPENROUTER_API_KEY],
          env_base_url: "CONTEXT_DROP_LLM_BASE_URL",
          default_base_url: "https://openrouter.ai/api/v1",
          default_model: "anthropic/claude-sonnet-4",
          models: %w[anthropic/claude-sonnet-4 google/gemini-2.5-pro openai/gpt-4.1 llama3.3],
          supports_base_url: true
        }
      }.freeze

      CIPHER_NAME = "aes-256-gcm"

      def initialize(store_path: nil, env_vars: ENV)
        @store_path = (store_path || ContextDrop.config.resolved_key_store_path).to_s
        @master_key_path = "#{@store_path}.key"
        @env_vars = env_vars
      end

      # Returns safe, masked provider metadata for the browser UI. Never exposes raw API keys.
      def providers_status
        vault = read_vault_hash
        active = vault["_active_provider"].to_s

        list = PROVIDERS.map do |id, meta|
          vault_entry = vault[id].is_a?(Hash) ? vault[id] : {}
          vault_key = vault_entry["api_key"].to_s.strip
          env_key_name, env_key_val = resolve_env_key(meta[:env_keys])

          source = if !vault_key.empty?
                     "vault"
                   elsif !env_key_val.empty?
                     "env"
                   elsif id == "custom" && loopback_base_url?(vault_entry["base_url"] || @env_vars[meta[:env_base_url].to_s])
                     "local_no_key"
                   end

          raw_key = !vault_key.empty? ? vault_key : env_key_val
          resolved_base_url = if meta[:supports_base_url]
                                (vault_entry["base_url"].to_s.strip.empty? ? nil : vault_entry["base_url"].to_s.strip) ||
                                  (@env_vars[meta[:env_base_url].to_s].to_s.strip.empty? ? nil : @env_vars[meta[:env_base_url].to_s].to_s.strip) ||
                                  meta[:default_base_url]
                              end

          {
            id: id,
            label: meta[:label],
            configured: !source.nil?,
            source: source,
            env_var_hint: env_key_name || meta[:env_keys].first,
            masked_key: mask_secret(raw_key),
            model: (vault_entry["model"].to_s.strip.empty? ? meta[:default_model] : vault_entry["model"].to_s.strip),
            default_model: meta[:default_model],
            models: meta[:models],
            supports_base_url: meta[:supports_base_url],
            base_url: resolved_base_url
          }
        end

        if active.empty? || !PROVIDERS.key?(active)
          first_configured = list.find { |p| p[:configured] }
          active = first_configured ? first_configured[:id] : "anthropic"
        end

        {
          active_provider: active,
          providers: list
        }
      end

      def save_provider_config!(provider:, api_key: nil, model: nil, base_url: nil, make_active: true)
        prov = provider.to_s.strip.downcase
        unless PROVIDERS.key?(prov)
          raise ContextDrop::Error, "Unsupported LLM provider '#{prov}'. Supported: #{PROVIDERS.keys.join(', ')}"
        end

        vault = read_vault_hash
        entry = vault[prov].is_a?(Hash) ? vault[prov].dup : {}

        unless api_key.nil?
          trimmed_key = api_key.to_s.strip
          if trimmed_key.empty?
            entry.delete("api_key")
          else
            entry["api_key"] = trimmed_key
          end
        end

        unless model.nil?
          trimmed_model = model.to_s.strip
          if trimmed_model.empty?
            entry.delete("model")
          else
            entry["model"] = trimmed_model
          end
        end

        if PROVIDERS[prov][:supports_base_url] && !base_url.nil?
          trimmed_url = base_url.to_s.strip
          if trimmed_url.empty?
            entry.delete("base_url")
          else
            entry["base_url"] = trimmed_url
          end
        end

        vault[prov] = entry
        vault["_active_provider"] = prov if make_active
        write_vault_hash!(vault)
        providers_status
      end

      def clear_provider_key!(provider:)
        prov = provider.to_s.strip.downcase
        vault = read_vault_hash
        if prov == "all"
          PROVIDERS.each_key { |k| vault.delete(k) }
        elsif vault[prov].is_a?(Hash)
          vault[prov].delete("api_key")
        end
        write_vault_hash!(vault)
        providers_status
      end

      # Internal-only credential resolution for server-side LLM API calls.
      def resolve_credentials!(provider: nil, model_override: nil)
        status = providers_status
        prov = (provider.to_s.strip.empty? ? status[:active_provider] : provider.to_s.strip.downcase)
        meta = PROVIDERS[prov]
        raise ContextDrop::Error, "Unsupported LLM provider '#{prov}'" unless meta

        vault = read_vault_hash
        vault_entry = vault[prov].is_a?(Hash) ? vault[prov] : {}
        vault_key = vault_entry["api_key"].to_s.strip
        _env_name, env_val = resolve_env_key(meta[:env_keys])

        api_key = !vault_key.empty? ? vault_key : env_val
        base_url = if meta[:supports_base_url]
                     (vault_entry["base_url"].to_s.strip.empty? ? nil : vault_entry["base_url"].to_s.strip) ||
                       (@env_vars[meta[:env_base_url].to_s].to_s.strip.empty? ? nil : @env_vars[meta[:env_base_url].to_s].to_s.strip) ||
                       meta[:default_base_url]
                   end

        if api_key.empty? && !(prov == "custom" && loopback_base_url?(base_url))
          raise ContextDrop::Error,
                "No API key configured for #{meta[:label]}. Add a BYOK key in the sidebar settings or export #{meta[:env_keys].first}."
        end

        resolved_model = model_override.to_s.strip
        if resolved_model.empty?
          resolved_model = vault_entry["model"].to_s.strip
        end
        resolved_model = meta[:default_model] if resolved_model.empty?

        {
          provider: prov,
          api_key: api_key,
          model: resolved_model,
          base_url: base_url
        }
      end

      private

      def resolve_env_key(keys)
        Array(keys).each do |k|
          val = @env_vars[k].to_s.strip
          return [k, val] unless val.empty?
        end
        [nil, ""]
      end

      def loopback_base_url?(url_str)
        return false if url_str.to_s.strip.empty?

        uri = URI.parse(url_str.to_s.strip)
        %w[localhost 127.0.0.1 ::1 [::1]].include?(uri.host.to_s.downcase)
      rescue StandardError
        false
      end

      def mask_secret(raw)
        str = raw.to_s.strip
        return nil if str.empty?
        return "••••••••" if str.length <= 6

        "••••#{str[-4, 4]}"
      end

      def ensure_master_key!
        dir = File.dirname(@master_key_path)
        FileUtils.mkdir_p(dir)

        if File.exist?(@master_key_path)
          raw = File.binread(@master_key_path)
          return raw if raw.bytesize == 32
        end

        key = SecureRandom.random_bytes(32)
        File.open(@master_key_path, File::WRONLY | File::CREAT | File::TRUNC, 0o600) do |f|
          f.binmode
          f.write(key)
        end
        File.chmod(0o600, @master_key_path) rescue nil
        key
      end

      def read_vault_hash
        return {} unless File.exist?(@store_path)

        payload = JSON.parse(File.read(@store_path))
        iv = ContextDrop::Base64Util.strict_decode64(payload.fetch("iv"))
        auth_tag = ContextDrop::Base64Util.strict_decode64(payload.fetch("tag"))
        ciphertext = ContextDrop::Base64Util.strict_decode64(payload.fetch("data"))

        decipher = OpenSSL::Cipher.new(CIPHER_NAME)
        decipher.decrypt
        decipher.key = ensure_master_key!
        decipher.iv = iv
        decipher.auth_tag = auth_tag

        plaintext = decipher.update(ciphertext) + decipher.final
        parsed = JSON.parse(plaintext)
        parsed.is_a?(Hash) ? parsed : {}
      rescue StandardError
        {}
      end

      def write_vault_hash!(hash)
        dir = File.dirname(@store_path)
        FileUtils.mkdir_p(dir)

        cipher = OpenSSL::Cipher.new(CIPHER_NAME)
        cipher.encrypt
        cipher.key = ensure_master_key!
        iv = cipher.random_iv

        plaintext = JSON.generate(hash)
        ciphertext = cipher.update(plaintext) + cipher.final
        auth_tag = cipher.auth_tag

        envelope = JSON.generate(
          v: 1,
          iv: ContextDrop::Base64Util.strict_encode64(iv),
          tag: ContextDrop::Base64Util.strict_encode64(auth_tag),
          data: ContextDrop::Base64Util.strict_encode64(ciphertext)
        )

        tmp_path = "#{@store_path}.tmp.#{SecureRandom.hex(4)}"
        File.open(tmp_path, File::WRONLY | File::CREAT | File::TRUNC, 0o600) do |f|
          f.write(envelope)
        end
        File.chmod(0o600, tmp_path) rescue nil
        File.rename(tmp_path, @store_path)
      end
    end
  end
end
