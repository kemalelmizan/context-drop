# Delta: ContextDrop Security Hardening (`close-spec-drift`)

## MODIFIED Requirements

### Requirement: No Secret Material in DOM or Web Storage
LLM API keys, MCP Bearer tokens, and ChangeSet `approval_token` values SHALL NOT be written to `localStorage`, `sessionStorage`, cookies, or visible DOM attributes except masked agent UI tails on the loopback agent sidebar. Per-feedback HMAC `ownership_token` values MAY be persisted in `localStorage` bounded (max 50) and scoped by endpoint + feedback ID when `persist_ownership_tokens` is `true` (default), and SHALL be kept strictly in memory when `persist_ownership_tokens` is `false`.

#### Scenario: Agent status on loopback
- **WHEN** `/agent/status` returns provider metadata
- **THEN** only masked key tails are present (e.g. `••••7f9a`)

#### Scenario: Memory-only ownership token mode
- **GIVEN** `persist_ownership_tokens` is configured to `false`
- **WHEN** feedback is submitted through `ContextDropApiClient`
- **THEN** `ownership_token` is retained in memory for the current page session and is not written to `window.localStorage`

### Requirement: Webhook URL Validation
Dashboard (`NotificationDestination`) and standalone integrations API (`/integrations/destinations`) SHALL validate webhook URLs on save and delivery, rejecting non-HTTPS schemes and private, loopback, link-local, or cloud-metadata hosts in production; plaintext `http://` loopback URLs SHALL be permitted only in `development` when `allow_insecure_webhooks` is explicitly enabled.

#### Scenario: Production rejects HTTP or private-network webhook URL
- **GIVEN** resolved environment is `production`
- **WHEN** an operator saves a webhook destination with `http://example.com/hook`, `http://localhost:4000/hook`, or `https://169.254.169.254/latest`
- **THEN** validation fails with `422 Unprocessable Entity` and the destination is not persisted

#### Scenario: Development loopback webhook opt-in
- **GIVEN** resolved environment is `development` and `allow_insecure_webhooks` is `true`
- **WHEN** an operator saves `http://localhost:4000/hook`
- **THEN** the webhook destination saves cleanly while `http://external.example.com/hook` is still rejected
