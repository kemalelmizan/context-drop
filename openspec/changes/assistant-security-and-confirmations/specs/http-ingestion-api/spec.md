## MODIFIED Requirements

### Requirement: Feedback, Attachment & ElementReference Submission Endpoint
The engine SHALL expose `POST /context_drop/feedback` to validate and persist feedback atomically and SHALL include `confirmation_message` and `confirmation_metadata` on `201 Created` responses.

#### Scenario: Submitting feedback with message, element reference, and screenshot attachment
- **GIVEN** `ContextDrop.config.enabled` is `true` and a valid CSRF token is provided
- **WHEN** the client sends `POST /context_drop/feedback` with message, `page_url`, element references, and attachments
- **THEN** the engine creates records atomically
- **AND** responds with `201 Created` including `ownership_token`, `confirmation_message`, `confirmation_metadata`, and serialized `feedback`

#### Scenario: Smart mode confirmation omits selectors
- **GIVEN** `resolved_selection_mode` is `smart`
- **WHEN** feedback is created with friendly pin labels
- **THEN** `confirmation_message` does not include raw CSS selector strings