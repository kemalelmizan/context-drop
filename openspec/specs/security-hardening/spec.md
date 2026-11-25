# ContextDrop Security Hardening Specification

## Purpose
Normative security and abuse-prevention requirements across the ContextDrop mountable engine, browser widget, HTTP ingestion API, dashboard, MCP hub, notifications, local BYOK agent, and widget assistant (Ask/Build/Feedback). This spec supplements [`security-and-privacy/spec.md`](security-and-privacy/spec.md) with defense-in-depth, authorization, and operational controls.

## Threat Model Summary

| Trust zone | Assets | Primary threats |
|------------|--------|-----------------|
| Browser widget | User DOM, screenshots, CSRF token | XSS exfiltration, IDOR on own feedback, UI deception |
| Public HTTP API | Feedbacks, blobs, assistant turns | CSRF, rate abuse, IDOR, file upload malware |
| Dashboard | All feedbacks, integration secrets | Broken access control, secret leakage |
| MCP HTTP/SSE | Feedback content, status transitions | Token theft, SSRF via webhooks, event injection |
| MCP stdio | Full feedback + images | Local workstation compromise (out of engine scope) |
| Local agent (loopback) | Rails root, BYOK keys | LAN exposure, DNS rebinding, path traversal |
| Assistant LLM | Pins, screenshots, host RAG | Prompt injection, data exfil via tools, LLM cost abuse |
| Build/git adapters | VCS credentials, CI | Unauthorized branches, supply-chain commits |

---

## Requirements: Trust Boundaries & Engine Isolation

### Requirement: Isolated Namespace and Disabled-by-Default Surface
`ContextDrop::Engine` SHALL use `isolate_namespace ContextDrop`. With `config.enabled = false`, widget helper, ingestion routes, dashboard, assistant, and agent endpoints SHALL NOT process domain data (404 or no HTML output).

#### Scenario: Disabled engine rejects ingestion
- **GIVEN** `enabled` is `false`
- **WHEN** `POST /context_drop/feedback` is called
- **THEN** response is `404 Not Found` and no row is inserted

#### Scenario: Widget helper silent when disabled
- **WHEN** `context_drop_widget` is rendered while disabled
- **THEN** output is empty/nil

### Requirement: Host Owns Identity; Engine Owns Feedback Domain
Authentication, role models, and PII policies SHALL remain in the host application via `current_submitter`, `authorize_submission`, `authorize_dashboard`, `authorize_mcp`, and `authorize_assistant_mode`. ContextDrop MUST NOT hardcode a `User` class.

#### Scenario: Custom submitter model
- **GIVEN** `current_submitter` returns `Employee#99`
- **WHEN** feedback is created
- **THEN** `submitter_type` and `submitter_id` reflect `Employee` without engine schema changes

---

## Requirements: Browser Widget & Shadow DOM

### Requirement: Style Isolation
The widget SHALL mount inside `<context-drop-widget>` with Shadow DOM (or equivalent) so host CSS cannot override security-critical affordances (pin mode, submit disabled state).

#### Scenario: Host global button styles
- **GIVEN** host CSS sets `button { display: none }`
- **WHEN** widget renders
- **THEN** widget buttons remain visible inside the shadow root

### Requirement: No Secret Material in DOM or Web Storage
LLM API keys, MCP Bearer tokens, and ChangeSet `approval_token` values SHALL NOT be written to `localStorage`, `sessionStorage`, cookies, or visible DOM attributes except masked agent UI tails on the loopback agent sidebar. Per-feedback HMAC `ownership_token` values MAY be persisted in `localStorage` bounded (max 50) and scoped by endpoint + feedback ID when `persist_ownership_tokens` is `true` (default), and SHALL be kept strictly in memory when `persist_ownership_tokens` is `false`.

#### Scenario: Agent status on loopback
- **WHEN** `/agent/status` returns provider metadata
- **THEN** only masked key tails are present (e.g. `••••7f9a`)

#### Scenario: Memory-only ownership token mode
- **GIVEN** `persist_ownership_tokens` is configured to `false`
- **WHEN** feedback is submitted through `ContextDropApiClient`
- **THEN** `ownership_token` is retained in memory for the current page session and is not written to `window.localStorage`

