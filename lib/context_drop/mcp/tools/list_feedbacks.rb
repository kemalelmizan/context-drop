# frozen_string_literal: true

module ContextDrop
  module MCP
    module Tools
      class ListFeedbacks
        MAX_LIMIT = 100
        DEFAULT_LIMIT = 20

        DEFINITION = {
          name: "list_feedbacks",
          description: "List and search ContextDrop feedback submissions across all connected environments (or filtered to a specific environment, status, page_url, or query).",
          inputSchema: {
            type: "object",
            properties: {
              environment: {
                type: "string",
                description: "Target environment ('all', 'local', 'development', 'staging', 'production', etc.). Defaults to 'all' across local and configured remote environments."
              },
              status: {
                type: "string",
                enum: %w[new reviewed resolved dismissed],
                description: "Filter feedback by workflow status."
              },
              page_url: {
                type: "string",
                description: "Filter feedback by originating page URL substring (e.g. '/checkout')."
              },
              query: {
                type: "string",
                description: "Free-text search matching feedback message or attached DOM element selectors, paths, or text."
              },
              limit: {
                type: "integer",
                description: "Maximum records to return (default 20, max 100)."
              },
              offset: {
                type: "integer",
                description: "Pagination offset (default 0)."
              }
            }
          }
        }.freeze

        def self.call(args = {})
          params = stringify_keys(args)

          status = params["status"].to_s.strip
          if status.present? && !ContextDrop::Feedback::STATUSES.include?(status)
            return error_result("Invalid status '#{status}'. Must be one of: #{ContextDrop::Feedback::STATUSES.join(', ')}")
          end

          raw_limit = params["limit"] ? params["limit"].to_i : DEFAULT_LIMIT
          limit = raw_limit.clamp(1, MAX_LIMIT)
          offset = [params["offset"].to_i, 0].max

          requested_env = params["environment"].to_s.strip.downcase
          requested_env = "all" if requested_env.empty?

          remotes = ContextDrop::MCP::EnvironmentRouter.remote_environments
          host_env = ContextDrop::MCP::EnvironmentRouter.host_environment

          if requested_env == "all"
            return query_all_environments(params, status: status, limit: limit, offset: offset, remotes: remotes)
          end

          if requested_env == "local" || requested_env == host_env
            filter_env = requested_env == "local" ? nil : host_env
            local_res = query_local(params, status: status, limit: limit, offset: offset, env_filter: filter_env)
            return success_json(
              environment: host_env,
              total: local_res[:total],
              limit: limit,
              offset: offset,
              feedbacks: local_res[:records]
            )
          end

          if remotes.key?(requested_env)
            begin
              remote_res = fetch_remote_list(requested_env, remotes[requested_env], params.merge("limit" => limit, "offset" => offset))
              return success_json(
                environment: requested_env,
                total: remote_res[:total],
                limit: limit,
                offset: offset,
                feedbacks: remote_res[:records]
              )
            rescue ContextDrop::MCP::RemoteClient::RemoteError => e
              return error_result(e.message)
            end
          end

          # Fallback: shared database containing records tagged with `requested_env`
          if local_supports_environment_column?
            local_res = query_local(params, status: status, limit: limit, offset: offset, env_filter: requested_env)
            return success_json(
              environment: requested_env,
              total: local_res[:total],
              limit: limit,
              offset: offset,
              feedbacks: local_res[:records]
            )
          end

          known = ([host_env, "local", "all"] + remotes.keys).uniq
          error_result("Unknown environment '#{requested_env}'. Available environments: #{known.join(', ')}")
        end

        def self.query_all_environments(params, status:, limit:, offset:, remotes:)
          fetch_window = (offset + limit).clamp(1, MAX_LIMIT)
          local_res = query_local(params, status: status, limit: fetch_window, offset: 0, env_filter: nil)

          if remotes.empty?
            paged = local_res[:records].drop(offset).first(limit)
            return success_json(
              environment: ContextDrop::MCP::EnvironmentRouter.host_environment,
              total: local_res[:total],
              limit: limit,
              offset: offset,
              feedbacks: paged
            )
          end

          remote_results = {}
          warnings = []
          mutex = Mutex.new

          threads = remotes.map do |env_name, cfg|
            Thread.new do
              res = fetch_remote_list(env_name, cfg, params.merge("limit" => fetch_window, "offset" => 0))
              mutex.synchronize { remote_results[env_name] = res }
            rescue StandardError => e
              mutex.synchronize { warnings << { environment: env_name, error: e.message } }
            end
          end
          threads.each(&:join)

          combined = local_res[:records].dup
          total_count = local_res[:total].to_i

          remote_results.each_value do |res|
            combined.concat(res[:records])
            total_count += res[:total].to_i
          end

          combined.sort_by! do |item|
            ts = begin
              Time.iso8601(item[:created_at].to_s).to_f
            rescue StandardError
              0.0
            end
            [-ts, -item[:id].to_i]
          end

          payload = {
            environment: "all",
            connected_environments: [ContextDrop::MCP::EnvironmentRouter.host_environment] + remotes.keys,
            total: total_count,
            limit: limit,
            offset: offset,
            feedbacks: combined.drop(offset).first(limit)
          }
          payload[:warnings] = warnings unless warnings.empty?

          success_json(payload)
        end

        def self.query_local(params, status:, limit:, offset:, env_filter: nil)
          scope = ContextDrop::Feedback.includes(:submitter, :element_references, :attachments).recent

          if env_filter.present? && local_supports_environment_column?
            scope = scope.where(environment: env_filter)
          end

          scope = scope.where(status: status) if status.present?

          page_url = params["page_url"].to_s.strip
          if page_url.present?
            scope = scope.where("context_drop_feedbacks.page_url LIKE ?", "%#{escape_like(page_url)}%")
          end

          query = params["query"].to_s.strip
          if query.present?
            pattern = "%#{escape_like(query)}%"
            scope = scope.left_outer_joins(:element_references).where(
              "context_drop_feedbacks.message LIKE :q OR " \
              "context_drop_element_references.selector LIKE :q OR " \
              "context_drop_element_references.dom_path LIKE :q OR " \
              "context_drop_element_references.text_content LIKE :q",
              q: pattern
            ).distinct
          end

          total_count = scope.count
          records = scope.limit(limit).offset(offset).map { |fb| serialize_summary(fb) }
          { total: total_count, records: records }
        end

        def self.fetch_remote_list(env_name, env_config, params)
          remote_args = {}
          %w[status page_url query limit offset].each do |key|
            remote_args[key] = params[key] if params.key?(key) && !params[key].nil? && params[key].to_s != ""
          end

          tool_res = ContextDrop::MCP::RemoteClient.call_tool(env_name, env_config, "list_feedbacks", remote_args)
          text_block = Array(tool_res[:content]).find { |b| b.is_a?(Hash) && b[:type].to_s == "text" }
          parsed = text_block ? JSON.parse(text_block[:text].to_s) : {}

          if tool_res[:isError]
            raise ContextDrop::MCP::RemoteClient::RemoteError, parsed["error"] || "Remote list_feedbacks failed on '#{env_name}'"
          end

          items = Array(parsed["feedbacks"]).map do |item|
            sym_item = item.is_a?(Hash) ? item.transform_keys(&:to_sym) : {}
            rec_id = sym_item[:id]
            sym_item.merge(
              environment: env_name,
              qualified_id: ContextDrop::MCP::EnvironmentRouter.qualify_id(env_name, rec_id)
            )
          end

          {
            total: parsed["total"].to_i,
            records: items
          }
        end

        def self.serialize_summary(feedback)
          env_name = ContextDrop::MCP::EnvironmentRouter.record_environment(feedback)
          {
            id: feedback.id,
            qualified_id: ContextDrop::MCP::EnvironmentRouter.qualify_id(env_name, feedback.id),
            environment: env_name,
            status: feedback.status,
            message: feedback.message,
            page_url: feedback.page_url,
            submitter: feedback.submitter_label,
            attachments_count: feedback.attachments.size,
            element_references_count: feedback.element_references.size,
            element_selectors: feedback.element_references.map(&:selector),
            created_at: feedback.created_at&.iso8601
          }
        end

        def self.local_supports_environment_column?
          ContextDrop::Feedback.respond_to?(:column_names) &&
            Array(ContextDrop::Feedback.column_names).map(&:to_s).include?("environment")
        rescue StandardError
          false
        end

        def self.success_json(payload)
          {
            content: [{ type: "text", text: JSON.pretty_generate(payload) }],
            isError: false
          }
        end

        def self.error_result(msg)
          {
            content: [{ type: "text", text: JSON.generate(error: msg) }],
            isError: true
          }
        end

        def self.escape_like(str)
          ActiveRecord::Base.sanitize_sql_like(str.to_s)
        rescue StandardError
          str.to_s.gsub(/[%_\\]/) { |m| "\\#{m}" }
        end

        def self.stringify_keys(hash)
          hash.is_a?(Hash) ? hash.transform_keys(&:to_s) : {}
        end
      end
    end
  end
end
