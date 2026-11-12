# frozen_string_literal: true

module ContextDrop
  module MCP
    module Tools
      class ListEnvironments
        DEFINITION = {
          name: "list_environments",
          description: "List the active host Rails environment and all federated remote ContextDrop environments connected through this unified MCP server.",
          inputSchema: {
            type: "object",
            properties: {
              ping_remotes: {
                type: "boolean",
                description: "When true, performs a lightweight JSON-RPC ping against each configured remote environment to verify connectivity."
              }
            }
          }
        }.freeze

        def self.call(args = {})
          params = args.is_a?(Hash) ? args.transform_keys(&:to_s) : {}
          ping_remotes = !!params["ping_remotes"]

          environments = ContextDrop::MCP::EnvironmentRouter.available_environments.map(&:dup)

          if ping_remotes
            remotes = ContextDrop::MCP::EnvironmentRouter.remote_environments
            environments.each do |entry|
              next unless entry[:mode] == "remote_http"

              cfg = remotes[entry[:name]]
              begin
                ContextDrop::MCP::RemoteClient.call_rpc(entry[:name], cfg, "ping", {})
                entry[:reachable] = true
              rescue ContextDrop::MCP::RemoteClient::RemoteError => e
                entry[:reachable] = false
                entry[:error] = e.message
              end
            end
          end

          {
            content: [
              {
                type: "text",
                text: JSON.pretty_generate(
                  host_environment: ContextDrop::MCP::EnvironmentRouter.host_environment,
                  federation_enabled: !ContextDrop::MCP::EnvironmentRouter.local_only?,
                  environments: environments
                )
              }
            ],
            isError: false
          }
        end
      end
    end
  end
end
