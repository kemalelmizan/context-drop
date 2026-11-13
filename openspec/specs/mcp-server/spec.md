# Model Context Protocol (MCP) Server Specification

## Purpose
Defines the built-in Model Context Protocol (MCP) server (`ContextDrop::MCP::Server`) that enables developers and AI coding assistants in IDEs (e.g., Cursor, Claude Code, Antigravity, Windsurf, VS Code) to query submitted `ContextDrop::Feedback` records, inspect `ContextDrop::ElementReference` selectors/paths and `ContextDrop::Attachment` screenshots, and transition feedback status (`new`, `reviewed`, `resolved`, `dismissed`) over either a local `stdio` transport or a token-authenticated remote HTTP endpoint.

## Requirements

### Requirement: Local Stdio MCP Transport
ContextDrop SHALL provide a Rails runner/rake command (`bin/rails context_drop:mcp`) that starts a Model Context Protocol (`JSON-RPC 2.0`) server over standard input and standard output (`stdio`), querying the local Rails application's `ContextDrop::Feedback`, `ContextDrop::Attachment`, and `ContextDrop::ElementReference` records and Active Storage blobs directly without requiring an external web server.

#### Scenario: IDE spawns local stdio MCP server
- **GIVEN** a developer configures their IDE's MCP settings to run `bin/rails context_drop:mcp` in the host Rails repository
- **WHEN** the IDE sends an MCP `initialize` and `tools/list` JSON-RPC 2.0 request over `stdin`
- **THEN** the process responds over `stdout` with valid MCP server capabilities and the registered tools (`list_feedbacks`, `get_feedback`, `get_feedback_attachment`, `update_feedback_status`), resources, and prompts

### Requirement: Authenticated Remote HTTP MCP Endpoint
When `ContextDrop.config.mcp_enabled` is `true`, `ContextDrop::Engine` SHALL expose `POST /context_drop/mcp` implementing the MCP Streamable HTTP JSON-RPC 2.0 transport, and MUST authenticate every request using constant-time bearer token verification against `ContextDrop.config.mcp_api_key` (or a custom `ContextDrop.config.authorize_mcp` proc).

#### Scenario: Remote HTTP MCP request when MCP is disabled
- **GIVEN** `ContextDrop.config.mcp_enabled` is `false` (the default)
- **WHEN** a client sends `POST /context_drop/mcp`
- **THEN** the engine rejects the request with `404 Not Found`

#### Scenario: Remote HTTP MCP request with invalid or missing Bearer token
- **GIVEN** `ContextDrop.config.mcp_enabled` is `true` and `ContextDrop.config.mcp_api_key` is `"secret_mcp_token_123"`
- **WHEN** a client sends `POST /context_drop/mcp` without an `Authorization` header or with an invalid token
- **THEN** the engine rejects the request with `401 Unauthorized` before parsing or executing any MCP JSON-RPC method

#### Scenario: Authenticated remote HTTP MCP request
- **GIVEN** `ContextDrop.config.mcp_enabled` is `true` and `ContextDrop.config.mcp_api_key` is `"secret_mcp_token_123"`
- **WHEN** an IDE sends `POST /context_drop/mcp` with `Authorization: Bearer secret_mcp_token_123` and a valid MCP JSON-RPC 2.0 payload
- **THEN** the engine executes the MCP request and responds with `200 OK` and a JSON-RPC 2.0 result payload

### Requirement: Feedback Listing & Search Tool (`list_feedbacks`)
The MCP server SHALL expose a `list_feedbacks` tool that filters active `ContextDrop::Feedback` records by default (`deleted_at IS NULL`, unless `include_deleted: true` is passed) by `status` (`new`, `reviewed`, `resolved`, `dismissed`), `page_url` substring, free-text `query` (matching `message` or associated `ContextDrop::ElementReference` selectors/text), `limit` (default `20`, maximum `100`), and `offset`, ordered newest first.

#### Scenario: Filtering unresolved feedbacks for a specific page
- **GIVEN** the database contains active and soft-deleted feedback records across `/checkout` and `/settings` with statuses `"new"` and `"resolved"`
- **WHEN** an IDE agent invokes the MCP tool `list_feedbacks` with `{ "status": "new", "page_url": "/checkout" }`
- **THEN** the tool returns only the active `"new"` feedback records matching `/checkout` (excluding soft-deleted records unless `include_deleted: true` is specified), including each record's `id`, `message`, `page_url`, `status`, `created_at`, attachment counts, and attached `ElementReference` selectors

### Requirement: Full Feedback Context & Multimodal Screenshot Retrieval (`get_feedback` & `get_feedback_attachment`)
The MCP server SHALL expose `get_feedback` and `get_feedback_attachment` tools that return the complete `ContextDrop::Feedback` record, viewport/environment metadata, all `ContextDrop::ElementReference` records (`tag_name`, `selector`, `dom_path`, `text_content`, `attributes_snapshot`, `bounding_rect`), and binary `ContextDrop::Attachment` screenshots/images encoded as MCP `image` base64 content blocks so multimodal coding agents can inspect visual bugs alongside DOM selectors.

#### Scenario: Retrieving full feedback with ElementReference snapshot and Attachment screenshot
- **GIVEN** feedback `#42` has an attached `#checkout-button` `ContextDrop::ElementReference` and a PNG `ContextDrop::Attachment` screenshot stored in Active Storage
- **WHEN** an IDE agent calls `get_feedback` with `{ "id": 42, "include_images": true }`
- **THEN** the tool response includes a structured JSON text block containing the feedback details and the `#checkout-button` `dom_path`, `selector`, and `bounding_rect`
- **AND** includes an MCP `image` content block (`mimeType: "image/png"`, base64 `data`) representing the captured screenshot

### Requirement: Feedback Status Triage Tool (`update_feedback_status`)
The MCP server SHALL expose an `update_feedback_status` tool allowing the developer or coding agent to transition a feedback record's `status` between allowed statuses (`"new"`, `"reviewed"`, `"resolved"`, `"dismissed"`).

#### Scenario: Agent marks a feedback item as resolved after fixing the bug
- **GIVEN** feedback `#42` currently has `status: "new"`
- **WHEN** the IDE agent calls `update_feedback_status` with `{ "id": 42, "status": "resolved" }`
- **THEN** feedback `#42` is updated to `status: "resolved"` in the database
- **AND** the tool returns the updated feedback summary with `status: "resolved"` and `updated_at`

### Requirement: Diagnostic Prompt & Resource Templates
The MCP server SHALL expose resource templates (`contextdrop://feedbacks/new` and `contextdrop://feedbacks/{id}`) and an `investigate_feedback` MCP prompt that formats a feedback record's message, originating `page_url`, `ElementReference` selectors/paths, and `Attachment` screenshots into an actionable investigation brief for the coding agent.

#### Scenario: Invoking the `investigate_feedback` prompt in an IDE
- **GIVEN** feedback `#42` reports a broken checkout button on `/checkout` with selector `#checkout-button`
- **WHEN** the developer invokes the MCP prompt `investigate_feedback` with `feedback_id: 42`
- **THEN** the server returns prompt messages instructing the agent to locate the route/controller for `/checkout`, search view templates for `#checkout-button` (`html > body > main > button`), inspect the attached screenshot, and propose a fix
