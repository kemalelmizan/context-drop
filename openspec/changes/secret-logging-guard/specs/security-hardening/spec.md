# Delta: ContextDrop Security Hardening (`secret-logging-guard`)

## MODIFIED Requirements

### Requirement: No Production Secret Logging
Rails/logger and Node console output from ContextDrop — as well as persisted delivery error columns (`last_delivery_error`) — MUST NOT print raw MCP API keys, ownership secrets or tokens, ChangeSet approval tokens, webhook signing secrets, Lark app secrets, or LLM API keys. `ContextDrop::Engine` SHALL register ContextDrop secret keys in `Rails.application.config.filter_parameters` and scrub runtime error strings via `ContextDrop::SecretRedactor`.

#### Scenario: MCP auth failure
- **THEN** logs reason without echoing provided Bearer token

#### Scenario: Webhook delivery error echoes secret in upstream body
- **WHEN** an upstream webhook receiver returns an HTTP error body echoing a Bearer token or signing secret
- **THEN** `last_delivery_error` and logger output replace the secret with `[FILTERED]`
