# Tasks: Close Known Spec ↔ Code Drift

- [x] 1.1 Wire and validate `attachments` (`signed_blob_id` and `data_url`) on `POST /context_drop/assistant/turn` in `AssistantController`, `Assistant::Orchestrator`, and `<context-drop-widget>`
- [x] 1.2 Enforce HTTPS and private-host SSRF validation on webhook destinations in `NotificationDestination`, `WebhookClient`, and Node `/integrations/destinations` (with development-only loopback opt-in)
- [x] 1.3 Harden ChangeSet ACL (`change_set_visible?`, `turn` `change_set_id` check, hashed session ID without `remote_ip` fallback, and non-local submitter requirement) plus `AssistantController` CORS parity
- [x] 1.4 Add `persist_ownership_tokens` / `persistOwnershipTokens` memory-only mode across Rails config, Node config, `ContextDropApiClient`, and `<context-drop-widget>` (rebuilding `context_drop.js`)
- [x] 1.5 Promote deltas into `openspec/specs/` (`assistant-api`, `assistant-security`, `security-hardening`, `engine-configuration`) and update `openspec/STATE.md`, `docs/security/COVERAGE_MATRIX.md`, `docs/security/REVIEW_CHECKLIST.md`, and `docs/assistant/security.md`
- [x] 1.6 Add Ruby and TypeScript regression tests covering all four closures and verify `ruby spec/run_all.rb` + `npm test`
