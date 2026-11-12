# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

1. **Internal Application Teams (QA Engineers, Product Managers, Support, Operations, Developers):** Filing high-signal visual and structural bug reports or UX feedback directly on live staging or production Ruby on Rails applications without switching contexts or manually opening browser DevTools to copy selectors and screenshots.
2. **External Application End-Users & Beta Testers:** Reporting UI issues, broken flows, or feature requests on customer-facing Rails applications through a low-friction chatbox composer while pinning exact page elements as context.
3. **Developers & AI Coding Agents (In-Browser Local Sidebar + Cursor, Claude Code, Antigravity, Windsurf, VS Code):** Triaging cross-environment feedback (`local`, `staging`, `production`), inspecting sanitized DOM selectors and multimodal screenshots, and fixing local Rails views/controllers/styles either directly inside ContextDrop's local BYOK Agentic Coding Sidebar (`development` mode) or from their IDE via a single unified Model Context Protocol (MCP) server.

## Product Purpose

**ContextDrop** (`context_drop`) is a self-hosted, open-source contextual feedback and local agentic triage engine for Ruby on Rails applications (`Rails >= 7.1`, including `Rails 8+`). It turns vague feedback into actionable engineering context by pairing an unobtrusive **Book-Corner Fold Launcher** (which opens the feedback chatbox on click and morphs into a live DOM pushpin on drag) with sanitized DOM snapshots (`ElementReference`), privacy-redacted screenshots (`Attachment`), a single unified multi-environment MCP server, and—when running locally in `development`—a docked, defense-in-depth **BYOK Agentic Coding Sidebar**.

## Positioning

Unlike external SaaS feedback widgets that store sensitive DOM data and screenshots on third-party servers, or bulky floating pills that obscure host UI, ContextDrop sits flush in a `38×38px` page corner as an encapsulated mountable Rails Engine (`isolate_namespace ContextDrop`). It stamps every submission with the host `Rails.env`, stores all records in engine-owned tables (`context_drop_*`) and binary files in the host app's Active Storage, federates all environments (`local`, `staging`, `production`) behind a single local MCP server, and gives local developers an Antigravity / VS Code-style BYOK coding sidebar right beside their running Rails page.

## Operating Context

- Embedded on arbitrary host Rails pages via `<%= context_drop_widget %>` inside an isolated Web Component (`<context-drop-widget>`) with open Shadow DOM so host CSS and widget CSS never collide.
- Anchored when closed as a compact **Book-Corner dog-ear fold** flush against any viewport corner (`bottom_right`, `bottom_left`, `top_right`, `top_left`) and automatically adapted to a **3-Tier Environment Workflow**:
  1. **Production (`Rails.env.production?` → `selection_mode: "smart"`):** Opens a compact `356px` **Send Feedback** card for non-technical end-users. Hovering or peel-dragging coarsely promotes inner leaves (`<span>`, `<svg>`) to the nearest meaningful UI component (`button`, `card`, `banner`, `field`, `dialog`, `row`) with plain-language human labels (`“Complete Order” button`), captures an automatic privacy-redacted surrounding-context screenshot (`~84px` neighborhood, min `340×220px`), and hides all CSS selectors, pixel dimensions, layer counters, and keyboard shortcut badges while still submitting full sanitized technical coordinates under the hood.
  2. **Staging / QA (`staging`, `qa`, or non-loopback `development` → `selection_mode: "verbose"`):** Opens the `404px` **ContextDrop** verbose inspector composer (`v0.1.x` format) with exact `<tag#id.class>` & pixel geometry HUD, scroll-wheel/arrow-key overlapping layer scrubbing, `⌥⇧P` Freeze & Pin, and multi-element pinning.
  3. **Local Only (`Rails.env.development?` on loopback `127.0.0.1` / `::1`):** Defaults to the verbose inspector composer (same as staging/QA) so developers can test bug pinning and use their own external coding/IDE agents via MCP. Developers can opt into the experimental in-browser **BYOK Agentic Coding Sidebar** via `config.enable_local_agent = true` (`Agent | Feedback` toggle, cross-env MCP inbox, and human-approved inline diffs).

## Capabilities and Constraints

