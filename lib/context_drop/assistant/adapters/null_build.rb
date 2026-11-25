# frozen_string_literal: true

module ContextDrop
  module Assistant
    module Adapters
      class NullBuild
        MSG = "Host Build pack not configured. Copy config/context_drop/build.rb from the install generator and register git/CI tools."

        def self.register!(config)
          (BuildPack::READ_TOOLS + BuildPack::WRITE_TOOLS).each do |spec|
            name = spec[:name]
            write = BuildPack::WRITE_TOOLS.any? { |w| w[:name] == name }
            config.register_build_tool(
              name: name,
              description: spec[:description],
              parameters: { type: "object", properties: {} },
              write: write
            ) do |_args|
              { error: MSG }
            end
          end
        end
      end
    end
  end
end