# Delta: Widget Assistant HTTP API (`assistant-llm-budget-isolation`)

## MODIFIED Requirements

### Requirement: Assistant Turn Endpoint
The engine SHALL expose `POST /context_drop/assistant/turn` accepting `mode` (`ask`, `build`, or `feedback`), `messages`, `page_url`, optional `element_references`, optional `attachments`, optional `change_set_id`, optional `feedback_id`, and optional `ownership_token`, returning assistant `reply`, optional `change_set`, `tool_calls`, and optional `feedback_confirmation` metadata. Client-supplied `provider` and `model` parameters SHALL be ignored unless `config.assistant_allow_client_model_override` is `true`, and SHALL be validated against `config.assistant_allowed_models` when configured.

#### Scenario: Disallowed client model rejected when override enabled with allowlist
- **GIVEN** `assistant_allow_client_model_override` is `true` and `assistant_allowed_models` is `["claude-3-5-haiku-latest"]`
- **WHEN** the client posts `mode: "ask"` with `model: "gpt-4.1"`
- **THEN** the server responds with `422 Unprocessable Entity`
