# frozen_string_literal: true

require_relative "lib/context_drop/version"

Gem::Specification.new do |spec|
  spec.name        = "context_drop"
  spec.version     = ContextDrop::VERSION
  spec.authors     = ["Kemal Elmizan"]
  spec.email       = ["kemal@elmizan.com"]
  spec.homepage    = "https://github.com/kemalelmizan/context-drop"
  spec.summary     = "Self-hosted contextual feedback engine, Shadow DOM widget, and MCP server for Ruby on Rails."
  spec.description = <<~DESC
    ContextDrop is a self-hosted contextual feedback library for Ruby on Rails applications.
    It provides a mountable Rails Engine with engine-owned persistence, a decoupled TypeScript
    Shadow DOM prompt-style feedback composer with interactive DOM element selection and
    privacy-redacted screenshots, a self-hosted triage dashboard, and a built-in Model Context
    Protocol (MCP) server for IDEs and coding agents.
  DESC
  spec.license     = "MIT"

  spec.required_ruby_version = ">= 3.1.0"

  spec.metadata["homepage_uri"] = spec.homepage
  spec.metadata["source_code_uri"] = spec.homepage
  spec.metadata["changelog_uri"] = "#{spec.homepage}/blob/main/CHANGELOG.md"
  spec.metadata["rubygems_mfa_required"] = "true"

  spec.files = Dir.chdir(File.expand_path(__dir__)) do
    Dir[
      "{app,config,db,lib}/**/*",
      "MIT-LICENSE",
      "Rakefile",
      "README.md",
      "SPEC.md"
    ].reject { |f| File.directory?(f) }
  end

  spec.require_paths = ["lib"]

  spec.add_dependency "actionpack", ">= 7.1"
  spec.add_dependency "activerecord", ">= 7.1"
  spec.add_dependency "activestorage", ">= 7.1"
  spec.add_dependency "activesupport", ">= 7.1"
  spec.add_dependency "marcel", ">= 1.0"
  spec.add_dependency "railties", ">= 7.1"

  spec.add_development_dependency "rake", ">= 13.0"
  spec.add_development_dependency "rspec-rails", ">= 6.0"
  spec.add_development_dependency "rubocop", ">= 1.50"
  spec.add_development_dependency "sqlite3", ">= 1.6"
end
