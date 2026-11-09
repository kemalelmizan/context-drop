# frozen_string_literal: true

require_relative "context_drop/version"
require_relative "context_drop/base64_util"
require_relative "context_drop/configuration"
require_relative "context_drop/mcp/server"
require_relative "context_drop/engine" if defined?(Rails::Engine)

module ContextDrop
  class Error < StandardError; end

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
