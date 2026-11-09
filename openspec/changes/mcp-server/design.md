# Technical Design: ContextDrop MCP Server (Phase 2)

## Context
After `initial-mvp` establishes feedback collection and persistence inside the host Rails application, developers need a frictionless bridge between persisted `ContextDrop::Feedback` records (both in local development and on staging/production servers) and their IDE / AI coding assistants. The Model Context Protocol (MCP) provides a standardized JSON-RPC 2.0 interface supported across modern IDEs and coding agents.

## Goals / Non-Goals

### Goals
- Support **zero-network local development** via a `stdio` transport (`bin/rails context_drop:mcp`).
- Support **remote staging/production querying** via a token-authenticated HTTP endpoint (`POST /context_drop/mcp`).
- Share a single transport-agnostic protocol core (`ContextDrop::MCP::Server` and `ContextDrop::MCP::Dispatcher`) between `stdio` and HTTP.
- Deliver screenshots and uploaded images as native MCP `image` content blocks (base64 + MIME type) so multimodal coding models can visually inspect UI bugs.
- Keep gem dependencies minimal (implement lightweight JSON-RPC 2.0 MCP message handling directly in Ruby without heavy external framework dependencies).

### Non-Goals
- Mutating host application source code from inside the remote Rails engine (code edits happen locally in the developer's IDE; the MCP server only reads feedback/attachments and updates feedback triage `status`).
- Streaming SSE push notifications for server-initiated events in the initial MCP release (request/response Streamable HTTP `POST /context_drop/mcp` is sufficient for all tool/resource/prompt calls).

## Decisions

### Decision 1: Shared Transport-Agnostic MCP Core
- **Choice:** Implement `ContextDrop::MCP::Dispatcher` which accepts a parsed JSON-RPC 2.0 request hash and returns a JSON-RPC 2.0 response hash (or `nil` for notifications like `notifications/initialized`).
- **Rationale:**
  - `ContextDrop::MCP::StdioRunner` simply reads newline-delimited JSON-RPC messages from `$stdin`, passes them to `Dispatcher.call`, and writes JSON lines to `$stdout` (while redirecting `Rails.logger` to `$stderr` so stdout stays strictly valid JSON-RPC).
  - `ContextDrop::McpController#create` (`POST /context_drop/mcp`) authenticates the HTTP request, passes the JSON body to `Dispatcher.call`, and renders the JSON-RPC response with `200 OK` (or `202 Accepted` for notifications).

### Decision 2: Stdio Logging Isolation
- **Choice:** When running `bin/rails context_drop:mcp`, automatically redirect `Rails.logger` and `ActiveRecord::Base.logger` to `$stderr` (or silence SQL debug logs unless `CONTEXT_DROP_MCP_DEBUG=1`).
- **Rationale:** Any non-JSON output written to `stdout` during Rails boot or Active Record queries will corrupt the MCP `stdio` JSON-RPC stream in the IDE.

### Decision 3: Remote HTTP Authentication (`mcp_api_key` + `authorize_mcp`)
- **Choice:**
  1. Require `ContextDrop.config.mcp_enabled == true` (otherwise return `404 Not Found`).
  2. Skip Rails browser CSRF token verification on `POST /context_drop/mcp` (since MCP clients are non-browser CLI/IDE processes) and instead enforce strict Bearer token authentication via `ActiveSupport::SecurityUtils.secure_compare` against `ContextDrop.config.mcp_api_key` (or `config.authorize_mcp.call(controller)` when configured).
  3. Refuse to allow unauthenticated HTTP MCP requests even if both `mcp_api_key` and `authorize_mcp` are nil (fail closed with `401 Unauthorized`).
- **Rationale:** Feedback records and screenshots may contain internal application state; remote MCP access must be fail-closed and resistant to timing attacks.

### Decision 4: Multimodal Image Delivery in `get_feedback` and `get_feedback_attachment`
- **Choice:** When `include_images: true` (default) is passed to `get_feedback` (or when calling `get_feedback_attachment`), read the Active Storage blob bytes (`attachment.file.download`), base64-encode them (`Base64.strict_encode64`), and return an MCP `image` content block:
  ```json
  {
    "type": "image",
    "data": "<base64-encoded-bytes>",
    "mimeType": "image/png"
  }
  ```
  alongside the structured text/JSON content block containing the feedback attributes and DOM `element` metadata.
- **Rationale:** Works identically over both local `stdio` and remote HTTP without requiring the IDE agent to authenticate separately against private S3/GCS/local Active Storage URLs.

## Risks / Trade-offs

| Risk | Mitigation |
|---|---|
| Rails boot messages or gems writing to `STDOUT` break `stdio` MCP protocol parsing. | Capture/redirect `$stdout` to `$stderr` during Rails environment load in the rake task, reserving the original `STDOUT` file descriptor exclusively for the JSON-RPC writer. |
| Large or numerous screenshots in a single feedback record could produce oversized base64 MCP payloads. | Default `get_feedback` to inline blobs up to `5 MB` per attachment and provide `include_images: false` + individual `get_feedback_attachment(attachment_id)` for on-demand fetching. |
