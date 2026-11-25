# frozen_string_literal: true

module ContextDrop
  module Assistant
    module AskPack
      RECOMMENDED_TOOLS = [
        { name: "search_product_knowledge", required: false },
        { name: "resolve_page_context", required: false },
        { name: "list_known_issues", required: false }
      ].freeze

      FORBIDDEN_PREFIXES = ToolRegistry::ASK_FORBIDDEN_PREFIXES

      RESOURCES = [
        { uri: "host://help/{screen_id}", description: "Product help markdown." },
        { uri: "host://page-manifest", description: "URL to screen map." },
        { uri: "host://policy/assistant", description: "Assistant policy guardrails." }
      ].freeze
    end
  end
end