# frozen_string_literal: true

require "json"

module ContextDrop
  module Agent
    class Orchestrator
      MAX_TOOL_ITERATIONS = 8
      MAX_INLINE_IMAGE_BYTES = 4 * 1024 * 1024 # 4 MB

      AGENT_TOOLS = [
        {
          name: "list_files",
          description: "List workspace files inside the local Rails application (excluding git, secrets, and dependencies).",
          parameters: {
            type: "object",
            properties: {
              directory: { type: "string", description: "Relative directory path (default '.')." },
              pattern: { type: "string", description: "Optional filename/path substring or glob filter (e.g. 'checkout' or '*.erb')." },
              limit: { type: "integer", description: "Max files to return (default 150)." }
            }
          }
        },
        {
          name: "read_file",
          description: "Read numbered lines from a source file inside the local Rails workspace.",
          parameters: {
            type: "object",
            required: ["path"],
            properties: {
              path: { type: "string", description: "Workspace-relative file path (e.g. 'app/views/layouts/application.html.erb')." },
              start_line: { type: "integer", description: "1-indexed start line (default 1)." },
              end_line: { type: "integer", description: "1-indexed inclusive end line (default 200)." }
            }
          }
        },
        {
          name: "search_code",
          description: "Search for a selector, class name, helper, route, or string across local workspace source files.",
          parameters: {
            type: "object",
            required: ["query"],
            properties: {
              query: { type: "string", description: "Substring or identifier to search for (e.g. '#checkout-button')." },
              directory: { type: "string", description: "Optional relative subdirectory to narrow search (e.g. 'app')." }
            }
          }
        },
        {
          name: "list_feedbacks",
          description: "List ContextDrop feedback submissions across local, staging, production, or all environments.",
          parameters: {
            type: "object",
            properties: {
              environment: { type: "string", description: "Environment filter: 'all' (default), 'local', 'staging', 'production', etc." },
              status: { type: "string", enum: %w[new reviewed resolved dismissed], description: "Workflow status filter." },
              page_url: { type: "string", description: "Originating page URL substring filter." },
              query: { type: "string", description: "Free-text search across message and DOM selectors." },
              limit: { type: "integer", description: "Max items (default 15)." }
            }
          }
        },
        {
          name: "get_feedback",
          description: "Fetch full ContextDrop feedback details and pinned DOM ElementReference snapshots by ID or '<env>:<id>'.",
          parameters: {
            type: "object",
            required: ["id"],
            properties: {
              id: { type: "string", description: "Feedback ID or qualified '<env>:<id>' (e.g. 'staging:42')." },
              environment: { type: "string", description: "Optional environment name." }
            }
          }
        },
        {
          name: "propose_file_edit",
          description: "Stage a safe file change as an interactive diff card for the developer to review and click Apply in the sidebar. Never modifies files without user approval.",
          parameters: {
            type: "object",
            required: %w[path old_string new_string],
            properties: {
              path: { type: "string", description: "Workspace-relative path of the file to modify or create." },
              old_string: { type: "string", description: "Exact existing lines to replace (include 2-4 surrounding lines so it matches uniquely; pass empty string '' only when creating a brand-new file)." },
              new_string: { type: "string", description: "Exact replacement text." },
              summary: { type: "string", description: "Short 1-line description of what this change fixes." }
            }
          }
        }
      ].freeze

      def initialize(sandbox: nil, key_store: nil)
        @sandbox = sandbox || WorkspaceSandbox.new
        @key_store = key_store || KeyStore.new
      end

      def run_turn(messages:, page_url: nil, element_references: [], attachments: [], provider: nil, model: nil)
        creds = @key_store.resolve_credentials!(provider: provider, model_override: model)
        conversation = build_initial_conversation(messages, page_url, element_references, attachments)

        tool_traces = []
        proposed_edits = []
        final_text = ""

        MAX_TOOL_ITERATIONS.times do
          step = LlmClient.complete_step(
            credentials: creds,
            system_prompt: build_system_prompt(page_url),
            conversation: conversation,
            tools: AGENT_TOOLS
          )

          final_text = step[:text].to_s unless step[:text].to_s.empty?
          calls = Array(step[:tool_calls])
          break if calls.empty?

          conversation << {
            role: "assistant",
            content: step[:text].to_s,
            raw_assistant: step[:raw_assistant]
          }

          tool_results = calls.map do |call|
            exec = execute_tool(call[:name], call[:arguments], proposed_edits)
            tool_traces << {
              name: call[:name],
              summary: exec[:summary],
              status: exec[:is_error] ? "error" : "ok"
            }
            {
              id: call[:id],
              name: call[:name],
              output: exec[:output],
              is_error: exec[:is_error]
            }
          end

          conversation << {
            role: "tool_results",
            results: tool_results
          }
        end

        {
          reply: final_text.empty? && proposed_edits.any? ? "I've staged #{proposed_edits.size} file change(s) below—review the diff and click **Apply Change** when ready." : final_text,
          provider: creds[:provider],
          model: creds[:model],
          tool_calls: tool_traces,
          proposed_edits: proposed_edits
        }
      end

      private

      def build_system_prompt(page_url)
        envs = ContextDrop::MCP::EnvironmentRouter.available_environments.map { |e| e[:name] }.join(", ")
        <<~SYS
          You are the ContextDrop Local Coding Agent embedded inside a Ruby on Rails application (`#{ContextDrop.config.resolved_environment}` environment).
          Current browser page URL: #{page_url || 'unknown'}
          Connected ContextDrop feedback environments: #{envs}

          Guidelines:
          1. Inspect relevant Rails routes (`config/routes.rb`), controllers (`app/controllers/`), views/components (`app/views/`, `app/javascript/`, `app/assets/`), or feedbacks (`list_feedbacks` / `get_feedback`) using your read-only tools before guessing.
          2. Always read the target lines of a file with `read_file` before calling `propose_file_edit` so `old_string` matches exact whitespace.
          3. `propose_file_edit` stages a non-destructive diff card in the user's sidebar—never claim a file was already written until the user clicks Apply.
          4. Keep explanations concise, concrete, and grounded in exact file paths and selectors.
        SYS
      end

      def build_initial_conversation(raw_messages, page_url, element_references, attachments)
        turns = Array(raw_messages).filter_map do |m|
          next unless m.is_a?(Hash)

          str_m = m.transform_keys(&:to_s)
          role = str_m["role"].to_s
          next unless %w[user assistant].include?(role)

          text = str_m["content"].to_s.strip
          next if text.empty?

          { role: role, content: text }
        end

        raise ContextDrop::Error, "Message history cannot be empty" if turns.empty?

        # Enrich the latest user message with pinned DOM ElementReference snapshots and screenshots
        last_user_idx = turns.rindex { |t| t[:role] == "user" }
        if last_user_idx
          context_appendix = format_dom_context(page_url, element_references)
          unless context_appendix.empty?
            turns[last_user_idx][:content] = "#{turns[last_user_idx][:content]}\n\n#{context_appendix}"
          end
          turns[last_user_idx][:images] = extract_base64_images(attachments)
        end

        turns
      end

      def format_dom_context(page_url, element_references)
        els = Array(element_references)
        return "" if els.empty?

        lines = ["---", "Pinned Live DOM Context (on `#{page_url || '/'}`):"]
        els.each_with_index do |raw_el, idx|
          el = ContextDrop::MetadataSanitizer.sanitize_element_reference(raw_el)
          lines << "#{idx + 1}. `<#{el[:tag_name]}>` selector=`#{el[:selector]}`"
          lines << "   - dom_path: `#{el[:dom_path]}`" if el[:dom_path]
          lines << "   - text: #{el[:text_content].inspect}" if el[:text_content]
          lines << "   - bounding_rect: `#{JSON.generate(el[:bounding_rect])}`" if el[:bounding_rect]
          lines << "   - attributes: `#{JSON.generate(el[:attributes_snapshot])}`" if el[:attributes_snapshot] && !el[:attributes_snapshot].empty?
        end
        lines.join("\n")
      end

      def extract_base64_images(attachments)
        Array(attachments).filter_map do |raw_att|
          att = raw_att.is_a?(Hash) ? raw_att.transform_keys(&:to_s) : {}
          data_url = (att["data_url"] || att["data"]).to_s.strip
          next if data_url.empty?

          mime = "image/png"
          b64 = data_url
          if data_url.include?(";base64,")
            header, b64 = data_url.split(";base64,", 2)
            mime = header.sub(/\Adata:/i, "").strip if header.start_with?("data:")
          end

          next if b64.bytesize > (MAX_INLINE_IMAGE_BYTES * 4 / 3)

          { mime_type: mime, data: b64.strip }
        end
      end

      def execute_tool(name, raw_args, proposed_edits)
        args = raw_args.is_a?(Hash) ? raw_args.transform_keys(&:to_s) : {}

        case name.to_s
        when "list_files"
          dir = args["directory"].presence || "."
          res = @sandbox.list_files(directory: dir, pattern: args["pattern"], limit: args["limit"] || 150)
          {
            summary: "Listed files in #{dir}#{args['pattern'] ? " (#{args['pattern']})" : ''}",
            output: JSON.generate(res),
            is_error: false
          }
        when "read_file"
          path = args["path"].to_s
          res = @sandbox.read_file(
            path: path,
            start_line: args["start_line"] || 1,
            end_line: args["end_line"] || 200
          )
          {
            summary: "Read #{res[:path]} (L#{res[:start_line]}–#{res[:end_line]})",
            output: JSON.generate(res),
            is_error: false
          }
        when "search_code"
          q = args["query"].to_s
          res = @sandbox.search_code(query: q, directory: args["directory"].presence || ".")
          {
            summary: "Searched workspace for \"#{q[0, 40]}\" (#{res[:matches].size} hits)",
            output: JSON.generate(res),
            is_error: false
          }
        when "list_feedbacks"
          mcp_res = ContextDrop::MCP::Tools::ListFeedbacks.call(args.merge("limit" => args["limit"] || 15))
          env_lbl = args["environment"].presence || "all"
          {
            summary: "Queried feedbacks (#{env_lbl})",
            output: mcp_res.dig(:content, 0, :text).to_s,
            is_error: !!mcp_res[:isError]
          }
        when "get_feedback"
          mcp_res = ContextDrop::MCP::Tools::GetFeedback.call(args.merge("include_images" => false))
          {
            summary: "Fetched feedback #{args['id']}",
            output: mcp_res.dig(:content, 0, :text).to_s,
            is_error: !!mcp_res[:isError]
          }
        when "propose_file_edit"
          staged = @sandbox.stage_edit(
            path: args["path"],
            old_string: args["old_string"],
            new_string: args["new_string"],
            summary: args["summary"]
          )
          proposed_edits << staged
          {
            summary: "Proposed diff for #{staged[:path]} (+#{staged[:added_lines]} -#{staged[:removed_lines]})",
            output: JSON.generate(
              staged_edit_id: staged[:id],
              path: staged[:path],
              status: "pending_user_approval",
              diff: staged[:diff]
            ),
            is_error: false
          }
        else
          {
            summary: "Unknown tool #{name}",
            output: JSON.generate(error: "Unknown tool: #{name}"),
            is_error: true
          }
        end
      rescue StandardError => e
        {
          summary: "#{name} failed",
          output: JSON.generate(error: e.message),
          is_error: true
        }
      end
    end
  end
end