### Requirement: Capture-Phase Event Suppression in Pin Mode
While element selection is active, pointer events on the host page SHALL be stopped in the capture phase so attacker-controlled links cannot fire during inspection.

#### Scenario: Click during pin mode
- **GIVEN** pin mode highlights a link underneath
- **WHEN** user clicks to confirm pin
- **THEN** the link navigation does not occur

---

## Requirements: DOM Capture, Sanitization & Privacy

### Requirement: Recursive Sensitive Exclusion
Password fields, hidden inputs, `autocomplete^=cc-`, `[data-feedback-ignore]`, `[data-feedback-sensitive]`, and `config.excluded_selectors` SHALL be excluded recursively from selection and metadata; raw `outerHTML` and input `value` SHALL never be stored.

#### Scenario: Password field inside form pin
- **WHEN** user pins a form containing `input[type=password]`
- **THEN** password value is absent from `text_content` and attributes

### Requirement: Metadata Sanitizer on Server
All `element_references` accepted on HTTP SHALL pass server-side sanitization before persistence and before assistant LLM enrichment.

#### Scenario: Client sends oversized attribute map
- **WHEN** payload includes disallowed attribute keys
- **THEN** server strips or rejects per sanitizer rules

### Requirement: Smart vs Verbose Disclosure Policy
In `selection_mode: smart`, user-visible strings (confirmations, smart labels) SHALL use `friendly_label` / `component_kind`. Technical selectors MAY be stored for MCP/triage but SHALL NOT appear in smart-mode user confirmations.

#### Scenario: Confirmation after smart submit
- **WHEN** feedback is created in smart mode
- **THEN** `confirmation_message` omits `#selectors`

---

## Requirements: Screenshot Capture

### Requirement: Pre-Capture Redaction
Screenshots SHALL mask regions matching privacy exclusions before encoding.

#### Scenario: Sensitive banner in viewport shot
- **WHEN** viewport screenshot is taken
- **THEN** `[data-feedback-sensitive]` region is visually redacted

### Requirement: Widget UI Exclusion
ContextDrop chrome SHALL be hidden from captures so feedback images do not leak assistant keys or internal debug HUD in verbose mode.

#### Scenario: Screenshot during open composer
- **THEN** composer overlay is not present in captured bitmap (per capture implementation)

---

## Requirements: HTTP Ingestion, CORS & CSRF

### Requirement: CSRF on Mutating Routes
`POST`, `PATCH`, `PUT`, `DELETE` on feedback, attachments, assistant, and agent (when reachable) SHALL verify Rails CSRF tokens for same-origin browser clients.

#### Scenario: Missing CSRF on feedback create
- **WHEN** POST lacks valid token in Rails mode
- **THEN** request is rejected

### Requirement: Config Endpoint Non-Leakage
`GET /config` SHALL return only `public_widget_config` fields (limits, features, assistant flags, masked agent availability).

#### Scenario: MCP key not in config JSON
- **THEN** `mcp_api_key` is not a key in the response object

### Requirement: CORS Preflight Gating
`OPTIONS` handlers SHALL validate `Origin` against `config.allowed_origins` when origins are configured.

#### Scenario: Untrusted origin preflight
- **GIVEN** `allowed_origins` lists `https://app.example.com` only
- **WHEN** `Origin: https://evil.example` preflights
- **THEN** `403 Forbidden`

### Requirement: Submission Authorization Hook
`authorize_submission` SHALL run before create/upload; when `allow_anonymous` is false, unauthenticated requests SHALL receive `401 Unauthorized`.

#### Scenario: Anonymous blocked
- **GIVEN** `allow_anonymous` is false and no submitter
- **WHEN** POST feedback
- **THEN** `401 Unauthorized`

---

## Requirements: Ownership, Sessions & IDOR

### Requirement: HMAC Ownership Tokens
Own-feedback operations SHALL verify `ownership_token` using `ContextDrop::OwnershipToken` HMAC with `ownership_secret` / `CONTEXT_DROP_SECRET_KEY` / `secret_key_base` fallback.

#### Scenario: Update without token
- **WHEN** PATCH feedback `#42` without valid ownership
- **THEN** `403 Forbidden`

### Requirement: Hashed Session Identifier
Session cookies for anonymous ownership correlation SHALL use hashed session ids server-side where implemented; session ids SHALL NOT be logged in assistant audit rows as plain text beyond operational necessity.

