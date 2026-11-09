# Implementation Tasks: ContextDrop Initial MVP (v0.1.0)

## 1. Mountable Rails Engine & Installer Generator
- [x] 1.1 Scaffold mountable Rails plugin structure (`rails plugin new context_drop --mountable` layout, `context_drop.gemspec`, `Gemfile`, `lib/context_drop/engine.rb` with `isolate_namespace ContextDrop`).
- [x] 1.2 Implement `ContextDrop::Configuration` (`lib/context_drop/configuration.rb`) with `ContextDrop.configure` and settings (`enabled`, `position`, `storage`, `allow_anonymous`, `max_attachments`, `max_element_references`, `max_attachment_size`, `allowed_content_types`, `element_selection`, `screenshot_capture`, `excluded_selectors`, `current_submitter`, `authorize_submission`, `authorize_dashboard`, `rate_limit`, `on_feedback_created`).
- [x] 1.3 Implement `bin/rails generate context_drop:install` (`lib/generators/context_drop/install/install_generator.rb`) to create `config/initializers/context_drop.rb`, mount `ContextDrop::Engine => "/context_drop"`, copy engine migrations (`context_drop:install:migrations`), and check Active Storage setup.
- [x] 1.4 Implement `ContextDrop::WidgetHelper#context_drop_widget` (`app/helpers/context_drop/widget_helper.rb`) supporting `enabled` gating, `authorize_submission` checks, and per-invocation option overrides.

## 2. Engine-Owned Migrations & Domain Models (`Feedback`, `Attachment`, `ElementReference`)
- [x] 2.1 Create engine migrations in `db/migrate/` for `context_drop_feedbacks` (with polymorphic `submitter_type`/`submitter_id`), `context_drop_attachments` (with `feedback_id` and nullable `element_reference_id`), and `context_drop_element_references` (with `tag_name`, `selector`, `dom_path`, `text_content`, `attributes_snapshot`, `bounding_rect`, `viewport`, `metadata`).
- [x] 2.2 Implement `ContextDrop::ApplicationRecord` (`app/models/context_drop/application_record.rb`) and `ContextDrop::Feedback` (`app/models/context_drop/feedback.rb`) with `belongs_to :submitter, polymorphic: true, optional: true`, `has_many :attachments`, `has_many :element_references`, status scopes (`new_records`, `reviewed`, `resolved`, `dismissed`, `recent`), and status transition methods (`mark_reviewed!`, `mark_resolved!`, `mark_dismissed!`).
- [x] 2.3 Implement `ContextDrop::Attachment` (`app/models/context_drop/attachment.rb`) with `belongs_to :feedback`, `belongs_to :element_reference, optional: true`, `has_one_attached :file`, and `attachment_type` validations (`image`, `screenshot`, `file`).
- [x] 2.4 Implement `ContextDrop::ElementReference` (`app/models/context_drop/element_reference.rb`) with `belongs_to :feedback`, `has_many :attachments, dependent: :nullify`, and required snapshot validations (`tag_name`, `selector`, `bounding_rect`).
- [x] 2.5 Implement `ContextDrop::MetadataSanitizer` (`app/services/context_drop/metadata_sanitizer.rb`) to sanitize incoming `ElementReference` and `Attachment` metadata on the server.

## 3. HTTP Ingestion API & Backend Security
- [x] 3.1 Define engine routes in `config/routes.rb` for `GET /config`, `POST /attachments`, `POST /feedback`, `GET /health`, and dashboard `resources :feedbacks, only: [:index, :show, :update]` under `/dashboard`.
- [x] 3.2 Implement `ContextDrop::ApplicationController` enforcing `config.enabled` gating (`404 Not Found` when disabled), CSRF verification, `current_submitter` resolution, `authorize_submission` checks (`401`/`403`), and `Rails.cache` rate limiting (`429 Too Many Requests`).
- [x] 3.3 Implement `ContextDrop::ConfigsController#show` returning safe browser configuration (`position`, `features`, `limits`, `privacy.excluded_selectors`).
- [x] 3.4 Implement `ContextDrop::AttachmentsController#create` validating uploaded file size, filename sanitization, image dimensions, and server-side magic-byte MIME type via `Marcel` before creating an Active Storage blob (`signed_blob_id`).
- [x] 3.5 Implement `ContextDrop::FeedbacksController#create` persisting `ContextDrop::Feedback`, `ContextDrop::ElementReference` records, and `ContextDrop::Attachment` records transactionally, linking `element_reference_id` for element screenshots, and triggering `on_feedback_created`.
- [x] 3.6 Implement `ContextDrop::HealthController#show` returning `{ status: "ok" }`.

