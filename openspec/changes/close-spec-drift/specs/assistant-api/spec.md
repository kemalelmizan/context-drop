# Delta: Widget Assistant HTTP API (`close-spec-drift`)

## MODIFIED Requirements

### Requirement: Assistant Turn Endpoint
The engine SHALL expose `POST /context_drop/assistant/turn` accepting `mode` (`ask`, `build`, or `feedback`), `messages`, `page_url`, optional `element_references`, optional `attachments`, optional `change_set_id`, optional `feedback_id`, and optional `ownership_token`, returning assistant `reply`, optional `change_set`, `tool_calls`, and optional `feedback_confirmation` metadata. When `attachments` (`signed_blob_id` or base64 `data_url`) are supplied on `ask` or `build` turns, the server SHALL enforce `config.max_attachments` and `UploadValidator` MIME/size/dimension rules before forwarding validated images to the LLM multimodal context.

#### Scenario: Ask turn with configured BYOK
- **GIVEN** Ask mode is enabled for the environment and org BYOK credentials resolve
- **WHEN** the client posts a valid Ask turn
- **THEN** the server responds with `200 OK` and a plain-language `reply`
- **AND** only Ask-allowlisted tools may execute

#### Scenario: Ask turn with screenshot attachment
- **GIVEN** Ask mode is enabled and org BYOK credentials resolve
- **WHEN** the client posts an Ask turn including a valid PNG `data_url` or `signed_blob_id` in `attachments`
- **THEN** the server validates the image bytes and includes the image in the multimodal user turn sent to `LlmClient`
- **AND** responds with `200 OK`

#### Scenario: Turn attachment validation failure
- **GIVEN** Ask or Build mode is enabled with BYOK configured
- **WHEN** the client posts `attachments` exceeding `max_attachments` or containing disguised non-image bytes
- **THEN** the server responds with `422 Unprocessable Entity` without invoking the LLM provider

#### Scenario: Ask turn without BYOK
- **GIVEN** no LLM credentials are configured
- **WHEN** the client posts an Ask or Build turn
- **THEN** the server responds with `422 Unprocessable Entity` describing missing assistant LLM configuration
