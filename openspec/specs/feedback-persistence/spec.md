# Feedback, Attachment & ElementReference Persistence Specification

## Purpose
Defines the three engine-owned Active Record models (`ContextDrop::Feedback`, `ContextDrop::Attachment`, and `ContextDrop::ElementReference`), their explicit table names (`context_drop_feedbacks`, `context_drop_attachments`, `context_drop_element_references`), polymorphic `submitter` attribution, Active Storage binary integration, status lifecycle scopes, and public Ruby query APIs.

## Requirements

### Requirement: Engine-Owned Feedback Record Persistence (`ContextDrop::Feedback`)
The engine SHALL persist each feedback submission in `context_drop_feedbacks` (`ContextDrop::Feedback`) with columns `id`, polymorphic `submitter_type` and `submitter_id` (`belongs_to :submitter, polymorphic: true, optional: true`), `session_id` (nullable), `message`, `page_url`, `user_agent`, `metadata` (JSON/JSONB), `status`, `created_at`, and `updated_at`.

#### Scenario: Persisting feedback with a polymorphic host submitter
- **GIVEN** an authenticated host user (`User#15`) submits feedback containing a message, originating `page_url`, browser `user_agent`, and viewport `metadata`
- **WHEN** `ContextDrop::Feedback.create!` is invoked
- **THEN** the record is saved to `context_drop_feedbacks` with `submitter_type: "User"`, `submitter_id: 15`, and default `status: "new"`

#### Scenario: Requiring either a non-blank message, an attachment, or an element reference
- **GIVEN** a feedback submission with a blank `message`, zero `attachments`, and zero `element_references`
- **WHEN** validation runs on `ContextDrop::Feedback`
- **THEN** the record is invalid and rejected with a validation error

### Requirement: Feedback Status Lifecycle & Query API
`ContextDrop::Feedback` SHALL support the statuses `"new"`, `"reviewed"`, `"resolved"`, and `"dismissed"`, and MUST expose query scopes (`new_records`, `reviewed`, `resolved`, `dismissed`, `recent`) and status transition methods (`mark_reviewed!`, `mark_resolved!`, `mark_dismissed!`).

#### Scenario: Querying and transitioning feedback status from the host app
- **GIVEN** two feedback records exist with status `"new"` and one with status `"resolved"`
- **WHEN** the host application calls `ContextDrop::Feedback.new_records`
- **THEN** only the two `"new"` feedback records are returned
- **AND** calling `feedback.mark_reviewed!` updates the record's `status` to `"reviewed"`

### Requirement: Engine-Owned Binary Attachment Persistence (`ContextDrop::Attachment`)
The engine SHALL persist binary attachments in `context_drop_attachments` (`ContextDrop::Attachment`) belonging to `ContextDrop::Feedback` (and optionally belonging to a `ContextDrop::ElementReference` for element-scoped screenshots), classified by `attachment_type` (`"image"`, `"screenshot"`, or `"file"`), with structured `metadata` and an Active Storage `has_one_attached :file` blob stored in the host application's Active Storage tables.

#### Scenario: Persisting an uploaded image and a viewport screenshot
- **GIVEN** a feedback submission with an uploaded PNG image and a captured viewport screenshot
- **WHEN** the feedback record and its attachments are saved
- **THEN** two `ContextDrop::Attachment` records are created in `context_drop_attachments` with `attachment_type` set to `"image"` and `"screenshot"` respectively
- **AND** each binary file is persisted through Active Storage via `has_one_attached :file`

### Requirement: Engine-Owned DOM Element Reference Persistence (`ContextDrop::ElementReference`)
The engine SHALL persist each selected DOM element snapshot in `context_drop_element_references` (`ContextDrop::ElementReference`) belonging to `ContextDrop::Feedback`, storing `tag_name`, `selector`, `dom_path`, sanitized `text_content`, allowlisted `attributes_snapshot`, viewport-relative `bounding_rect` (`x`, `y`, `width`, `height` in CSS pixels), `viewport` (`width`, `height`), `metadata`, and `captured_at`.

#### Scenario: Persisting multiple selected DOM element references and linking an element screenshot
- **GIVEN** a user selects `button#checkout-button` and `div.order-summary` and captures an element screenshot of `button#checkout-button`
- **WHEN** the feedback submission is persisted
- **THEN** two `ContextDrop::ElementReference` records are created in `context_drop_element_references`
- **AND** the element screenshot `ContextDrop::Attachment` record sets `element_reference_id` to the `button#checkout-button` `ElementReference#id`

#### Scenario: Cascading deletion of attachments and element references when feedback is destroyed
- **GIVEN** a `ContextDrop::Feedback` record with associated `ContextDrop::Attachment` and `ContextDrop::ElementReference` records
- **WHEN** the parent `ContextDrop::Feedback` record is destroyed
- **THEN** all associated `ContextDrop::Attachment` and `ContextDrop::ElementReference` records are deleted and associated Active Storage blobs are scheduled for purge
