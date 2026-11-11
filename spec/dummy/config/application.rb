# frozen_string_literal: true

require_relative "boot"
require "rails/all"
require "context_drop"
require "context_drop/engine"

module Dummy
  class Application < Rails::Application
    config.root = File.expand_path("..", __dir__)
    config.load_defaults Rails::VERSION::STRING.to_f
    config.eager_load = false
  end
end
