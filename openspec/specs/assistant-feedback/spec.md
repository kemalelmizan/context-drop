# Assistant Feedback Mode & Confirmation Specification

## Purpose
Defines non-LLM Feedback mode guidance, post-submission confirmation messages with safe metadata, and host-customizable template arrays.

## Requirements

### Requirement: Feedback Mode Without LLM
When `mode` is `feedback`, the assistant endpoint SHALL NOT require org BYOK credentials and SHALL NOT invoke LLM providers for guidance or confirmation responses.

#### Scenario: Feedback turn without BYOK configured
- **GIVEN** `assistant_enabled` is `true` and no LLM API keys are configured
- **WHEN** the client posts `POST /context_drop/assistant/turn` with `mode: "feedback"`
- **THEN** the server responds with `200 OK` and a predefined guidance or confirmation message
- **AND** does not return `422` for missing LLM configuration

#### Scenario: Ask turn still requires BYOK
- **GIVEN** no LLM API keys are configured
- **WHEN** the client posts `mode: "ask"`
- **THEN** the server responds with `422 Unprocessable Entity` indicating assistant LLM is not configured

### Requirement: Predefined Guidance Templates
On a feedback-mode turn without `feedback_id`, the engine SHALL return one message selected from `config.assistant_feedback_guidance` or built-in defaults instructing users how to pin context and send feedback.

#### Scenario: User opens Feedback tab in widget
- **GIVEN** the widget assistant is enabled and `assistant.modes` includes `feedback`
- **WHEN** the user switches to the Feedback mode tab
- **THEN** the widget MAY request a feedback-mode assistant turn
- **AND** displays predefined guidance text without exposing CSS selectors in smart mode copy

### Requirement: Post-Submission Confirmation on Create
On successful `POST /context_drop/feedback`, the engine SHALL include `confirmation_message` and `confirmation_metadata` derived from `ContextDrop::Assistant::FeedbackConfirmation`, using smart-mode friendly pin labels when `resolved_selection_mode` is `smart`.

#### Scenario: Smart production submission confirmation
- **GIVEN** `resolved_selection_mode` is `smart`
- **WHEN** feedback `#108` is created with one element reference whose `metadata.friendly_label` is `"Complete Order" button`
- **THEN** the `201 Created` body includes `confirmation_message` referencing feedback `#108` and pin counts
- **AND** `confirmation_message` and `confirmation_metadata.pins_summary` SHALL NOT contain the raw CSS selector `#checkout-btn`

#### Scenario: Host-custom confirmation template
- **GIVEN** `config.assistant_feedback_confirmations` contains `"Ticket {{id}} logged in {{environment}}."`
- **WHEN** a new feedback record is persisted
- **THEN** `confirmation_message` interpolates `id` and `environment` from the saved record

### Requirement: Confirmation Metadata Shape
`confirmation_metadata` SHALL include only public triage fields: `id`, `environment`, `status`, `page_url`, `pins_count`, `attachments_count`, `pins_summary`, `created_at`, and `selection_mode`.

#### Scenario: Metadata omits ownership secrets
- **GIVEN** feedback is created with a new `ownership_token`
- **WHEN** the client inspects `confirmation_metadata` in the create response
- **THEN** the JSON object does not include `ownership_token`, MCP API keys, or submitter PII beyond what the host already exposes

### Requirement: Feedback Status Lookup via Assistant Turn
When `POST /assistant/turn` includes `feedback_id` and a valid `ownership_token` (or authenticated submitter match), the engine SHALL return the same confirmation format for that existing record.

#### Scenario: Valid ownership token
- **GIVEN** the client holds a valid HMAC `ownership_token` for feedback `#42`
- **WHEN** it posts `mode: "feedback"`, `feedback_id: 42`, and the token
- **THEN** the server returns `200 OK` with `feedback_confirmation.message` for `#42`

#### Scenario: Invalid ownership token
- **GIVEN** an invalid or missing token for feedback `#42`
- **WHEN** the client posts `mode: "feedback"` with `feedback_id: 42`
- **THEN** the server responds with `403 Forbidden`