# Change Proposal: ContextDrop MCP Server for IDEs & Coding Agents (Phase 2)

## Why
Once ContextDrop (`initial-mvp`) collects rich contextual feedback in its engine-owned tables—including `ContextDrop::Feedback` (`page_url`, `message`), `ContextDrop::ElementReference` (`selector`, `dom_path`, `bounding_rect`, `attributes_snapshot`), and `ContextDrop::Attachment` (viewport and element screenshots stored via Active Storage)—the highest-leverage way for developers to act on that feedback is directly inside their IDE or AI coding agent (Cursor, Claude Code, Antigravity, Windsurf, VS Code).

By providing a built-in **Model Context Protocol (MCP)** server in the `context_drop` gem, developers and AI agents can:
1. List and search unresolved feedback items without leaving their editor.
2. Pull the exact `ElementReference` DOM selector, `dom_path`, and visual `Attachment` screenshots into the agent's context window to pinpoint the corresponding Rails route, controller, and ERB/ViewComponent/Phlex template.
3. Transition feedback status (`reviewed`, `resolved`, `dismissed`) directly from the IDE once the fix is implemented.

## What Changes
- **ADDED** `mcp-server`:
  - `ContextDrop::MCP::Server` implementing JSON-RPC 2.0 Model Context Protocol (`initialize`, `tools/list`, `tools/call`, `resources/list`, `resources/read`, `prompts/list`, `prompts/get`).
  - Local `stdio` transport via `bin/rails context_drop:mcp` rake task / CLI runner for zero-config local development.
  - Remote Streamable HTTP transport (`POST /context_drop/mcp`) in `ContextDrop::Engine` for querying staging/production feedback from a local IDE.
  - MCP Tools: `list_feedbacks`, `get_feedback`, `get_feedback_attachment`, and `update_feedback_status`.
  - MCP Resources (`contextdrop://feedbacks/new`, `contextdrop://feedbacks/{id}`) and Prompt (`investigate_feedback`).
- **MODIFIED** `engine-configuration`:
  - Adds `config.mcp_enabled` (default `false`), `config.mcp_api_key` (Bearer token), and `config.authorize_mcp` (optional custom policy proc) to `ContextDrop::Configuration`.

## Impact
- **Depends On:** `initial-mvp` (`ContextDrop::Feedback`, `ContextDrop::Attachment`, `ContextDrop::ElementReference`, and Active Storage integration).
- **Affected Specs:**
  - `mcp-server` (Added)
  - `engine-configuration` (Modified)
- **Security Impact:**
  - Local `stdio` transport runs under the local developer's shell permissions.
  - Remote HTTP transport (`/context_drop/mcp`) is disabled by default (`config.mcp_enabled = false`) and requires constant-time Bearer token authentication (`config.mcp_api_key`) or a custom `config.authorize_mcp` guard.
