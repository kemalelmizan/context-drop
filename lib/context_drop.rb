# frozen_string_literal: true

module ContextDrop
  class Error < StandardError; end
end

require_relative "context_drop/version"
require_relative "context_drop/base64_util"
require_relative "context_drop/url_safety"
require_relative "context_drop/ssrf_guard"
require_relative "context_drop/secret_redactor"
require_relative "context_drop/configuration"
require_relative "context_drop/notification_secrets"
require_relative "context_drop/feedback_events/publisher"
require_relative "context_drop/notifications/webhook_client"
require_relative "context_drop/notifications/lark_client"
require_relative "context_drop/notifications/deliverer"
require_relative "context_drop/mcp/server"
require_relative "context_drop/agent/key_store"
require_relative "context_drop/agent/workspace_sandbox"
require_relative "context_drop/agent/llm_client"
require_relative "context_drop/agent/orchestrator"
require_relative "context_drop/assistant/safe_repo_reader"
require_relative "context_drop/assistant/patch_validator"
require_relative "context_drop/assistant/tool_registry"
require_relative "context_drop/assistant/ask_pack"
require_relative "context_drop/assistant/build_pack"
require_relative "context_drop/assistant/adapters/null_build"
require_relative "context_drop/assistant/dom_context_formatter"
require_relative "context_drop/assistant/feedback_confirmation"
require_relative "context_drop/assistant/build_executor"
require_relative "context_drop/assistant/orchestrator"
require_relative "context_drop/engine" if defined?(Rails::Engine)

module ContextDrop
  class << self
    def config
      @config ||= Configuration.new
    end

    alias configuration config

    def configure
      yield(config) if block_given?
      config
    end

    def reset_configuration!
      @config = Configuration.new
    end

    def enabled?
      !!config.enabled
    end
  end
end
