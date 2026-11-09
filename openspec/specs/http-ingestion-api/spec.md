# HTTP Ingestion API Specification

## Purpose
Defines the namespaced HTTP endpoints exposed by `ContextDrop::Engine` for public browser configuration discovery, binary attachment uploads, feedback and DOM element reference submission, and engine health checks.

## Requirements

### Requirement: Public Widget Configuration Endpoint
The engine SHALL expose `GET /context_drop/config` returning only the safe, browser-consumable configuration (`enabled`, `position`, feature flags, attachment and element reference limits, and `excluded_selectors`) without leaking server-side secrets or internal procs.

#### Scenario: Fetching widget configuration when enabled
- **GIVEN** `ContextDrop.config.enabled` is `true`
- **WHEN** the widget sends `GET /context_drop/config`
- **THEN** the endpoint responds with `200 OK` and a JSON payload containing `position`, `features`, `limits`, and `privacy.excluded_selectors`
- **AND** no Ruby proc definitions, storage credentials, or internal application settings are included

### Requirement: Feedback, Attachment & ElementReference Submission Endpoint
The engine SHALL expose `POST /context_drop/feedback` to validate and persist a `ContextDrop::Feedback` record along with its associated `ContextDrop::ElementReference` snapshots and `ContextDrop::Attachment` records within a database transaction.

#### Scenario: Submitting feedback with message, element reference, and screenshot attachment
- **GIVEN** `ContextDrop.config.enabled` is `true` and a valid CSRF token is provided
- **WHEN** the client sends `POST /context_drop/feedback` with a `message`, `page_url`, one `element_references` snapshot, and one `attachments` screenshot
- **THEN** the engine creates the `ContextDrop::Feedback`, `ContextDrop::ElementReference`, and `ContextDrop::Attachment` records atomically
- **AND** invokes `config.on_feedback_created` if configured
- **AND** responds with `201 Created` and `{ "id": <id>, "status": "new", "attachments_count": 1, "element_references_count": 1, "created_at": "<timestamp>" }`

#### Scenario: Rejecting feedback submission exceeding max attachments or element references
- **GIVEN** `ContextDrop.config.max_attachments` is `10`
- **WHEN** a client sends `POST /context_drop/feedback` containing `11` attachments
- **THEN** the engine rolls back persistence and responds with `422 Unprocessable Entity` and a descriptive error message

### Requirement: Attachment Upload Endpoint
The engine SHALL expose `POST /context_drop/attachments` to accept individual binary image or screenshot uploads, validate their MIME type and size, store them via Active Storage, and return a `signed_blob_id` reference that can be attached to a subsequent `POST /context_drop/feedback` request (in addition to supporting direct multipart upload on `POST /context_drop/feedback`).

#### Scenario: Uploading a valid screenshot or image attachment
- **GIVEN** `ContextDrop.config.max_attachment_size` is `10.megabytes`
- **WHEN** the client uploads a `500 KB` `image/png` file to `POST /context_drop/attachments` with a valid CSRF token
- **THEN** the engine stores the file as an Active Storage blob and responds with `201 Created` containing a `signed_blob_id`

### Requirement: Engine Health Check Endpoint
The engine SHALL expose `GET /context_drop/health` to report engine availability when enabled.

#### Scenario: Checking engine health
- **GIVEN** `ContextDrop.config.enabled` is `true`
- **WHEN** a client requests `GET /context_drop/health`
- **THEN** the endpoint responds with `200 OK` and `{ "status": "ok" }`
