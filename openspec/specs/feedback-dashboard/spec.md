# Self-Hosted Feedback Dashboard Specification

## Purpose
Defines the built-in, self-hosted Feedback Dashboard views and controllers encapsulated inside `ContextDrop::Engine` (`app/views/context_drop/dashboard/feedbacks/`), enabling authorized developers and team members to browse, filter, inspect, and triage submitted feedback, screenshots, and DOM element references directly within the host Rails application.

## Requirements

### Requirement: Dashboard Authorization Gate
All dashboard routes (`GET /context_drop/dashboard/feedbacks`, `GET /context_drop/dashboard/feedbacks/:id`, `PATCH /context_drop/dashboard/feedbacks/:id`) SHALL enforce `ContextDrop.config.enabled` and `ContextDrop.config.authorize_dashboard`, denying unauthorized access before querying or rendering any feedback data.

#### Scenario: Unauthorized visitor requests the feedback dashboard
- **GIVEN** `ContextDrop.config.authorize_dashboard` evaluates to `false` for the current request
- **WHEN** a visitor requests `GET /context_drop/dashboard/feedbacks`
- **THEN** the controller responds with `403 Forbidden` (or `401 Unauthorized`) without rendering any feedback records

### Requirement: Feedback List & Filtering View
The engine SHALL provide an index view (`GET /context_drop/dashboard/feedbacks`) displaying paginated active feedback submissions ordered newest first, with filtering by `status` (`new`, `reviewed`, `resolved`, `dismissed`, plus an optional `deleted` filter for soft-deleted records), `page_url` substring, and search query, excluding soft-deleted records from default tabs and counts.

#### Scenario: Filtering dashboard feedbacks by status and inspecting soft-deleted records
- **GIVEN** an authorized developer visits `GET /context_drop/dashboard/feedbacks?status=new`
- **WHEN** the page renders
- **THEN** only active feedback records with `status: "new"` are listed along with status filter tabs and counts
- **AND** visiting `GET /context_drop/dashboard/feedbacks?status=deleted` lists only soft-deleted feedback records (`deleted_at` present)

### Requirement: Feedback Detail, Screenshot Gallery & Element Reference Inspector View
The engine SHALL provide a detail view (`GET /context_drop/dashboard/feedbacks/:id`) displaying the full feedback `message`, originating `page_url`, `submitter` details, `user_agent`, viewport `metadata`, an image/screenshot gallery rendered via Active Storage, and structured inspector cards for each `ContextDrop::ElementReference` (`tag_name`, `selector`, `dom_path`, `text_content`, `attributes_snapshot`, `bounding_rect`).

#### Scenario: Viewing a feedback submission with screenshots and DOM element references
- **GIVEN** an authorized developer visits `GET /context_drop/dashboard/feedbacks/42`
- **WHEN** feedback `#42` has two `ElementReference` records and one viewport `Attachment` screenshot
- **THEN** the detail page renders the screenshot preview and displays each `ElementReference`'s CSS `selector`, `dom_path`, and `bounding_rect` coordinates

### Requirement: In-Dashboard Status Triage Action
The dashboard SHALL allow authorized users to transition a feedback record's `status` (`new`, `reviewed`, `resolved`, `dismissed`) via `PATCH /context_drop/dashboard/feedbacks/:id` protected by Rails CSRF verification.

#### Scenario: Marking a feedback record as resolved from the dashboard
- **GIVEN** an authorized developer is viewing feedback `#42` with `status: "new"`
- **WHEN** the developer clicks `"Mark Resolved"` (`PATCH /context_drop/dashboard/feedbacks/42` with `status: "resolved"`)
- **THEN** feedback `#42` is updated to `status: "resolved"` and the dashboard reflects the updated status badge
