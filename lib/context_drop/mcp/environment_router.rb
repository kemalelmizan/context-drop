# frozen_string_literal: true

module ContextDrop
  module MCP
    module EnvironmentRouter
      THREAD_LOCAL_ONLY_KEY = :context_drop_mcp_local_only

      class << self
        def local_only?
          !!Thread.current[THREAD_LOCAL_ONLY_KEY]
        end

        def with_local_only
          previous = Thread.current[THREAD_LOCAL_ONLY_KEY]
          Thread.current[THREAD_LOCAL_ONLY_KEY] = true
          yield
        ensure
          Thread.current[THREAD_LOCAL_ONLY_KEY] = previous
        end

        def host_environment
          ContextDrop.config.resolved_environment
        end

        def remote_environments
          return {} if local_only?

          ContextDrop.config.effective_mcp_environments.reject do |env_name, _cfg|
            env_name == host_environment
          end
        end

        def available_environments
          envs = [
            {
              name: host_environment,
              aliases: host_environment == "local" ? [] : ["local"],
              mode: "local_db",
              configured: true
            }
          ]

          remote_environments.each do |name, cfg|
            envs << {
              name: name,
              aliases: [],
              mode: "remote_http",
              url: redact_url(cfg[:url]),
              has_api_key: !cfg[:api_key].to_s.strip.empty?,
              configured: true
            }
          end

          envs
        end

        # Parses either (`id: "staging:42"`) or (`id: 42, environment: "staging"`).
        # Returns `[resolved_env_or_nil, raw_record_id_string]`.
        def parse_target(raw_id, explicit_environment = nil)
          env_str = explicit_environment.to_s.strip.downcase
          id_str = raw_id.to_s.strip

          if id_str.include?(":")
            prefix, rest = id_str.split(":", 2)
            if !prefix.to_s.strip.empty? && !rest.to_s.strip.empty?
              env_str = prefix.strip.downcase if env_str.empty?
              id_str = rest.strip
            end
          end

          [env_str.empty? ? nil : env_str, id_str]
        end

        def local_target?(env_name)
          return true if env_name.nil? || env_name.to_s.strip.empty?

          norm = env_name.to_s.strip.downcase
          norm == "local" || norm == host_environment
        end

        def remote_config_for(env_name)
          return nil if env_name.nil?

          norm = env_name.to_s.strip.downcase
          remote_environments[norm]
        end

        def record_environment(record)
          if record.respond_to?(:environment_name)
            record.environment_name
          elsif record.respond_to?(:environment) && !record.environment.to_s.strip.empty?
            record.environment.to_s
          elsif record.respond_to?(:metadata) && record.metadata.is_a?(Hash) && !record.metadata["environment"].to_s.strip.empty?
            record.metadata["environment"].to_s
          else
            host_environment
          end
        end

        def qualify_id(env_name, id)
          "#{env_name}:#{id}"
        end

        private

        def redact_url(url_str)
          uri = URI.parse(url_str.to_s)
          "#{uri.scheme}://#{uri.host}#{uri.port && ![80, 443].include?(uri.port) ? ":#{uri.port}" : ''}#{uri.path}"
        rescue StandardError
          url_str.to_s
        end
      end
    end
  end
end
