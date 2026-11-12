# Technical Design: ContextDrop v0.2

## 1. Book-Corner Peel-to-Pin & Corner Snapping
- **Resting Footprint:** `.cd-book-corner` renders flush (`0px` corner offset) at the configured corner (`top_left`, `top_right`, `bottom_left`, `bottom_right`) with a `44×44px` accessible hit target and a `38×38px` diagonal Warm Paper (`#faf9f6`) crease revealing Pin Vermilion (`#c2410c`) beneath.
- **Pointer State Machine:**
  - `pointerdown` records `(startX, startY)`.
  - Movement `<= 6px` followed by `pointerup` / `click` triggers `toggleActiveSurface()` (opening either `.cd-agent-sidebar` in local dev or `.cd-composer` in standard mode).
  - Movement `> 6px` transitions into **Peel-Drag Mode**:
    1. `.cd-book-corner` collapses (`is-peeling`), and `.cd-drag-pin` animates from the folded paper geometry into the asymmetric pushpin badge tracking `(clientX, clientY)` via `translate3d`.
    2. If `(clientX, clientY)` enters any viewport corner snap zone (`64×64px`), `.cd-corner-snap-ghost` highlights that target corner and `ElementPicker` pauses candidate highlighting.
    3. Outside corner snap zones, `ElementPicker` runs in dragged-loupe mode (`highlightAtPoint` + `wheel` depth cycling).
    4. On `pointerup`:
       - Inside a corner snap zone: updates `config.position` to that corner (unless returning to the origin corner without leaving, which cancels) and docks `.cd-book-corner`.
       - Over an active selectable DOM candidate: captures `ElementReferenceSnapshot`, stops `ElementPicker`, and opens the active composer/sidebar with the pinned chip attached.

## 2. Host Environment Attribution & Unified Multi-Environment MCP Hub
- **Host Environment Resolution:** `ContextDrop.config.resolved_environment` reads explicit `config.environment` or `Rails.env` (defaulting to `"development"`).
- **Schema & Backward Compatibility:** Migration `20261112000004_add_environment_to_context_drop_feedbacks` adds `environment: string` (`default: "development"`, indexed). `Feedback` and `FeedbacksController` check `has_attribute?(:environment)` and also mirror `"environment"` in `metadata` so unmigrated host databases remain compatible.
- **Single-Server MCP Federation (`ContextDrop::MCP::EnvironmentRouter` & `RemoteClient`):**
  - `bin/rails context_drop:mcp` registers `"local"` (aliasing the local host's `resolved_environment`) plus remote HTTP environments from `config.mcp_environments` and `ENV["CONTEXT_DROP_<NAME>_MCP_URL"]`.
  - Incoming HTTP requests on `ContextDrop::McpController` execute inside `EnvironmentRouter.with_local_only { ... }` (and reject recursive fan-out via `X-Context-Drop-Federated: 1`), guaranteeing remote servers strictly serve their own database.
  - Remote MCP calls use `Net::HTTP` with TLS required for non-loopback hosts, strict connect/read timeouts, Bearer authentication, and warning isolation when a remote environment is offline.

## 3. Safe Local BYOK Agentic Sidebar
- **Defense-in-Depth Access Control (`ContextDrop::AgentController`):**
  1. **Environment Gate:** Hard-returns `404 Not Found` whenever `Rails.env.production?` or `!ContextDrop.config.local_agent_allowed?`.
  2. **Loopback Network Gate:** Requires `remote_ip` / `remote_addr` in `{127.0.0.1, ::1, ::ffff:127.0.0.1}` and rejects requests carrying non-loopback `X-Forwarded-For` headers (blocking reverse-proxy tunnels).
  3. **Host & Origin Verification:** Restricts `Host` to loopback hostnames (`localhost`, `127.0.0.1`, `[::1]`, `*.localhost`) to defeat DNS rebinding, enforces matching `Origin` on mutating requests, and validates Rails CSRF tokens.
- **Encrypted Server-Side BYOK (`ContextDrop::Agent::KeyStore`):**
  - Resolves credentials in priority order: encrypted local vault (`tmp/context_drop_byok.enc` using `AES-256-GCM` with `0600` key material in `tmp/context_drop_vault.key`) or process `ENV` (`ANTHROPIC_API_KEY`, `GEMINI_API_KEY` / `GOOGLE_API_KEY`, `OPENAI_API_KEY`, `CONTEXT_DROP_LLM_API_KEY`).
  - Browser responses expose only masked hints (`••••abcd`) and source (`env` | `vault`).
- **Workspace Jail & Human-Approved Diffs (`ContextDrop::Agent::WorkspaceSandbox`):**
  - Resolves every path via `File.realpath` inside `workspace_root`, blocking symlink escapes and denylisted paths (`.env*`, `config/master.key`, `config/credentials*`, `.git/**`, `tmp/context_drop_*`, private keys, `node_modules/**`, `vendor/**`, `storage/**`).
  - `propose_file_edit` stages an in-memory/tmp `PendingEdit` containing `original_sha256`, `proposed_content`, and a unified diff without touching disk.
  - `POST /context_drop/agent/edits/:id/apply` verifies on-disk `SHA-256 == original_sha256` before atomic write and records `applied_sha256` to support 1-click `POST /context_drop/agent/edits/:id/revert`.
