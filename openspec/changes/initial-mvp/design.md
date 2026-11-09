# Technical Design: ContextDrop Initial MVP (v0.1.0)

## Context
ContextDrop must operate as a self-contained subsystem inside any modern Ruby on Rails application (Rails 7.1, 7.2, 8.0+). By enforcing a strict ownership boundary—**ContextDrop owns its domain; the host application owns its identity and infrastructure**—the gem avoids coupling to specific host authentication libraries (Devise, Sorcery, Authlogic, Rails 8 Authentication), user model names, or frontend CSS/JS frameworks.

## Goals / Non-Goals

### Goals
- **Mountable Rails Engine (`isolate_namespace ContextDrop`):** Encapsulate models, migrations, submission controllers, self-hosted dashboard views, routes, and attachment handling inside the gem.
- **Three Engine-Owned Tables:** Separate `context_drop_feedbacks`, `context_drop_attachments` (binary files via Active Storage), and `context_drop_element_references` (DOM element snapshots).
- **Polymorphic Submitter Attribution:** Use `belongs_to :submitter, polymorphic: true, optional: true` so any host user record (`User`, `Employee`, `Account`) or anonymous visitor works seamlessly.
- **Decoupled Frontend Widget:** Package the TypeScript Shadow DOM widget (`<context-drop-widget>`) separately from backend engine internals so it works across Importmaps, Propshaft, Sprockets, or JS bundlers.
- **Self-Hosted Feedback Dashboard:** Provide built-in ERB views (`/context_drop/dashboard/feedbacks`) gated by `config.authorize_dashboard`.

### Non-Goals
- Modifying or extending the host application's existing `User` table or layout CSS.
- Building an external hosted SaaS backend.

## Decisions

### Decision 1: Three Engine-Owned Domain Tables (`Feedback`, `Attachment`, `ElementReference`)
- **Choice:**
  - `ContextDrop::Feedback` (`context_drop_feedbacks`) owns the feedback submission, polymorphic `submitter`, `status`, and page context.
  - `ContextDrop::Attachment` (`context_drop_attachments`) owns binary image and screenshot metadata and binds to Active Storage via `has_one_attached :file`. Includes an optional `belongs_to :element_reference` foreign key so element-scoped screenshots link directly to the DOM element they depict.
  - `ContextDrop::ElementReference` (`context_drop_element_references`) owns structured DOM element snapshots (`tag_name`, `selector`, `dom_path`, `text_content`, `attributes_snapshot`, `bounding_rect`, `viewport`, `captured_at`).
- **Rationale:** Separating binary file attachments (`Attachment`) from structural DOM snapshots (`ElementReference`) produces a clean, normalized relational schema with dedicated columns for querying `selector` and `tag_name` in the dashboard and MCP server.

### Decision 2: Polymorphic `submitter` Association
- **Choice:** `belongs_to :submitter, polymorphic: true, optional: true` on `ContextDrop::Feedback`, populated by calling `ContextDrop.config.current_submitter.call(controller)`.
- **Rationale:** Avoids hardcoding `belongs_to :user` or assuming a `users` table exists. Works with `User`, `AdminUser`, `Employee`, `Customer`, or `nil` (anonymous).

### Decision 3: Engine-Owned Migrations & `context_drop:install` Generator
- **Choice:** Keep migrations inside the engine's `db/migrate/` directory. The `bin/rails generate context_drop:install` generator invokes `rails context_drop:install:migrations`, creates `config/initializers/context_drop.rb`, and mounts `ContextDrop::Engine => "/context_drop"` in `config/routes.rb`.
- **Rationale:** Follows standard Rails Engine conventions where the host application owns the physical database and migration execution history while the gem owns the schema definitions.

### Decision 4: Decoupled Frontend Widget Distribution
- **Choice:** Keep TypeScript widget source in `app/javascript/context_drop/` and ship a pre-compiled, zero-dependency browser bundle in `app/assets/javascripts/context_drop/context_drop.js` with Shadow DOM style isolation.
- **Rationale:** Separates frontend widget distribution from Rails Engine backend logic, supporting Propshaft, Sprockets, Importmaps, and esbuild/Vite without requiring a Node build step in the host application.

### Decision 5: Screenshot Capture & Pre-Capture Redaction
- **Choice:** Use an in-page DOM-to-canvas rasterizer that hides `<context-drop-widget>` and masks `[data-feedback-ignore]`, `[data-feedback-sensitive]`, `input[type="password"]`, `config.excluded_selectors`, and cross-origin `<iframe>` bounding boxes before pixel export, with graceful fallback if blocked by browser CSP.
- **Rationale:** Guarantees visual redaction of sensitive DOM nodes without triggering intrusive OS screen-sharing permission prompts.

### Decision 6: Database JSON Column Portability
- **Choice:** Use `:jsonb` when the Active Record connection adapter is PostgreSQL and `:json` on SQLite and MySQL.
- **Rationale:** Out-of-the-box compatibility across PostgreSQL, SQLite (Rails 8 default), and MySQL.

## Risks / Trade-offs

| Risk | Mitigation |
|---|---|
| Host application has not installed Active Storage prior to installing ContextDrop. | `context_drop:install` generator checks for `active_storage_blobs` migration/table and prompts or runs `rails active_storage:install`, and documents Active Storage as a prerequisite. |
| Host page event listeners fire when clicking elements in selection mode. | Intercept `pointerdown`, `mousedown`, `mouseup`, and `click` on `window` in the capture phase (`{ capture: true }`) with `preventDefault()`, `stopPropagation()`, and `stopImmediatePropagation()`. |
| Unauthorized access to `/context_drop/dashboard/feedbacks` in production. | Default `config.authorize_dashboard` to only allow `Rails.env.development?` unless explicitly configured by the host application in `config/initializers/context_drop.rb`. |