- **Shadow DOM Isolation:** Zero mandatory dependencies on React, Vue, or external CSS frameworks; ships as a self-contained TypeScript bundle (`app/assets/javascripts/context_drop/context_drop.js`) and modular ESM source (`app/javascript/context_drop/`).
- **Book-Corner Peel-to-Pin Launcher & Dual Surface Modes:**
  - Flush `38×38px` folded corner launcher that animates into a pushpin when dragged (`@keyframes cd-peel-to-pin`, honoring `prefers-reduced-motion`) to pin elements directly or snap between corners.
  - **Feedback Mode (`.cd-composer`):** Draggable floating chatbox composer with top-left Pin Element trigger, session thread, context pin tray, and Compact Pinning Bar collapse during inspection.
  - **Local Agentic Sidebar Mode (`.cd-agent-sidebar`):** Experimental resizable left/right docked coding sidebar (`development` + loopback `127.0.0.1`/`::1` only; disabled by default and enabled via `config.enable_local_agent = true`) with multi-provider BYOK (`Anthropic`, `Gemini`, `OpenAI`, `Custom OpenAI-Compatible`), cross-environment feedback attachment, read-only workspace inspection, and human-approved unified diff file edits (`Apply Change` / `Reject` / `Revert`). Focus remains on empowering external coding/IDE agents via the unified MCP server.
- **Unified Multi-Environment MCP Hub:**
  - Every `ContextDrop::Feedback` stamps the host `Rails.env` (`environment` column).
  - A single local `bin/rails context_drop:mcp` (`stdio`) server queries the local database and transparently federates configured remote HTTP environments (`staging`, `production`, etc.) via `list_environments`, `environment: "all" | "local" | "<env>"`, and `<env>:<id>` qualified IDs.
- **Precision Cascading/Overlapping Element Disambiguation:**
  - Hovering during pin mode (or peel-dragging from the book corner) highlights the target element with live bounding-box geometry and tag/selector label.
  - Scroll-wheel (`wheel`) and keyboard (`ArrowUp` / `ArrowDown`) depth cycling smoothly steps up to parent containers or down into child/overlapping elements at the cursor point.
  - Clicking a point on the page anchors the pin and opens a floating layer stack popover (`document.elementsFromPoint` + ancestor/descendant hierarchy) with live hover preview and an interactive DOM breadcrumb bar (`section > div.card > button`) to pick the exact target element cleanly.
  - All pointer and click events on the host page are suppressed in the capture phase while pinning so host links, buttons, and forms never accidentally fire.
- **Zero-Trust Privacy, Redaction & Local Agent Safety:**
  - Mandatory recursive exclusion and screenshot redaction for `[data-feedback-ignore]`, `[data-feedback-sensitive]`, `input[type="password"]`, `input[type="hidden"]`, `[autocomplete^="cc-"]`, and custom `excluded_selectors`. Raw form `value` properties and `outerHTML` are never captured.
  - BYOK API keys are resolved from local server `ENV` or stored server-side encrypted (`AES-256-GCM`, `0600`) in gitignored `tmp/context_drop_byok.enc`—never in browser `localStorage`, cookies, or DOM attributes.
  - Local agent tools enforce a `File.realpath` jail inside `Rails.root`, block `.env*`, `*.key`, `credentials.yml.enc`, `.git/config`, and `.git/hooks/*`, forbid arbitrary shell execution, and require explicit human approval before writing any staged diff to disk.

## Evidence on Hand

- Mountable Rails Engine backend (`app/models/context_drop/`, `app/controllers/context_drop/`, `lib/context_drop/`).
- Safe local BYOK agent orchestrator, workspace sandbox, encrypted key vault, and multi-provider LLM client (`lib/context_drop/agent/`).
- Decoupled TypeScript widget source (`app/javascript/context_drop/`) and build pipeline (`scripts/build_widget.mjs`).
- Unified multi-environment MCP server & router (`lib/context_drop/mcp/`) supporting `stdio` hub federation and remote HTTP JSON-RPC 2.0.
- Ruby and TypeScript test suites (`spec/run_all.rb`, `bundle exec rspec`, `npm test`).

## Product Principles

1. **Zero-Footprint Until Needed:** Rest quietly as a `38×38px` folded page corner rather than a wide floating banner—click to chat, or peel-and-drag the corner directly onto an element to pin it.
2. **Precision Over Guesswork:** Selecting a DOM element in a dense, overlapping layout must feel surgical and effortless—combining peel-to-pin drag, depth scrolling, breadcrumb stepping, and an explicit layer stack picker.
3. **Zero-Trust Context & Safe Local Agency:** Capture structural DOM metadata and screenshots without leaking secrets, keep BYOK keys encrypted server-side off the browser, and require explicit human diff approval for every local file change.
4. **One Unified Loop Across Environments:** Connect your IDE or local Agentic Sidebar once (`bin/rails context_drop:mcp`) to pull feedback across `local`, `staging`, and `production`, inspect live local code, and verify fixes immediately.

