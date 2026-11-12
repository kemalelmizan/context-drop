# Change Proposal: ContextDrop v0.2 — Book-Corner Peel-to-Pin, Unified Multi-Environment MCP & Local BYOK Agentic Sidebar

## Why
ContextDrop v0.1 introduced a Shadow DOM floating pill dock, overlapping DOM layer disambiguation, Active Storage persistence, and per-environment MCP servers. In real-world developer workflows, three friction points emerged:
1. **Viewport Footprint:** The always-visible pill dock (`[ :: | Pin | ContextDrop ]`) occupied ~180px of corner width, occasionally overlapping topbars or action buttons on dense Rails pages.
2. **Multi-Server MCP Sprawl:** Registering separate MCP server entries (`context-drop-local`, `context-drop-staging`, `context-drop-production`) in IDE configs forced manual switching and omitted native host `Rails.env` attribution on persisted feedbacks.
3. **Browser-to-Editor Context Hop during Local Development:** When running a Rails app locally (`development`), developers want to pin a broken element directly on the live page and collaborate with an AI coding agent right beside the page—inspecting views/CSS, pulling staging/production feedbacks, and reviewing safe inline file diffs—without leaving the browser.

## What Changes
- **MODIFIED** `widget-composer` & `dom-element-selection`:
  - Replaces the floating pill dock with a compact **Book-Corner Fold Launcher** (`.cd-book-corner`) flush against any of the four viewport corners (`top_left`, `top_right`, `bottom_left`, `bottom_right`).
  - **Click** opens the active surface (Standard Feedback Chatbox in non-local environments, or the docked Agentic Sidebar in local `development`).
  - **Peel-and-Drag** animates the folded corner into a live **Pushpin Loupe** (`.cd-drag-pin`) tracking pointer coordinates: releasing over a selectable DOM element pins it directly (with wheel depth cycling while dragging) and opens the composer/sidebar; releasing inside any viewport corner snap zone re-docks the book corner to that corner.
- **MODIFIED** `feedback-persistence` & `engine-configuration`:
  - Adds `config.environment` (defaulting automatically to `Rails.env`) and adds an indexed `environment` column on `context_drop_feedbacks` (with automatic fallback to `metadata["environment"]` prior to migration).
  - Adds `config.mcp_environments` (plus automatic `CONTEXT_DROP_<ENV>_MCP_URL` / `CONTEXT_DROP_<ENV>_MCP_API_KEY` environment variable discovery) and `config.local_agent_enabled`.
- **MODIFIED** `mcp-server`:
  - Consolidates multi-environment triage into **one** unified `context-drop` MCP server (`bin/rails context_drop:mcp`) that natively queries the host's local database and federates configured remote HTTP ContextDrop environments (`staging`, `production`, etc.) with loop-prevention guards.
  - Adds `list_environments` tool and extends `list_feedbacks`, `get_feedback`, `get_feedback_attachment`, `update_feedback_status`, `investigate_feedback`, and MCP resources with `environment` filtering (`"local"`, `"staging"`, `"production"`, `"all"`) and composite `<env>:<id>` identifiers.
- **ADDED** `local-agent-sidebar`:
  - Transforms the local `development` widget into a resizable Antigravity / VS Code-style **Agentic Coding Sidebar** (with a one-click header switch to preview the Standard Feedback Form).
  - Supports **BYOK** across Anthropic, Google Gemini, OpenAI, and OpenAI-compatible endpoints via a server-side encrypted vault (`tmp/context_drop_byok.enc`) and automatic `ENV` detection—never exposing API keys to `localStorage` or the DOM.
  - Enforces defense-in-depth safety: hard `production` kill-switch, strict loopback IP (`127.0.0.1` / `::1`) + `Host`/`Origin` + CSRF verification, `File.realpath` workspace path-traversal jail, secret/hook denylist (`.env*`, `master.key`, `credentials*`, `.git/**`), zero shell execution, and mandatory human-in-the-loop **Diff Approve / Reject / Revert** for all file edits.

## Impact
- **Depends On:** `initial-mvp`, `mcp-server`
- **Affected Specs:** `widget-composer`, `dom-element-selection`, `feedback-persistence`, `engine-configuration`, `mcp-server`, `security-and-privacy`
- **Security Impact:** Local agent routes (`/context_drop/agent/*`) are structurally unreachable outside `development` loopback requests, never execute shell commands, block secret/git paths, encrypt BYOK credentials on disk with `0600` permissions, and gate all disk writes behind SHA-256-verified user diff approval.
