# frozen_string_literal: true

module ContextDrop
  module Assistant
    class ToolRegistry
      Entry = Struct.new(:definition, :callable, :write, keyword_init: true)

      BUILD_READ_NAMES = %w[
        build_context_resolve
        repo_read_file
        repo_search
        build_status_get
      ].freeze

      BUILD_WRITE_NAMES = %w[
        git_create_branch
        git_apply_patches
        git_push_branch
        pull_request_open
        change_set_abandon
      ].freeze

      ASK_FORBIDDEN_PREFIXES = %w[git_ change_set_ pull_request_ repo_ deploy_ run_shell].freeze

      def initialize(config: ContextDrop.config)
        @config = config
      end

      def tools_for_mode(mode, allow_write: false)
        case mode.to_s
        when "ask"
          ask_tools
        when "build"
          build_tools(allow_write: allow_write)
        else
          []
        end
      end

      def call_tool!(mode, name, args, allow_write: false)
        entry = find_entry(mode, name, allow_write: allow_write)
        raise ContextDrop::Error, "Tool not allowed: #{name}" unless entry

        result = entry.callable.call(args.is_a?(Hash) ? args.transform_keys(&:to_s) : {})
        normalize_result(result)
      rescue ContextDrop::Error
        raise
      rescue StandardError => e
        { error: e.message, is_error: true }
      end

      def validate_ask_registration!(name)
        n = name.to_s
        ASK_FORBIDDEN_PREFIXES.each do |prefix|
          raise ContextDrop::Error, "Ask tool #{n.inspect} is forbidden (matches #{prefix})" if n.start_with?(prefix)
        end
      end

      private

      def ask_tools
        gem_core_tools("ask") + @config.assistant_ask_entries.map { |e| e.definition }
      end

      def build_tools(allow_write:)
        defs = gem_core_tools("build")
        defs += @config.assistant_build_entries.reject(&:write).map(&:definition)
        defs += @config.assistant_build_entries.select(&:write).map(&:definition) if allow_write
        defs
      end

      def gem_core_tools(mode)
        return [] unless mode == "build"

        [propose_change_set_definition]
      end

      def propose_change_set_definition
        {
          name: "propose_change_set",
          description: "Stage a ChangeSet with file patches for user approval (does not write to git).",
          parameters: {
            type: "object",
            required: %w[summary patches],
            properties: {
              summary: { type: "string" },
              patches: {
                type: "array",
                items: {
                  type: "object",
                  required: %w[path old_string new_string],
                  properties: {
                    path: { type: "string" },
                    old_string: { type: "string" },
                    new_string: { type: "string" }
                  }
                }
              }
            }
          }
        }
      end

      def find_entry(mode, name, allow_write:)
        n = name.to_s
        if n == "propose_change_set"
          return Entry.new(
            definition: propose_change_set_definition,
            callable: ->(_args) { { note: "handled by orchestrator" } },
            write: false
          )
        end

        list = mode.to_s == "ask" ? @config.assistant_ask_entries : @config.assistant_build_entries
        list.find { |e| e.definition[:name].to_s == n && (allow_write || !e.write) }
      end

      def normalize_result(result)
        if result.is_a?(Hash) && result[:is_error]
          result
        elsif result.is_a?(Hash) && result.key?(:error)
          result.merge(is_error: true)
        else
          { data: result, is_error: false }
        end
      end
    end
  end
end