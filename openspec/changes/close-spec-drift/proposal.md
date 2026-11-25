# Proposal: Close Known Spec ↔ Code Drift

## Why
`openspec/STATE.md` and `docs/security/COVERAGE_MATRIX.md` identify four remaining spec↔code alignment gaps across assistant turns, webhook notifications, ChangeSet access control, and browser ownership-token storage:

1. `POST /context_drop/assistant/turn` reserved `attachments` without forwarding or validating screenshot/image inputs for Ask and Build vision turns.
2. `ContextDrop::NotificationDestination` and the standalone Node `/integrations/destinations` API did not enforce HTTPS + SSRF private-network checks when saving webhook URLs (`SEC-H042`).
3. `AssistantController#change_set_visible?` fell back to raw `session.id` or `request.remote_ip` even when a ChangeSet had a polymorphic `submitter`, and `POST /assistant/turn` with `change_set_id` skipped visibility checks (`SEC-A007`).
4. `security-hardening` conflicted with `ContextDropApiClient`'s bounded per-feedback `localStorage` ownership-token cache and lacked a host-configurable memory-only mode (`SEC-H014`).

## What Changes
- **Assistant multimodal `attachments` (`assistant-api`):** Validate (`max_attachments`, magic-byte MIME, byte size, dimensions) and attach screenshot/image inputs (`signed_blob_id` or `data_url`) as user turn vision blocks on Ask and Build turns in `AssistantController`, `Assistant::Orchestrator`, and `<context-drop-widget>`.
- **Webhook HTTPS & SSRF validation (`security-hardening`, `SEC-H042`):** Enforce HTTPS and non-private/non-metadata host validation on save in `NotificationDestination` and Node `/integrations/destinations`, with explicit loopback `http://` opt-in (`allow_insecure_webhooks`) honored strictly in `development`.
- **ChangeSet ACL hardening (`assistant-security`, `SEC-A007`):** Require exact polymorphic `submitter` match whenever a ChangeSet is attributed, gate `POST /assistant/turn` `change_set_id` mutations with `change_set_visible?`, use hashed session identifiers (`hashed_session_identifier`, never `request.remote_ip`), and require an authenticated `submitter` for ChangeSets outside `development`/`test` unless `assistant_allow_anonymous_change_sets` is enabled.
- **Ownership-token storage policy (`security-hardening`, `engine-configuration`, `SEC-H014`):** Add `config.persist_ownership_tokens` (Rails) / `privacy.persistOwnershipTokens` (Node & widget) so hosts can enforce memory-only `ownership_token` retention, and align `security-hardening` with bounded endpoint-scoped `localStorage` default behavior.
- **CORS parity (`AssistantController`):** Include `AssistantController` in `ApplicationController#cors_eligible_widget_endpoint?` to match the preflight `OPTIONS` routes in `config/routes.rb`.

## Impact
- Backward-compatible defaults for existing Rails and Next.js deployments (`persist_ownership_tokens = true`, HTTPS webhooks required by default).
- Shared staging environments require an authenticated `current_submitter` for Build ChangeSets by default (configurable via `assistant_allow_anonymous_change_sets`).
- Eliminates all open spec↔code drift entries in `openspec/STATE.md` and upgrades `SEC-H014`, `SEC-H042`, and `SEC-A007` to `Implemented` in `docs/security/COVERAGE_MATRIX.md`.