#### Scenario: List own feedbacks
- **WHEN** GET /feedback with valid tokens
- **THEN** only owned active feedbacks returned

### Requirement: Attachment Download Scoping
Attachment bytes SHALL only be served for feedback the caller owns (submitter, token, or session match), with `Content-Security-Policy: default-src 'none'; sandbox`, `X-Content-Type-Options: nosniff`, and `Referrer-Policy: no-referrer` headers.

#### Scenario: Cross-user attachment URL
- **WHEN** user B requests user A's attachment id
- **THEN** `403 Forbidden`

---

## Requirements: Rate Limiting & Abuse

### Requirement: Configurable Submission Rate Limits
`config.rate_limit` SHALL apply to feedback create/update/delete, comment create, attachment upload, and assistant turn/approve endpoints per client IP (or equivalent identifier).

#### Scenario: 21st request in window
- **THEN** `429 Too Many Requests`

### Requirement: Attachment and Element Caps
Server SHALL enforce `max_attachments`, `max_element_references`, `max_attachment_size`, and `max_image_dimensions` regardless of client-side widget limits.

#### Scenario: Client bypasses widget and sends 11 attachments
- **THEN** `422 Unprocessable Entity`

---

## Requirements: Binary Upload Validation

### Requirement: Magic-Byte MIME Verification
Allowed types SHALL be verified via Marcel (or equivalent), not client `Content-Type`.

#### Scenario: HTML renamed to .png
- **THEN** rejected with `422`

### Requirement: Dimension and Size Enforcement
Oversized images SHALL be rejected before Active Storage persistence.

#### Scenario: 11 MB file with 10 MB limit
- **THEN** rejected

---

## Requirements: Dashboard & Operator Access

### Requirement: Dashboard Authorization
All `/context_drop/dashboard/*` actions SHALL pass `authorize_dashboard` (default: admin or development).

#### Scenario: Non-admin production access
- **WHEN** unauthorized user opens dashboard index
- **THEN** `403 Forbidden` or redirect per host

### Requirement: Integration Secret Encryption
Lark and webhook credentials in `NotificationDestination` SHALL be encrypted at rest via `NotificationSecrets`.

#### Scenario: DB row inspection
- **THEN** raw signing secrets are not stored plaintext in settings column

### Requirement: Dashboard Comment Attribution
Operator comments SHALL record `author_type` and `author_label`; agent comments default to `Agent` label and are distinguishable from end users.

---

## Requirements: MCP Server (stdio & HTTP)

### Requirement: MCP Disabled by Default on HTTP
`mcp_enabled` defaults false; enabling requires explicit operator action and API key.

#### Scenario: HTTP MCP off
- **THEN** `POST /mcp` → `404`

### Requirement: Constant-Time Bearer Comparison
HTTP MCP authentication SHALL compare Bearer tokens in constant time.

#### Scenario: Wrong token
- **THEN** `401 Unauthorized` without executing tool

### Requirement: MCP Tool Data as Untrusted Input to Agents
MCP returns feedback messages, URLs, and stack-adjacent strings; IDE agents SHALL treat them as data (documented in MCP namespace instructions). Engine SHALL NOT execute instructions embedded in feedback `message` fields.

#### Scenario: Feedback message contains shell command text
- **WHEN** `get_feedback` returns message "run rm -rf /"
- **THEN** server returns JSON only; no server-side execution occurs

### Requirement: Remote Federation HTTPS
`RemoteClient` (Ruby and TypeScript) SHALL require HTTPS for non-loopback MCP URLs, block private/link-local/metadata hosts, ignore `allow_insecure_http` in production, and refuse HTTP redirects (`redirect: "error"`) to prevent Bearer token leakage.

#### Scenario: http:// remote URL
- **THEN** connection refused or error at configuration/call time

#### Scenario: Metadata IP remote URL
- **WHEN** a remote MCP environment is configured with `https://169.254.169.254/mcp`
- **THEN** `RemoteClient` refuses the connection before sending `Authorization` headers

### Requirement: MCP Status Change Authorization
`update_feedback_status` over MCP SHALL only be callable by authenticated MCP clients, not by anonymous widget users.

---

## Requirements: MCP Events, Webhooks & SSE

