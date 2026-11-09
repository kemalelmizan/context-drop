## MODIFIED Requirements

### Requirement: Ruby Initializer & Environment Configuration
ContextDrop SHALL provide a `ContextDrop.configure` block exposing settings for `enabled`, `position`, `storage`, `allow_anonymous`, `max_attachments`, `max_element_references`, `max_attachment_size`, `allowed_content_types`, `element_selection`, `screenshot_capture`, `excluded_selectors`, `current_submitter`, `authorize_submission`, `authorize_dashboard`, `rate_limit`, `on_feedback_created`, `mcp_enabled`, `mcp_api_key`, and `authorize_mcp`.

#### Scenario: Configuring ContextDrop via initializer and environment variable
- **GIVEN** `config/initializers/context_drop.rb` sets `config.enabled = ENV.fetch("CONTEXT_DROP_ENABLED", "false") == "true"`
- **WHEN** the Rails application boots with `CONTEXT_DROP_ENABLED=true`
- **THEN** `ContextDrop.config.enabled` evaluates to `true`
- **AND** all configured limits, policies, and feature flags are accessible to the view helper, dashboard controllers, and API controllers

#### Scenario: Configuring remote MCP server access via initializer
- **GIVEN** `config/initializers/context_drop.rb` sets `config.mcp_enabled = true` and `config.mcp_api_key = ENV["CONTEXT_DROP_MCP_API_KEY"]`
- **WHEN** the Rails application boots with `CONTEXT_DROP_MCP_API_KEY="secret_token"`
- **THEN** `ContextDrop.config.mcp_enabled` evaluates to `true` and `POST /context_drop/mcp` requires `Authorization: Bearer secret_token`
