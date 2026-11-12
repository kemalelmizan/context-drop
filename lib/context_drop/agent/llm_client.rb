# frozen_string_literal: true

require "ipaddr"
require "json"
require "net/http"
require "resolv"
require "securerandom"
require "uri"

module ContextDrop
  module Agent
    class LlmClient
      class LlmError < ContextDrop::Error; end

      OPEN_TIMEOUT = 8
      READ_TIMEOUT = 60
      LOOPBACK_HOSTS = %w[localhost 127.0.0.1 ::1 [::1]].freeze

      class << self
        # Test seam for deterministic unit specs without external HTTP calls
        attr_accessor :transport

        # Executes a single conversational step and returns normalized `{ text:, tool_calls:, raw_assistant: }`:
        # `tool_calls` is an Array of `{ id:, name:, arguments: Hash }`.
        def complete_step(credentials:, system_prompt:, conversation:, tools:, extra_state: {})
          if transport.respond_to?(:call)
            return transport.call(
              credentials: credentials,
              system_prompt: system_prompt,
              conversation: conversation,
              tools: tools,
              extra_state: extra_state
            )
          end

          case credentials[:provider]
          when "anthropic"
            call_anthropic(credentials, system_prompt, conversation, tools)
          when "gemini"
            call_gemini(credentials, system_prompt, conversation, tools)
          when "openai", "custom"
            call_openai_compatible(credentials, system_prompt, conversation, tools)
          else
            raise LlmError, "Unsupported provider: #{credentials[:provider]}"
          end
        end

        def validate_custom_base_url!(url_str, resolve_dns: true)
          uri = URI.parse(url_str.to_s.strip)
          unless %w[http https].include?(uri.scheme) && uri.host && !uri.host.empty?
            raise LlmError, "Invalid base URL: #{url_str.inspect}"
          end

          host_down = uri.host.downcase.delete_prefix("[").delete_suffix("]")
          is_loopback_host = LOOPBACK_HOSTS.include?(uri.host.downcase) || LOOPBACK_HOSTS.include?(host_down)

          if uri.scheme == "http" && !is_loopback_host
            raise LlmError, "Custom base URL must use https:// (http:// is only permitted for localhost / 127.0.0.1)"
          end

          unless is_loopback_host
            check_ip_literal!(host_down)
            if resolve_dns
              addrs = Resolv.getaddresses(host_down)
              addrs.each { |addr| check_resolved_ip!(addr) }
            end
          end

          uri
        rescue URI::InvalidURIError => e
          raise LlmError, "Malformed base URL: #{e.message}"
        end

        private

        def check_ip_literal!(host_str)
          ip = IPAddr.new(host_str)
          reject_disallowed_ip!(ip)
        rescue IPAddr::InvalidAddressError
          # Hostname rather than literal IP; checked via DNS resolution when enabled
          nil
        end

        def check_resolved_ip!(addr_str)
          ip = IPAddr.new(addr_str)
          reject_disallowed_ip!(ip)
        rescue IPAddr::InvalidAddressError
          raise LlmError, "Unresolvable host address"
        end

        def reject_disallowed_ip!(ip)
          if ip.loopback? || ip.link_local? || ip.private? || ip.to_s == "0.0.0.0"
            raise LlmError, "Blocked disallowed private/metadata IP address (#{ip}) in custom base URL"
          end
        end

        def call_anthropic(creds, system_prompt, conversation, tools)
          uri = URI.parse("https://api.anthropic.com/v1/messages")
          anthropic_tools = tools.map do |t|
            {
              name: t[:name],
              description: t[:description],
              input_schema: t[:parameters]
            }
          end

          messages = build_anthropic_messages(conversation)
          body = {
            model: creds[:model],
            max_tokens: 4096,
            system: system_prompt,
            tools: anthropic_tools,
            messages: messages
          }

          headers = {
            "Content-Type" => "application/json",
            "x-api-key" => creds[:api_key],
            "anthropic-version" => "2023-06-01"
          }

          parsed = post_json!(uri, headers, body, "Anthropic")
          content_blocks = Array(parsed["content"])

          text_parts = []
          tool_calls = []

          content_blocks.each do |blk|
            next unless blk.is_a?(Hash)

            if blk["type"] == "text"
              text_parts << blk["text"].to_s
            elsif blk["type"] == "tool_use"
              tool_calls << {
                id: blk["id"].to_s,
                name: blk["name"].to_s,
                arguments: blk["input"].is_a?(Hash) ? blk["input"] : {}
              }
            end
          end

          {
            text: text_parts.join("\n").strip,
            tool_calls: tool_calls,
            raw_assistant: content_blocks
          }
        end

        def build_anthropic_messages(conversation)
          conversation.map do |turn|
            case turn[:role]
            when "user"
              blocks = []
              Array(turn[:images]).each do |img|
                blocks << {
                  type: "image",
                  source: {
                    type: "base64",
                    media_type: img[:mime_type] || "image/png",
                    data: img[:data]
                  }
                }
              end
              blocks << { type: "text", text: turn[:content].to_s }
              { role: "user", content: blocks }
            when "assistant"
              if turn[:raw_assistant].is_a?(Array) && !turn[:raw_assistant].empty?
                { role: "assistant", content: turn[:raw_assistant] }
              else
                { role: "assistant", content: turn[:content].to_s }
              end
            when "tool_results"
              blocks = Array(turn[:results]).map do |r|
                {
                  type: "tool_result",
                  tool_use_id: r[:id],
                  content: r[:output].to_s,
                  is_error: !!r[:is_error]
                }
              end
              { role: "user", content: blocks }
            end
          end.compact
        end

        def call_gemini(creds, system_prompt, conversation, tools)
          encoded_model = URI.encode_www_form_component(creds[:model].to_s.sub(%r{\Amodels/}, ""))
          uri = URI.parse("https://generativelanguage.googleapis.com/v1beta/models/#{encoded_model}:generateContent")

          gemini_decls = tools.map do |t|
            {
              name: t[:name],
              description: t[:description],
              parameters: sanitize_gemini_schema(t[:parameters])
            }
          end

          contents = build_gemini_contents(conversation)
          body = {
            systemInstruction: { parts: [{ text: system_prompt }] },
            contents: contents,
            tools: [{ functionDeclarations: gemini_decls }]
          }

          headers = {
            "Content-Type" => "application/json",
            "x-goog-api-key" => creds[:api_key]
          }

          parsed = post_json!(uri, headers, body, "Gemini")
          parts = Array(parsed.dig("candidates", 0, "content", "parts"))

          text_parts = []
          tool_calls = []

          parts.each do |part|
            next unless part.is_a?(Hash)

            if part.key?("text") && !part["thought"]
              text_parts << part["text"].to_s
            elsif part["functionCall"].is_a?(Hash)
              fc = part["functionCall"]
              tool_calls << {
                id: "gem_#{SecureRandom.hex(5)}",
                name: fc["name"].to_s,
                arguments: fc["args"].is_a?(Hash) ? fc["args"] : {}
              }
            end
          end

          {
            text: text_parts.join("\n").strip,
            tool_calls: tool_calls,
            raw_assistant: parts
          }
        end

        def build_gemini_contents(conversation)
          conversation.map do |turn|
            case turn[:role]
            when "user"
              parts = []
              Array(turn[:images]).each do |img|
                parts << {
                  inlineData: {
                    mimeType: img[:mime_type] || "image/png",
                    data: img[:data]
                  }
                }
              end
              parts << { text: turn[:content].to_s }
              { role: "user", parts: parts }
            when "assistant"
              if turn[:raw_assistant].is_a?(Array) && !turn[:raw_assistant].empty?
                { role: "model", parts: turn[:raw_assistant] }
              else
                { role: "model", parts: [{ text: turn[:content].to_s }] }
              end
            when "tool_results"
              parts = Array(turn[:results]).map do |r|
                {
                  functionResponse: {
                    name: r[:name],
                    response: { result: r[:output].to_s, is_error: !!r[:is_error] }
                  }
                }
              end
              { role: "user", parts: parts }
            end
          end.compact
        end

        def sanitize_gemini_schema(schema)
          return schema unless schema.is_a?(Hash)

          out = {}
          schema.each do |k, v|
            key_s = k.to_s
            if key_s == "type" && v.is_a?(Array)
              out[key_s] = v.first.to_s
            elsif v.is_a?(Hash)
              out[key_s] = sanitize_gemini_schema(v)
            else
              out[key_s] = v
            end
          end
          out
        end

        def call_openai_compatible(creds, system_prompt, conversation, tools)
          base = creds[:provider] == "openai" ? "https://api.openai.com/v1" : creds[:base_url].to_s.sub(%r{/+\z}, "")
          uri = validate_custom_base_url!("#{base}/chat/completions")

          openai_tools = tools.map do |t|
            {
              type: "function",
              function: {
                name: t[:name],
                description: t[:description],
                parameters: t[:parameters]
              }
            }
          end

          messages = [{ role: "system", content: system_prompt }] + build_openai_messages(conversation)
          body = {
            model: creds[:model],
            messages: messages,
            tools: openai_tools
          }

          headers = { "Content-Type" => "application/json" }
          headers["Authorization"] = "Bearer #{creds[:api_key]}" unless creds[:api_key].to_s.strip.empty?

          parsed = post_json!(uri, headers, body, creds[:provider] == "openai" ? "OpenAI" : "LLM")
          msg = parsed.dig("choices", 0, "message") || {}

          raw_calls = Array(msg["tool_calls"])
          tool_calls = raw_calls.map do |tc|
            fn = tc["function"] || {}
            args = begin
              JSON.parse(fn["arguments"].to_s)
            rescue JSON::ParserError
              {}
            end
            {
              id: tc["id"].to_s,
              name: fn["name"].to_s,
              arguments: args.is_a?(Hash) ? args : {}
            }
          end

          {
            text: msg["content"].to_s.strip,
            tool_calls: tool_calls,
            raw_assistant: msg
          }
        end

        def build_openai_messages(conversation)
          out = []
          conversation.each do |turn|
            case turn[:role]
            when "user"
              imgs = Array(turn[:images])
              if imgs.empty?
                out << { role: "user", content: turn[:content].to_s }
              else
                parts = [{ type: "text", text: turn[:content].to_s }]
                imgs.each do |img|
                  parts << {
                    type: "image_url",
                    image_url: { url: "data:#{img[:mime_type] || 'image/png'};base64,#{img[:data]}" }
                  }
                end
                out << { role: "user", content: parts }
              end
            when "assistant"
              if turn[:raw_assistant].is_a?(Hash) && !turn[:raw_assistant].empty?
                out << turn[:raw_assistant]
              else
                out << { role: "assistant", content: turn[:content].to_s }
              end
            when "tool_results"
              Array(turn[:results]).each do |r|
                out << {
                  role: "tool",
                  tool_call_id: r[:id],
                  content: r[:output].to_s
                }
              end
            end
          end
          out
        end

        def post_json!(uri, headers, body_hash, provider_label)
          http = Net::HTTP.new(uri.host, uri.port)
          http.use_ssl = (uri.scheme == "https")
          http.open_timeout = OPEN_TIMEOUT
          http.read_timeout = READ_TIMEOUT

          req = Net::HTTP::Post.new(uri.request_uri)
          headers.each { |k, v| req[k] = v }
          req.body = JSON.generate(body_hash)

          res = http.request(req)
          raw_body = res.body.to_s
          parsed = begin
            JSON.parse(raw_body)
          rescue JSON::ParserError
            nil
          end

          unless res.code.to_i.between?(200, 299)
            err_detail = if parsed.is_a?(Hash)
                           parsed.dig("error", "message") || parsed["error"].to_s
                         else
                           raw_body[0, 240]
                         end
            raise LlmError, "#{provider_label} API error (HTTP #{res.code}): #{err_detail}"
          end

          raise LlmError, "Invalid JSON response from #{provider_label}" unless parsed.is_a?(Hash)

          parsed
        rescue Timeout::Error, SocketError, SystemCallError, IOError, OpenSSL::SSL::SSLError => e
          raise LlmError, "#{provider_label} network error: #{e.class}: #{e.message}"
        end
      end
    end
  end
end
