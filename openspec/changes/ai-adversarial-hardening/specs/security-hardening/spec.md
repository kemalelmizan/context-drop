# Delta: ContextDrop Security Hardening (`ai-adversarial-hardening`)

## MODIFIED Requirements

### Requirement: MCP Tool Data as Untrusted Input to Agents
MCP prompts (`investigate_feedback`) and tools (`get_feedback`, `add_feedback_comment`) SHALL wrap untrusted submitter fields (`message`, `page_url`, `metadata`, `element_references`, comments) inside explicit `<untrusted_feedback_data>` delimiters with anti-prompt-injection guidance, scrub `add_feedback_comment` bodies via `SecretRedactor`, and hide `Agent`-authored MCP comments from submitter-facing `GET /feedback` responses by default (`expose_agent_comments_to_submitter = false`) unless explicitly marked `visibility: "public"`.

#### Scenario: Submitter cannot exfiltrate internal MCP agent notes
- **GIVEN** an anonymous submitter holds a valid `ownership_token` for feedback `#42` and `expose_agent_comments_to_submitter` is `false`
- **WHEN** a developer's MCP agent posts a diagnostic note via `add_feedback_comment` (default `visibility: "internal"`)
- **THEN** `GET /context_drop/feedback` omits the internal agent comment while the Triage Dashboard and MCP `get_feedback` retain it

### Requirement: Remote Federation HTTPS
`RemoteClient` (Ruby and TypeScript) SHALL require HTTPS for non-loopback MCP URLs, block private/link-local/CGNAT/metadata hosts and wildcard DNS rebinding domains (`*.nip.io`, `*.sslip.io`, `*.xip.io`), resolve and verify target DNS records before connecting (pinning `Net::HTTP#ipaddr=` in Ruby), ignore `allow_insecure_http` in production, and refuse HTTP redirects (`redirect: "error"`).

#### Scenario: Wildcard DNS rebinding host blocked
- **WHEN** a remote MCP environment is configured with `https://169.254.169.254.nip.io/mcp`
- **THEN** `RemoteClient` rejects the endpoint before opening a network socket

### Requirement: Webhook URL Validation
Dashboard (`NotificationDestination`), standalone integrations API (`/integrations/destinations`), and outbound delivery clients (`WebhookClient` and `LarkClient`) SHALL validate target URLs on save and delivery, rejecting non-HTTPS schemes, private/loopback/link-local/CGNAT/metadata hosts, wildcard rebinding domains, and HTTP redirects, resolving DNS at delivery time, restricting `LarkClient` `api_host` to allowlisted Lark/Feishu hosts, and escaping untrusted `lark_md` fields.

#### Scenario: Lark api_host SSRF and markdown injection blocked
- **WHEN** an operator configures `api_host` pointing to an untrusted host or a submitter posts `<at id=all></at>` in `message`
- **THEN** `NotificationDestination` / `LarkClient` rejects the untrusted `api_host` and escapes `<at id=all></at>` in delivered Lark cards

### Requirement: Pre-Capture Redaction
Screenshots SHALL mask regions matching privacy exclusions across both document light DOM and open Shadow DOM roots before encoding, and SHALL NOT paint leaf text from `<input>`, `<textarea>`, `<select>`, or `[contenteditable]` elements onto the canvas.

#### Scenario: Textarea and open shadow sensitive elements excluded from bitmap
- **WHEN** a viewport screenshot is captured on a page containing a `<textarea>` with text and an open Shadow DOM component containing `[data-feedback-sensitive]`
- **THEN** the `<textarea>` text is not drawn and the shadow-root sensitive rect is masked

## ADDED Requirements

### Requirement: Safe URI Schemes and Dashboard Content Security Policy
`Feedback` ingestion (Rails and Node), Dashboard templates, `Referer` navigation shortcuts, and Widget `ChangeSet` links SHALL reject non-HTTP executable URI schemes (`javascript:`, `data:`, `vbscript:`, protocol-relative `//`), and Dashboard HTML responses SHALL emit a nonce-based `Content-Security-Policy` blocking inline script injection.

#### Scenario: Reject javascript: page_url at ingestion
- **WHEN** a client submits `POST /feedback` with a non-HTTP executable scheme in `page_url`
- **THEN** the server rejects the payload with `422 Unprocessable Entity`

### Requirement: Scoped Pending Upload Signed IDs
`POST /context_drop/attachments` SHALL issue `ActiveStorage::Blob` signed IDs scoped to `purpose: :context_drop_pending_upload` with a bounded expiration (`30` minutes), and `FeedbacksController` / `Assistant::Orchestrator` SHALL reject unscoped or already-attached host-application blobs.

#### Scenario: Host ActiveStorage signed_id rejected by ContextDrop
- **GIVEN** an `ActiveStorage::Blob` minted outside `AttachmentsController` without `purpose: :context_drop_pending_upload`
- **WHEN** a client submits its `signed_id` to `POST /context_drop/feedback` or `POST /context_drop/assistant/turn`
- **THEN** the server responds with `422 Unprocessable Entity`

### Requirement: Fail-Closed Node Postgres Secret & Opt-In Proxy IP Resolution
`createPostgresStorageAdapter` SHALL fail closed in `production` when no explicit or environment secret (`CONTEXT_DROP_SECRET_KEY`, `CONTEXT_DROP_SECRET`, `NEXTAUTH_SECRET`, `AUTH_SECRET`) is configured and use random per-instance keys in non-production; `@context-drop` HTTP rate limiting SHALL ignore client-supplied `X-Forwarded-For` / `X-Real-IP` headers unless `trustProxy` is explicitly enabled.

#### Scenario: Spoofed X-Forwarded-For does not bypass Node rate limit by default
- **GIVEN** `createContextDropNextHandler` runs with default `trustProxy` (`false`) and `rateLimit: { maxRequests: 2, periodSeconds: 3600 }`
- **WHEN** a client sends 3 requests with distinct `X-Forwarded-For` IP headers
- **THEN** the 3rd request receives `429 Too Many Requests`