## 4. Self-Hosted Feedback Dashboard Views
- [x] 4.1 Implement `ContextDrop::Dashboard::FeedbacksController` (`index`, `show`, `update`) protected by `config.authorize_dashboard` and isolated engine layout (`app/views/layouts/context_drop/application.html.erb`).
- [x] 4.2 Build `app/views/context_drop/dashboard/feedbacks/index.html.erb` with status filter tabs (`All`, `New`, `Reviewed`, `Resolved`, `Dismissed`), search bar, page URL filter, and feedback summary table.
- [x] 4.3 Build `app/views/context_drop/dashboard/feedbacks/show.html.erb` displaying full feedback context, polymorphic submitter info, Active Storage screenshot/image gallery, `ElementReference` inspector cards (`selector`, `dom_path`, `bounding_rect`, `attributes_snapshot`), and status triage controls.

## 5. Decoupled Frontend Widget & Shadow DOM Composer (TypeScript)
- [x] 5.1 Set up decoupled TypeScript widget package in `app/javascript/context_drop/` building to `app/assets/javascripts/context_drop/context_drop.js`.
- [x] 5.2 Implement `<context-drop-widget>` Web Component with an open Shadow DOM root, scoped CSS custom properties, and configurable viewport corner positioning.
- [x] 5.3 Implement the floating trigger button and prompt-style composer surface with multiline textarea, attachment/element chip tray, keyboard navigation (`Tab`, `Escape`, `Cmd/Ctrl+Enter`), and responsive layout.
- [x] 5.4 Implement the HTTP transport client reading `<meta name="csrf-token">`, fetching `/context_drop/config`, uploading binary attachments, and submitting feedback payloads.

## 6. DOM Element Selection, Sanitization & Screenshot Capture
- [x] 6.1 Implement client-side DOM privacy sanitizer enforcing recursive exclusion of `[data-feedback-ignore]`, `[data-feedback-sensitive]`, `input[type="password"]`, `input[type="hidden"]`, `[autocomplete^="cc-"]`, and `excluded_selectors`, stripping `value` and `outerHTML`.
- [x] 6.2 Implement interactive DOM element picker with `crosshair` cursor, selection banner, hover highlight overlay across scrolled/fixed/Shadow DOM containers, capture-phase click suppression (`preventDefault`, `stopPropagation`, `stopImmediatePropagation`), and continuous multi-select.
- [x] 6.3 Implement viewport and element-scoped screenshot capture with pre-capture visual redaction of excluded elements, hiding `<context-drop-widget>` during capture, and graceful fallback on CSP/canvas errors.

## 7. Automated Testing & Documentation
- [x] 7.1 Set up dummy Rails application (`spec/dummy`) and backend RSpec suite testing the engine installer, 3-table migrations, polymorphic `submitter`, dashboard authorization/views, CSRF, rate limiting, and upload MIME validation.
- [x] 7.2 Set up Vitest and Playwright frontend tests verifying Shadow DOM CSS isolation, keyboard accessibility, element selection click suppression, recursive DOM sanitization, and screenshot redaction.
- [x] 7.3 Write `README.md` documenting installation (`bin/rails generate context_drop:install`), Active Storage requirements, polymorphic `current_submitter` and `authorize_dashboard` configuration, and privacy attributes.
