# Implementation Tasks: ContextDrop MCP Server (Phase 2)

## 1. Configuration & Engine Routes
- [ ] 1.1 Add `mcp_enabled` (default `false`), `mcp_api_key` (default `nil`), and `authorize_mcp` (default `nil`) to `ContextDrop::Configuration` and document them in the `context_drop:install` initializer template.
- [ ] 1.2 Add `POST /context_drop/mcp` route to `ContextDrop::Engine` (`config/routes.rb`).

## 2. MCP Protocol Core & Tools
- [ ] 2.1 Implement `ContextDrop::MCP::Server` and `ContextDrop::MCP::Dispatcher` (`lib/context_drop/mcp/dispatcher.rb`) handling JSON-RPC 2.0 `initialize`, `notifications/initialized`, `ping`, `tools/list`, `tools/call`, `resources/list`, `resources/read`, `prompts/list`, and `prompts/get`.
- [ ] 2.2 Implement `list_feedbacks` tool (`lib/context_drop/mcp/tools/list_feedbacks.rb`) supporting filtering by `status`, `page_url` substring, free-text `query` (searching `message` and element attachment selectors/text), `limit` (max `100`), and `offset`.
- [ ] 2.3 Implement `get_feedback` tool (`lib/context_drop/mcp/tools/get_feedback.rb`) returning full feedback attributes, viewport metadata, `element` snapshots (`tag_name`, `selector`, `dom_path`, `text_content`, `attributes`, `bounding_rect`), and base64-encoded MCP `image` content blocks for screenshots/images when `include_images: true`.
- [ ] 2.4 Implement `get_feedback_attachment` tool (`lib/context_drop/mcp/tools/get_feedback_attachment.rb`) returning a single attachment's metadata and base64 MCP `image` content block.
- [ ] 2.5 Implement `update_feedback_status` tool (`lib/context_drop/mcp/tools/update_feedback_status.rb`) validating and transitioning a feedback record's `status` (`new`, `reviewed`, `resolved`, `dismissed`).
- [ ] 2.6 Implement MCP resources (`contextdrop://feedbacks/new`, `contextdrop://feedbacks/{id}`) and the `investigate_feedback` diagnostic prompt (`lib/context_drop/mcp/prompts/investigate_feedback.rb`).

## 3. Transports (`stdio` & Streamable HTTP)
- [ ] 3.1 Implement `ContextDrop::MCP::StdioRunner` (`lib/context_drop/mcp/stdio_runner.rb`) and the `bin/rails context_drop:mcp` rake task (`lib/tasks/context_drop_tasks.rake`), ensuring `$stdout` is reserved strictly for JSON-RPC frames and Rails/ActiveRecord logs are routed to `$stderr`.
- [ ] 3.2 Implement `ContextDrop::McpController#create` (`app/controllers/context_drop/mcp_controller.rb`) enforcing `config.mcp_enabled` (`404` when disabled) and fail-closed constant-time Bearer token verification (`ActiveSupport::SecurityUtils.secure_compare` against `config.mcp_api_key` or `config.authorize_mcp`).

## 4. Testing & IDE Setup Documentation
- [ ] 4.1 Write unit and request specs for `ContextDrop::MCP::Dispatcher`, all 4 MCP tools, resource templates, and the `investigate_feedback` prompt.
- [ ] 4.2 Write security request specs for `POST /context_drop/mcp` covering disabled state (`404`), missing/invalid bearer token (`401`), nil API key fail-closed behavior (`401`), and valid bearer token execution (`200`).
- [ ] 4.3 Write integration tests for `ContextDrop::MCP::StdioRunner` verifying clean JSON-RPC 2.0 framing over `stdin`/`stdout`.
- [ ] 4.4 Document IDE MCP configuration examples (Cursor, Claude Code, Antigravity, VS Code, Windsurf) for both local `stdio` and remote HTTP in `README.md`.
