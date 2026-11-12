# frozen_string_literal: true

require "json"
require "net/http"
require "uri"

module ContextDrop
  module MCP
    class RemoteClient
      DEFAULT_OPEN_TIMEOUT = 4
      DEFAULT_READ_TIMEOUT = 12
      LOOPBACK_HOSTS = %w[localhost 127.0.0.1 ::1 [::1]].freeze

      class RemoteError < ContextDrop::Error; end

      class << self
        # Optional test seam for stubbing remote JSON-RPC calls in unit specs without network sockets
        attr_accessor :transport

        def call_rpc(env_name, env_config, method, params = {})
          if transport.respond_to?(:call)
            return transport.call(env_name.to_s, env_config, method.to_s, params)
          end

          url_str = env_config[:url].to_s.strip
          uri = validate_endpoint_uri!(env_name, url_str, allow_insecure_http: !!env_config[:allow_insecure_http])

          payload = {
            jsonrpc: "2.0",
            id: "fed_#{env_name}_#{Process.clock_gettime(Process::CLOCK_MONOTONIC, :millisecond)}",
            method: method.to_s,
            params: params
          }

          http = Net::HTTP.new(uri.host, uri.port)
          http.use_ssl = (uri.scheme == "https")
          http.open_timeout = DEFAULT_OPEN_TIMEOUT
          http.read_timeout = DEFAULT_READ_TIMEOUT

          req = Net::HTTP::Post.new(uri.request_uri)
          req["Content-Type"] = "application/json"
          req["Accept"] = "application/json"
          req["X-Context-Drop-Federated"] = "1"

          if env_config[:headers].is_a?(Hash)
            env_config[:headers].each do |k, v|
              req[k.to_s] = v.to_s unless k.to_s.strip.empty?
            end
          end

          api_key = env_config[:api_key].to_s.strip
          req["Authorization"] = "Bearer #{api_key}" unless api_key.empty?
          req.body = JSON.generate(payload)

          response = http.request(req)
          unless response.code.to_i.between?(200, 299)
            raise RemoteError, "Remote environment '#{env_name}' returned HTTP #{response.code}"
          end

          parsed = JSON.parse(response.body.to_s)
          if parsed.is_a?(Hash) && parsed["error"].is_a?(Hash)
            raise RemoteError, "Remote environment '#{env_name}' error: #{parsed['error']['message']}"
          end

          parsed.is_a?(Hash) ? (parsed["result"] || parsed[:result]) : nil
        rescue JSON::ParserError => e
          raise RemoteError, "Invalid JSON from remote environment '#{env_name}': #{e.message}"
        rescue Timeout::Error, SocketError, SystemCallError, IOError, OpenSSL::SSL::SSLError => e
          raise RemoteError, "Failed to reach remote environment '#{env_name}': #{e.class}: #{e.message}"
        end

        def call_tool(env_name, env_config, tool_name, arguments = {})
          clean_args = arguments.is_a?(Hash) ? arguments.dup : {}
          clean_args.delete("environment")
          clean_args.delete(:environment)

          result = call_rpc(env_name, env_config, "tools/call", {
            name: tool_name.to_s,
            arguments: clean_args
          })

          unless result.is_a?(Hash)
            raise RemoteError, "Unexpected tool response from '#{env_name}'"
          end

          normalize_tool_result(result)
        end

        def validate_endpoint_uri!(env_name, url_str, allow_insecure_http: false)
          uri = URI.parse(url_str)
          unless %w[http https].include?(uri.scheme) && uri.host && !uri.host.empty?
            raise RemoteError, "Invalid MCP URL for environment '#{env_name}': #{url_str.inspect}"
          end

          is_loopback = LOOPBACK_HOSTS.include?(uri.host.downcase)
          if uri.scheme == "http" && !is_loopback && !allow_insecure_http
            raise RemoteError, "Insecure HTTP MCP URL refused for remote environment '#{env_name}' (use https:// or set allow_insecure_http: true)"
          end

          uri
        rescue URI::InvalidURIError => e
          raise RemoteError, "Malformed MCP URL for environment '#{env_name}': #{e.message}"
        end

        private

        def normalize_tool_result(raw)
          str_hash = raw.transform_keys(&:to_s)
          raw_content = Array(str_hash["content"]).map do |block|
            block.is_a?(Hash) ? block.transform_keys(&:to_sym) : block
          end
          {
            content: raw_content,
            isError: !!str_hash["isError"]
          }
        end
      end
    end
  end
end
