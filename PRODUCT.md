# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

1. **Internal Application Teams (QA Engineers, Product Managers, Support, Operations, Developers):** Filing high-signal visual and structural bug reports or UX feedback directly on live staging or production Ruby on Rails applications without switching contexts or manually opening browser DevTools to copy selectors and screenshots.
2. **External Application End-Users & Beta Testers:** Reporting UI issues, broken flows, or feature requests on customer-facing Rails applications through a low-friction chatbox composer while pinning exact page elements as context.
3. **Developers & AI Coding Agents (Cursor, Claude Code, Antigravity, Windsurf, VS Code):** Querying triaged feedback, sanitized DOM selectors, ancestor paths, and multimodal screenshots directly inside their IDE via the built-in Model Context Protocol (MCP) server (`stdio` and Streamable HTTP) or the self-hosted Rails dashboard.

## Product Purpose

**ContextDrop** (`context_drop`) is a self-hosted, open-source contextual feedback engine for Ruby on Rails applications (`Rails >= 7.1`, including `Rails 8+`). It turns vague feedback into actionable engineering context by pairing a floating, draggable chatbox-style composer and free-floating pin-drop element selector with sanitized DOM snapshots (`ElementReference`), privacy-redacted screenshots (`Attachment`), a self-hosted triage dashboard, and a native MCP server.

## Positioning

Unlike external SaaS feedback widgets that store sensitive DOM data and screenshots on third-party servers, or plain feedback forms that lose structural DOM context, ContextDrop is an encapsulated mountable Rails Engine (`isolate_namespace ContextDrop`) that stores all records in engine-owned tables (`context_drop_*`) and binary files in the host app's Active Storage, while exposing them directly to IDE coding agents over MCP.

## Operating Context

- Embedded on arbitrary host Rails pages via `<%= context_drop_widget %>` inside an isolated Web Component (`<context-drop-widget>`) with open Shadow DOM so host CSS and widget CSS never collide.
- Used over complex, layered, cascading web application layouts where users need to pin specific HTML elements—even when elements overlap or are deeply nested—using a freely draggable floating pin trigger, scroll-wheel/arrow-key DOM depth cycling, an interactive DOM breadcrumb bar, and a Figma/DevTools-style click-to-pick layer stack popover.
- The floating chatbox window can be dragged anywhere on the viewport, minimized to a compact bar while pinning elements on the page, and shows a session chat thread of submitted context drops.

## Capabilities and Constraints

- **Shadow DOM Isolation:** Zero mandatory dependencies on React, Vue, or external CSS frameworks; ships as a self-contained TypeScript bundle (`app/assets/javascripts/context_drop/context_drop.js`) and modular ESM source (`app/javascript/context_drop/`).
- **Freely Floating Pin & Draggable Chatbox:**
  - A pin-shaped selector located at the top-left corner (or configured initial position) that floats freely and can be dragged anywhere on the viewport to trigger element pinning or open the chatbox.
  - A draggable floating chatbox window with a prominent top-left pin selector button, session feedback message thread, context pin tray, auto-expanding prompt input, and minimize-to-compact-bar mode during element pinning.
- **Precision Cascading/Overlapping Element Disambiguation:**
  - Hovering during pin mode highlights the target element with live bounding-box geometry and tag/selector label.
  - Scroll-wheel (`wheel`) and keyboard (`ArrowUp` / `ArrowDown`) depth cycling smoothly steps up to parent containers or down into child/overlapping elements at the cursor point.
  - Clicking a point on the page anchors the pin and opens a floating layer stack popover (`document.elementsFromPoint` + ancestor/descendant hierarchy) with live hover preview and an interactive DOM breadcrumb bar (`section > div.card > button`) to pick the exact target element cleanly.
  - All pointer and click events on the host page are suppressed in the capture phase while pinning so host links, buttons, and forms never accidentally fire.
- **Zero-Trust Privacy & Redaction:** Mandatory recursive exclusion and screenshot redaction for `[data-feedback-ignore]`, `[data-feedback-sensitive]`, `input[type="password"]`, `input[type="hidden"]`, `[autocomplete^="cc-"]`, and custom `excluded_selectors`. Raw form `value` properties and `outerHTML` are never captured.

## Evidence on Hand

- Mountable Rails Engine backend (`app/models/context_drop/`, `app/controllers/context_drop/`, `lib/context_drop/`).
- Decoupled TypeScript widget source (`app/javascript/context_drop/`) and build pipeline (`scripts/build_widget.mjs`).
- Built-in MCP server (`lib/context_drop/mcp/`) supporting `stdio` and HTTP JSON-RPC 2.0.
- Ruby and TypeScript test suites (`spec/run_all.rb`, `npm test`).

## Product Principles

1. **Precision Over Guesswork:** Selecting a DOM element in a dense, overlapping layout must feel surgical and effortless—combining direct hover, depth scrolling, breadcrumb stepping, and an explicit layer stack picker.
2. **Stay Out of the Host's Way:** Both the floating pin and the chatbox window must be freely movable, minimizable to a compact bar while inspecting the page, and strictly isolated via Shadow DOM and capture-phase event interception.
3. **Zero-Trust Context Capture:** High-signal structural metadata and screenshots are captured without ever leaking sensitive inputs, credentials, or redacted DOM subtrees.
4. **Agent-Ready by Default:** Every pinned element and screenshot captured in the chatbox translates directly into structured `ElementReference` and `Attachment` payloads that IDE coding agents can consume immediately.
