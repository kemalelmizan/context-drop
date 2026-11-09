# Change Proposal: ContextDrop Initial MVP (v0.1.0)

## Why
Ruby on Rails teams building internal tools or public-facing applications need a lightweight, self-hosted, open-source way to collect high-signal user feedback with rich visual and DOM context.

**ContextDrop** functions as an independent subsystem inside the host Rails application (`rails plugin new context_drop --mountable` with `isolate_namespace ContextDrop`). Following the principle **"ContextDrop owns its domain; the host application owns its identity and infrastructure"**, the gem encapsulates its own models, migrations (`context_drop_feedbacks`, `context_drop_attachments`, `context_drop_element_references`), submission controllers, self-hosted feedback dashboard views, and a decoupled framework-free Shadow DOM widget, while delegating user identity (`belongs_to :submitter, polymorphic: true, optional: true`), authentication, authorization policies, and Active Storage infrastructure to the host application.

## What Changes
- **ADDED** `engine-configuration`: Isolated mountable `ContextDrop::Engine`, `bin/rails generate context_drop:install` generator (initializer, route mounting, `context_drop:install:migrations`), environment gating (`CONTEXT_DROP_ENABLED`), `<%= context_drop_widget %>` view helper, decoupled frontend distribution, and polymorphic `current_submitter` / `authorize_submission` / `authorize_dashboard` hooks.
- **ADDED** `feedback-persistence`: Three engine-owned Active Record models and migrations:
  - `ContextDrop::Feedback` (`context_drop_feedbacks`) with polymorphic `submitter` (`optional: true`) and status workflow (`new`, `reviewed`, `resolved`, `dismissed`).
  - `ContextDrop::Attachment` (`context_drop_attachments`) with Active Storage `has_one_attached :file` for uploaded images and screenshots.
  - `ContextDrop::ElementReference` (`context_drop_element_references`) for sanitized point-in-time DOM element snapshots.
- **ADDED** `feedback-dashboard`: Self-hosted ERB dashboard views and controller (`ContextDrop::Dashboard::FeedbacksController`) mounted under `/context_drop/dashboard/feedbacks`, gated by `config.authorize_dashboard`.
- **ADDED** `http-ingestion-api`: Namespaced endpoints (`GET /context_drop/config`, `POST /context_drop/attachments`, `POST /context_drop/feedback`, `GET /context_drop/health`).
- **ADDED** `widget-composer`: Decoupled TypeScript Web Component (`<context-drop-widget>`) with Shadow DOM isolation, floating trigger button, prompt-style composer, attachment & element chip tray, keyboard navigation, and responsive layout.
- **ADDED** `dom-element-selection`: Interactive DOM element picker with hover bounding-box overlay, capture-phase click suppression (`preventDefault`/`stopPropagation`), continuous multi-element selection, and point-in-time sanitized snapshots.
- **ADDED** `screenshot-capture`: Viewport and element-scoped screenshot capture with ContextDrop UI hiding and graceful fallback.
- **ADDED** `security-and-privacy`: Recursive DOM sanitization (`data-feedback-ignore`, `data-feedback-sensitive`, sensitive inputs, no raw `outerHTML`), pre-capture screenshot redaction, server-side magic-byte MIME validation, CSRF protection, and rate limiting.

### Out of Scope (Non-Goals for v0.1.0)
- External multi-tenant cloud SaaS service.
- Built-in Jira, Linear, GitHub Issues, or Slack integrations (supported via `on_feedback_created` callbacks).
- AI categorization/summarization, session replay, continuous screen recording, or user-facing conversation threads.
- Model Context Protocol (MCP) server for IDEs (tracked in follow-up change `openspec/changes/mcp-server/`).

## Impact
- **Affected Specs:**
  - `engine-configuration`
  - `feedback-persistence`
  - `feedback-dashboard`
  - `http-ingestion-api`
  - `widget-composer`
  - `dom-element-selection`
  - `screenshot-capture`
  - `security-and-privacy`
- **Host Application Impact:**
  - Adds three engine-owned tables (`context_drop_feedbacks`, `context_drop_attachments`, `context_drop_element_references`) copied via `rails context_drop:install:migrations` and leverages the host application's Active Storage tables.
  - Mounts engine routes under `/context_drop` and renders `<context-drop-widget>` where `<%= context_drop_widget %>` is invoked.