### Requirement: Authenticated Event Stream
`GET /mcp/events/stream` SHALL use the same Bearer auth as HTTP MCP.

#### Scenario: Unauthenticated SSE
- **THEN** connection rejected

### Requirement: Webhook Signing
Outbound webhook deliveries SHALL use Standard Webhooks (or documented HMAC headers) so receivers can verify origin.

#### Scenario: Test delivery from dashboard
- **THEN** payload includes verifiable signature headers

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

### Requirement: Event Payload Minimization
Event occurrences SHALL include feedback id, status, environment, page_url — not full DOM snapshots — unless a tool explicitly fetches them.

---

## Requirements: Local BYOK Agent (Loopback Only)

### Requirement: Production Hard Deny
`/context_drop/agent/*` SHALL return `404` when `Rails.env.production?`, when local agent disabled, or when request is not strict loopback.

#### Scenario: Agent chat from remote IP
- **THEN** `403 Forbidden`

### Requirement: Same-Origin on Mutations
Non-GET agent requests SHALL require same-origin `Origin` header matching host/port.

#### Scenario: Cross-origin POST /agent/chat
- **THEN** `403 Forbidden`

### Requirement: Dashboard-Authorized Agent Users
Agent endpoints SHALL require `dashboard_authorized?` in addition to loopback checks.

### Requirement: Workspace Sandbox Jail
File tools SHALL resolve paths under `Rails.root` realpath; denylisted paths include `.env*`, credentials, `.git/hooks`, keys, and `tmp/context_drop_byok*`.

#### Scenario: Symlink escape attempt
- **THEN** `SandboxError` / tool error without read

### Requirement: No Shell Tool
Agent tool list SHALL NOT expose arbitrary command execution.

### Requirement: Human-in-the-Loop Disk Writes
`propose_file_edit` stages in memory; `apply_edit` requires explicit user action and digest check.

---

## Requirements: BYOK Key Storage

### Requirement: Server-Side Credentials Only
LLM calls for assistant and agent SHALL load keys from ENV or encrypted vault file (`AES-256-GCM`) with `0600` permissions, not from browser.

#### Scenario: Widget config
- **THEN** no raw keys in `GET /config`

### Requirement: Custom OpenAI-Compatible URL Policy
HTTP base URLs for custom provider SHALL require HTTPS except loopback hosts (see `LlmClient.validate_custom_base_url!`).

#### Scenario: http://external.api
- **THEN** configuration rejected

### Requirement: Separate Assistant vs Agent Budget
The engine SHALL isolate assistant LLM execution from the local loopback agent via dedicated `CONTEXT_DROP_ASSISTANT_*` environment keys and `assistant_key_store_path` vault resolution (with optional `assistant_allow_shared_key_store` fallback), separate rate-limit buckets (`assistant_rate_limit`), per-mode read timeouts (`assistant_timeouts`), and server-enforced model selection (`assistant_allow_client_model_override = false` by default and optional `assistant_allowed_models`).

#### Scenario: Untrusted client model override ignored by default
- **GIVEN** `assistant_models` sets `{ ask: "claude-3-5-haiku-latest" }` and `assistant_allow_client_model_override` is `false`
- **WHEN** a browser client posts `mode: "ask"` with `model: "claude-opus-4"`
- **THEN** the orchestrator executes with `"claude-3-5-haiku-latest"`

#### Scenario: Strict assistant vault isolation
- **GIVEN** `assistant_allow_shared_key_store` is `false` and only `ANTHROPIC_API_KEY` (not `CONTEXT_DROP_ASSISTANT_ANTHROPIC_API_KEY` or assistant vault) is set
- **WHEN** a client posts an Ask turn
- **THEN** `assistant_llm_configured?` is `false` and the server responds with `422 Unprocessable Entity`

---

## Requirements: Widget Assistant (Ask / Build / Feedback)

### Requirement: Fail-Closed Ask/Build Without BYOK
Ask and Build turns SHALL return `422` when no provider is configured; Feedback mode SHALL remain available.

#### Scenario: Feedback guidance without keys
- **THEN** `200 OK` with guidance text

### Requirement: Mode-Separated Tool Registries
Ask and Build SHALL use disjoint tool registries; Ask denylist blocks git/repo/deploy tools at registration.

### Requirement: Build Off on Production Default
`resolved_assistant_modes` on production SHALL exclude `build` unless host overrides.

