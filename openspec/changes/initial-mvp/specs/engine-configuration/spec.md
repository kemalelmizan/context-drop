## ADDED Requirements

### Requirement: Isolated Mountable Rails Engine & Installer Generator
The gem SHALL be implemented as a mountable `Rails::Engine` with `isolate_namespace ContextDrop`, engine-owned migrations in `db/migrate/`, and an installation generator (`bin/rails generate context_drop:install`) that creates `config/initializers/context_drop.rb`, mounts `ContextDrop::Engine` in `config/routes.rb`, copies engine migrations into the host application (`rails context_drop:install:migrations`), and configures frontend widget delivery without requiring modifications to the host application's existing layout structure.

#### Scenario: Running the install generator in a host Rails app
- **GIVEN** a host Ruby on Rails application with `context_drop` added to its `Gemfile`
- **WHEN** the developer runs `bin/rails generate context_drop:install` and `bin/rails db:migrate`
- **THEN** `ContextDrop::Engine` is mounted at `/context_drop` in `config/routes.rb`
- **AND** `config/initializers/context_drop.rb` is generated with documented defaults and environment variable gating
- **AND** engine-owned migrations for `context_drop_feedbacks`, `context_drop_attachments`, and `context_drop_element_references` are copied into the host's `db/migrate/` directory and applied cleanly

### Requirement: Decoupled Frontend Widget Distribution
The JavaScript widget (`app/javascript/context_drop/` and pre-bundled `app/assets/javascripts/context_drop/`) SHALL be packaged separately from backend engine internals so host applications can load the widget via Propshaft, Sprockets, Importmaps, or standard JavaScript bundlers without locking the backend engine to a specific Rails asset pipeline.

#### Scenario: Rendering widget in a Rails 8 Propshaft/Importmap application
- **GIVEN** a host Rails 8 application using Propshaft and Importmaps without a Node.js build pipeline
- **WHEN** the developer installs ContextDrop and places `<%= context_drop_widget %>` in the layout
- **THEN** the pre-bundled `<context-drop-widget>` JavaScript asset loads and initializes cleanly without requiring `npm` or `yarn` in the host project

### Requirement: Ruby Initializer & Environment Configuration
ContextDrop SHALL provide a `ContextDrop.configure` block exposing settings for `enabled`, `position`, `storage`, `allow_anonymous`, `max_attachments`, `max_element_references`, `max_attachment_size`, `allowed_content_types`, `element_selection`, `screenshot_capture`, `excluded_selectors`, `current_submitter`, `authorize_submission`, `authorize_dashboard`, `rate_limit`, and `on_feedback_created`.

#### Scenario: Configuring ContextDrop via initializer and environment variable
- **GIVEN** `config/initializers/context_drop.rb` sets `config.enabled = ENV.fetch("CONTEXT_DROP_ENABLED", "false") == "true"`
- **WHEN** the Rails application boots with `CONTEXT_DROP_ENABLED=true`
- **THEN** `ContextDrop.config.enabled` evaluates to `true`
- **AND** all configured limits, policies, and feature flags are accessible to the view helper, dashboard controllers, and API controllers

### Requirement: Backend Enforcement of Disabled State
Disabling ContextDrop via `config.enabled = false` SHALL disable the frontend view helper, the self-hosted feedback dashboard, and all backend HTTP ingestion endpoints exposed by the engine.

#### Scenario: Widget helper invoked when ContextDrop is disabled
- **GIVEN** `ContextDrop.config.enabled` is `false`
- **WHEN** a view template calls `<%= context_drop_widget %>`
- **THEN** the helper returns `nil` and emits no HTML elements or script tags into the page

#### Scenario: HTTP endpoint requested when ContextDrop is disabled
- **GIVEN** `ContextDrop.config.enabled` is `false`
- **WHEN** a client sends a request to `GET /context_drop/config`, `POST /context_drop/feedback`, `POST /context_drop/attachments`, or `GET /context_drop/dashboard/feedbacks`
- **THEN** the backend rejects the request with `404 Not Found` without processing or persisting any data

### Requirement: Explicit View Helper Rendering
ContextDrop SHALL provide a `context_drop_widget` Rails view helper that renders the `<context-drop-widget>` container and script tag when enabled, and supports per-invocation option overrides (`position`, `placeholder`, and custom `metadata`).

#### Scenario: View helper called with per-page position override
- **GIVEN** `ContextDrop.config.enabled` is `true` and default `position` is `:bottom_right`
- **WHEN** a view renders `<%= context_drop_widget(position: :bottom_left) %>`
- **THEN** the widget renders in the `:bottom_left` viewport corner for that page without mutating the global `ContextDrop.config.position` setting

### Requirement: Host-Agnostic Polymorphic Submitter & Authorization Hooks
ContextDrop SHALL resolve the current authenticated submitter via `config.current_submitter` (associating any host Active Record model via polymorphic `belongs_to :submitter, polymorphic: true, optional: true`) and enforce submission and dashboard access via `config.authorize_submission` and `config.authorize_dashboard` without coupling to Devise, Sorcery, Authlogic, or any specific `User` class name.

#### Scenario: Associating feedback with a custom host model (`Employee`)
- **GIVEN** a host internal Rails app uses an `Employee` model and configures `config.current_submitter = ->(controller) { controller.current_employee }`
- **WHEN** an authenticated `Employee` with `id: 42` submits feedback
- **THEN** the persisted `ContextDrop::Feedback` record stores `submitter_type: "Employee"` and `submitter_id: 42`

#### Scenario: Anonymous submission blocked when disabled
- **GIVEN** `config.allow_anonymous` is `false` and `config.current_submitter` returns `nil`
- **WHEN** an unauthenticated visitor attempts to submit feedback or render the widget
- **THEN** `<%= context_drop_widget %>` renders nothing and `POST /context_drop/feedback` responds with `401 Unauthorized`
