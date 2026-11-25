# Delta: Engine & Configuration (`close-spec-drift`)

## MODIFIED Requirements

### Requirement: Ruby Initializer & Environment Configuration
ContextDrop SHALL provide a `ContextDrop.configure` block exposing settings for `enabled`, `position`, `storage`, `allow_anonymous`, `persist_ownership_tokens`, `allow_insecure_webhooks`, `max_attachments`, `max_element_references`, `max_attachment_size`, `allowed_content_types`, `element_selection`, `screenshot_capture`, `excluded_selectors`, `current_submitter`, `authorize_submission`, `authorize_dashboard`, `rate_limit`, `on_feedback_created`, `mcp_enabled`, `mcp_api_key`, `authorize_mcp`, `assistant_enabled`, `assistant_modes_by_environment`, `assistant_models`, `assistant_allow_anonymous_change_sets`, `assistant_feedback_confirmations`, `assistant_feedback_guidance`, `authorize_assistant_mode`, `build_target`, and host tool registration (`register_ask_tool`, `register_build_tool`).

#### Scenario: Assistant disabled by default
- **GIVEN** a fresh install without `CONTEXT_DROP_ASSISTANT_ENABLED`
- **WHEN** the host boots
- **THEN** `assistant_enabled` is `false`
- **AND** `/context_drop/assistant/*` returns `404`

#### Scenario: Disabling browser persistence of ownership tokens
- **GIVEN** `config.persist_ownership_tokens = false`
- **WHEN** the widget requests `GET /context_drop/config`
- **THEN** `privacy.persist_ownership_tokens` is `false` in the JSON payload
