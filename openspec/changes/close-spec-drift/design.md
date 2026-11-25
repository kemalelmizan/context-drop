# Design: Close Known Spec ↔ Code Drift

## 1. Assistant Turn Multimodal Attachments (`assistant-api`)
- `AssistantController#turn` extracts `params[:attachments]` as plain hashes, enforces `ContextDrop.config.max_attachments` (`422 Unprocessable Entity`), and passes `attachments:` to `Assistant::Orchestrator#run_turn`.
- `Assistant::Orchestrator` resolves image attachments on `ask` and `build` turns (capped at `MAX_INLINE_IMAGE_BYTES = 4 MB` per inline image and `max_attachment_size`):
  - `signed_blob_id`: resolved via `ActiveStorage::Blob.find_signed!`, verified against `allowed_content_types` and size limits, then base64-encoded.
  - `data_url` / `data`: base64-decoded via `Base64Util.strict_decode64` and validated through `UploadValidator.validate!` (Marcel magic-byte MIME check, byte size, and image dimensions).
- Resolved `{ mime_type:, data: }` entries are attached to `turns[last_user][:images]`, reusing `Agent::LlmClient`'s Anthropic, Gemini, and OpenAI-compatible multimodal serializers.
- In `<context-drop-widget>`, `handleAssistantTurn` forwards `this.attachments` (`attachment_type`, `filename`, `signed_blob_id`, or `data_url`) on `POST /assistant/turn`.

## 2. Webhook Destination URL Policy (`SEC-H042`)
- `ContextDrop::Notifications::WebhookClient.validate_https_uri!` (Ruby) and `validateHttpsCallbackUrl` (TypeScript) serve as the single validator for both persistence and delivery.
- By default across all environments, webhook URLs must parse as `https://` with a non-empty, non-private, non-loopback, non-metadata host (checked via `IPAddr` for IPv4/IPv6 loopback, link-local `169.254.0.0/16` / `fe80::/10`, private RFC1918 / `fc00::/7`, `0.0.0.0`, `localhost`, `*.localhost`, and `metadata.google.internal`).
- Explicit development opt-in (`config.allow_insecure_webhooks = true` in Rails; `notifications.allowInsecureWebhooks = true` in Node) permits `http://` strictly for loopback hosts (`localhost`, `127.0.0.1`, `[::1]`) and strictly when the resolved environment is `development` (`!rails_production? && local_environment?`). Production always rejects non-HTTPS URLs regardless of flag.
- `NotificationDestination#validate_settings_shape` runs URL validation on save whenever `destination_type == "webhook"` and (`enabled` or `url.present?`). Node `POST/PATCH /integrations/destinations` validates webhook URLs before persisting and returns `422` on violation.

## 3. ChangeSet Visibility & Session Hardening (`SEC-A007`)
- `AssistantController#assistant_session_id` delegates to `ApplicationController#hashed_session_identifier` (`SHA-256` truncated hex) and never falls back to `request.remote_ip`, preventing shared-VPN/NAT session collisions and plaintext session ID persistence in `context_drop_change_sets` / `context_drop_assistant_turns`.
- `AssistantController#change_set_visible?(record)`:
  1. If `record.submitter_id.present? || record.submitter_type.present?`, access requires an authenticated `submitter` with matching `submitter_type` and `submitter_id` (no `session_id` fallback).
  2. If `record` is unattributed (`submitter_id.nil?`), access is permitted only when `ContextDrop.config.anonymous_change_sets_allowed?` (defaults to `true` in `development`/`test`, `false` in `staging`/`production`, overrideable via `config.assistant_allow_anonymous_change_sets`) and `ActiveSupport::SecurityUtils.secure_compare` matches `record.session_id` against the caller's `hashed_session_identifier`.
- `AssistantController#turn` verifies `change_set_visible?` when `params[:change_set_id]` is supplied (`404` when missing, `403` when unauthorized), and `Assistant::Orchestrator#handle_propose_change_set` refuses to create anonymous ChangeSets when `anonymous_change_sets_allowed?` is `false` (`403`).

## 4. Ownership Token Storage Mode (`SEC-H014`)
- `config.persist_ownership_tokens` (Rails, default `true`) and `config.privacy.persistOwnershipTokens` (Node, default `true`) publish `privacy.persist_ownership_tokens` in `GET /config`.
- `ContextDropApiClient` supports `persistOwnershipTokens: boolean` (constructor option + `setPersistOwnershipTokens(boolean)`). When `false`, tokens are stored exclusively in `this.memoryOwnershipTokens` for the lifetime of the page and any existing scoped entries in `window.localStorage` for that endpoint are removed.
- `security-hardening` is updated so `No Secret Material in DOM or Web Storage` normatively distinguishes forbidden secrets (LLM keys, MCP Bearer tokens, ChangeSet `approval_token`s) from bounded endpoint-scoped `ownership_token` entries with configurable memory-only mode.
