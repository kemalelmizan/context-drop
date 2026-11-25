# frozen_string_literal: true

module ContextDrop
  module Assistant
    class Orchestrator
      MAX_ASK_ITERATIONS = 4
      MAX_BUILD_ITERATIONS = 8

      def initialize(key_store: nil, registry: nil)
        @key_store = key_store || Agent::KeyStore.new
        @registry = registry || ToolRegistry.new
      end

      def run_turn(mode:, messages:, page_url: nil, element_references: [], attachments: [], change_set: nil,
                   provider: nil, model: nil, submitter: nil, session_id: nil)
        mode_s = mode.to_s.strip.downcase
        raise ContextDrop::Error, "Invalid assistant mode: #{mode}" unless AssistantTurn::MODES.include?(mode_s)

        if mode_s == "feedback"
          return {
            reply: "Use Feedback mode to pin context and send a report, or switch to Ask for product help.",
            mode: mode_s,
            tool_calls: []
          }
        end

        creds = @key_store.resolve_credentials!(provider: provider, model_override: model_for_mode(mode_s, model))
        started = Process.clock_gettime(Process::CLOCK_MONOTONIC)

        tools = @registry.tools_for_mode(mode_s, allow_write: false).map { |d| llm_tool_schema(d) }
        conversation = build_conversation(messages, page_url, element_references)
        tool_traces = []
        change_set_payload = nil
        approval_token = nil
        final_text = ""

        iterations = mode_s == "ask" ? MAX_ASK_ITERATIONS : MAX_BUILD_ITERATIONS
        active_change_set = change_set

        iterations.times do
          step = Agent::LlmClient.complete_step(
            credentials: creds,
            system_prompt: build_system_prompt(mode_s, page_url),
            conversation: conversation,
            tools: tools
          )

          final_text = step[:text].to_s unless step[:text].to_s.empty?
          calls = Array(step[:tool_calls])
          break if calls.empty?

          conversation << { role: "assistant", content: step[:text].to_s, raw_assistant: step[:raw_assistant] }

          tool_results = calls.map do |call|
            exec = execute_call(mode_s, call, page_url:, element_references:, active_change_set:, submitter:, session_id:)
            tool_traces << { name: call[:name], summary: exec[:summary], status: exec[:is_error] ? "error" : "ok" }

            if exec[:change_set]
              active_change_set = exec[:change_set][:record]
              change_set_payload = exec[:change_set][:json]
              approval_token = exec[:change_set][:approval_token]
            end

            {
              id: call[:id],
              name: call[:name],
              output: exec[:output],
              is_error: exec[:is_error]
            }
          end

          conversation << { role: "tool_results", results: tool_results }
        end

        duration_ms = ((Process.clock_gettime(Process::CLOCK_MONOTONIC) - started) * 1000).round

        if active_change_set.is_a?(ChangeSet)
          ContextDrop::AssistantTurn.create!(
            mode: mode_s,
            session_id: session_id,
            submitter: submitter,
            provider: creds[:provider],
            model: creds[:model],
            tool_names: tool_traces.map { |t| t[:name] },
            change_set: active_change_set,
            duration_ms: duration_ms
          )
        else
          ContextDrop::AssistantTurn.create!(
            mode: mode_s,
            session_id: session_id,
            submitter: submitter,
            provider: creds[:provider],
            model: creds[:model],
            tool_names: tool_traces.map { |t| t[:name] },
            duration_ms: duration_ms
          )
        end

        {
          reply: final_text,
          mode: mode_s,
          provider: creds[:provider],
          model: creds[:model],
          tool_calls: tool_traces,
          change_set: change_set_payload,
          approval_token: approval_token
        }
      end

      private

      def model_for_mode(mode, override)
        return override if override.to_s.strip.present?

        models = ContextDrop.config.assistant_models
        return nil unless models.is_a?(Hash)

        models[mode.to_sym] || models[mode.to_s]
      end

      def build_system_prompt(mode, page_url)
        env = ContextDrop.config.resolved_environment
        if mode == "ask"
          <<~SYS
            You are a helpful product assistant embedded in a #{env} web application.
            Page URL: #{page_url || "unknown"}
            Answer in plain language. Never expose CSS selectors, file paths, or internal code unless the user is clearly a staff tester.
            Use registered tools for product knowledge. Do not invent policies.
          SYS
        else
          target = ContextDrop.config.build_target_hash
          <<~SYS
            You are ContextDrop Build assistant (#{env}).
            Page URL: #{page_url || "unknown"}
            Target repo: #{target["repo"] || "unconfigured"} (base branch: #{target["default_base_branch"] || "main"}).
            Use read tools to inspect the codebase. Stage changes ONLY via propose_change_set.
            Never claim changes are live on main — they require user approval, PR, and deployment.
          SYS
        end
      end

      def build_conversation(messages, page_url, element_references)
        turns = Array(messages).filter_map do |m|
          next unless m.is_a?(Hash)

          str = m.transform_keys(&:to_s)
          role = str["role"].to_s
          next unless %w[user assistant].include?(role)

          text = str["content"].to_s.strip
          next if text.empty?

          { role: role, content: text }
        end

        raise ContextDrop::Error, "Message history cannot be empty" if turns.empty?

        last_user = turns.rindex { |t| t[:role] == "user" }
        if last_user && element_references.any?
          appendix = DomContextFormatter.format(page_url, element_references)
          turns[last_user][:content] = "#{turns[last_user][:content]}\n\n#{appendix}" unless appendix.empty?
        end

        turns
      end

      def llm_tool_schema(definition)
        params = definition[:parameters] || definition["parameters"] || { type: "object", properties: {} }
        {
          name: definition[:name].to_s,
          description: definition[:description].to_s,
          parameters: params
        }
      end

      def execute_call(mode, call, page_url:, element_references:, active_change_set:, submitter:, session_id:)
        name = call[:name].to_s
        args = call[:arguments].is_a?(Hash) ? call[:arguments].transform_keys(&:to_s) : {}

        if name == "propose_change_set"
          return handle_propose_change_set(args, page_url:, submitter:, session_id:, active_change_set:)
        end

        res = @registry.call_tool!(mode, name, args.merge(
          "page_url" => page_url,
          "element_references" => element_references
        ), allow_write: false)

        summary = res[:is_error] ? res[:error].to_s : "ok"
        {
          output: res[:is_error] ? res[:error].to_s : JSON.generate(res[:data]),
          is_error: res[:is_error],
          summary: summary
        }
      end

      def handle_propose_change_set(args, page_url:, submitter:, session_id:, active_change_set:)
        summary = args["summary"].to_s.strip
        patches = Array(args["patches"])
        raise ContextDrop::Error, "propose_change_set requires summary" if summary.empty?

        raw_token = nil
        record = if active_change_set.is_a?(ChangeSet)
                   active_change_set.store_patches!(patches)
                   active_change_set.update!(summary: summary, page_url: page_url)
                   active_change_set
                 else
                   created, raw_token = ChangeSet.create_with_approval_token!(
                     status: "draft",
                     page_url: page_url,
                     summary: summary,
                     session_id: session_id,
                     submitter: submitter,
                     metadata: { "patches" => patches }
                   )
                   created
                 end

        json = record.as_widget_json
        {
          output: JSON.generate(change_set_id: record.id, status: record.status),
          is_error: false,
          summary: "Proposed change set ##{record.id}",
          change_set: {
            record: record,
            json: json,
            approval_token: raw_token
          }
        }
      end
    end
  end
end