### Requirement: ChangeSet Two-Phase Commit
Git write adapters run only after approve with valid `approval_token`.

### Requirement: Feedback Confirmation IDOR
Assistant feedback status lookup SHALL require ownership token or submitter match.

#### Scenario: Enumerate feedback by id
- **WHEN** attacker guesses `feedback_id` without token
- **THEN** `403 Forbidden`

### Requirement: LLM Prompt Minimization in Smart Mode
DOM appendix for LLM uses friendly disclosure; hosts SHOULD sanitize RAG tool output before returning to orchestrator.

### Requirement: Assistant Turn Audit Without Prompt Retention
Assistant turns table stores tool names, not prompts.

---

## Requirements: Host Build Pack & Git Integration

### Requirement: Git Credentials Off Browser Path
Git tokens, deploy keys, and GitHub App secrets SHALL exist only in host adapter process memory/env, never in LLM prompts or widget config.

#### Scenario: Build approve
- **THEN** LLM context does not include git password

### Requirement: Protected Branch Enforcement (Host)
Host `git_push_branch` adapter SHALL refuse pushes to `main`/`master` and require PR flow.

#### Scenario: Model proposes push to main
- **THEN** adapter returns error; no push

### Requirement: Path Allowlist (Host)
`repo_read_file` and patch application SHALL enforce repository path allowlists (e.g. `app/views/**`) configured in host policy.

---

## Requirements: Notifications (Lark & Webhooks)

### Requirement: Encrypted Credentials at Rest
Notification destination secrets encrypted; dashboard displays masked values only.

### Requirement: Scoped Event Subscriptions
Destinations subscribe only to configured `event_types`; test delivery does not broadcast to production webhooks without operator action.

---

## Requirements: Node / Standalone Handler Parity

### Requirement: Equivalent IDOR and Rate Limits
`@context-drop` HTTP handler SHALL implement own-feedback ownership checks, feedback confirmations, rate limiting, and `/assistant/*` security controls (mode allowlists, Ask tool denylist, Build write gating, HMAC ChangeSet `approval_token`, strict ChangeSet submitter/session ACL, and isolated assistant rate limits) consistent with Rails engine behavior.

#### Scenario: PATCH another user's feedback on Next.js route
- **THEN** `403 Forbidden`

#### Scenario: Build rejected on Next.js production default
- **GIVEN** `@context-drop` handler runs with `environment: "production"` and default assistant modes
- **WHEN** a client posts `mode: "build"` to `POST /assistant/turn`
- **THEN** the response status is `403 Forbidden`

### Requirement: Integration API Key for Destinations
`/integrations/destinations` SHALL require `CONTEXT_DROP_INTEGRATIONS_API_KEY` or `config.integrations.authorize` when configured.

---

## Requirements: Logging & Operations

### Requirement: No Production Secret Logging
Rails/logger and Node console output from ContextDrop — as well as persisted delivery error columns (`last_delivery_error`) — MUST NOT print raw MCP API keys, ownership secrets or tokens, ChangeSet approval tokens, webhook signing secrets, Lark app secrets, or LLM API keys. `ContextDrop::Engine` SHALL register ContextDrop secret keys in `Rails.application.config.filter_parameters` and scrub runtime error strings via `ContextDrop::SecretRedactor`.

#### Scenario: MCP auth failure
- **THEN** logs reason without echoing provided Bearer token

#### Scenario: Webhook delivery error echoes secret in upstream body
- **WHEN** an upstream webhook receiver returns an HTTP error body echoing a Bearer token or signing secret
- **THEN** `last_delivery_error` and logger output replace the secret with `[FILTERED]`

### Requirement: Soft Delete for Feedback
Deleted feedback excluded from MCP list by default; restores require dashboard/tool with auth.

---

## Requirements: Compliance-Oriented Data Handling

### Requirement: Minimize LLM Retention Responsibility
Hosts enabling Ask/Build SHALL configure provider data retention / zero-retention policies per vendor contract (operational, outside gem code).

### Requirement: User-Facing Confirmation Accuracy
`assistant_feedback_confirmations` templates SHALL not promise legal/regulatory outcomes unless host legal approves copy.

#### Scenario: Default template
- **THEN** states record id and status, not "GDPR erasure complete"