# ContextDrop Security Review Checklist

Use this checklist before enabling **production** feedback, **HTTP MCP**, **assistant (Ask/Build)**, or **local agent** in a host application. Normative requirements: [`openspec/specs/security-hardening/spec.md`](../../openspec/specs/security-hardening/spec.md), [`openspec/specs/assistant-security/spec.md`](../../openspec/specs/assistant-security/spec.md).

**How to use:** For each item, verify implementation via [`COVERAGE_MATRIX.md`](./COVERAGE_MATRIX.md), run linked tests where present, and record Owner sign-off (App Sec / SRE / Product).

---

## 1. Engine & configuration

- [ ] **SEC-H001** `CONTEXT_DROP_ENABLED` intentional; disabled returns 404 on ingestion (`ApplicationController#require_context_drop_enabled`)
- [ ] **SEC-H002** Engine mounted with `isolate_namespace ContextDrop` only
- [ ] **SEC-H003** `current_submitter` wired to host auth model (not hardcoded `User`)
- [ ] **SEC-H004** `authorize_submission` reviewed for public vs internal apps
- [ ] **SEC-H005** `authorize_dashboard` restricts `/context_drop/dashboard/*`
- [ ] **SEC-H006** `authorize_assistant_mode` reviewed; Build stricter than Ask
- [ ] **SEC-H007** `assistant_modes_by_environment`: production excludes `build` unless explicitly approved
- [ ] **SEC-H008** `allowed_origins` set if widget loaded cross-origin
- [ ] **SEC-H009** `ownership_secret` or `CONTEXT_DROP_SECRET_KEY` set in production (not fallback-only)
- [ ] **SEC-H010** `rate_limit` tuned for expected traffic (feedback + assistant)

## 2. Browser widget

- [ ] **SEC-H011** Widget uses Shadow DOM (`widget.ts` `attachShadow`)
- [ ] **SEC-H012** Pin mode uses capture-phase suppression (`element-picker.ts`)
- [ ] **SEC-H013** No LLM/MCP secrets in DOM; agent status shows masked keys only
- [ ] **SEC-H014** Ownership tokens: conscious acceptance of `localStorage` for own-feedback IDOR UX (`api-client.ts`) — scope tokens per feedback id only
- [ ] **SEC-H015** Smart mode does not show raw selectors to end users in confirmations

## 3. DOM, screenshots & privacy

- [ ] **SEC-H016** Default `excluded_selectors` + host additions cover PCI/PII fields
- [ ] **SEC-H017** Server sanitizes all `element_references` (`MetadataSanitizer`)
- [ ] **SEC-H018** Screenshot redaction paths exercised (`screenshot.ts`, sanitizer)
- [ ] **SEC-H019** Smart confirmation copy omits selectors (`FeedbackConfirmation`)

## 4. HTTP ingestion

- [ ] **SEC-H020** CSRF on mutating routes (Rails forgery protection + widget token from `/config`)
- [ ] **SEC-H021** `GET /config` reviewed — no MCP/API keys in JSON (`public_widget_config`)
- [ ] **SEC-H022** CORS preflight gated (`origin_allowed?`)
- [ ] **SEC-H023** Upload magic-byte validation (`UploadValidator` / `upload-validator.ts`)
- [ ] **SEC-H024** Size/dimension/count limits enforced server-side
- [ ] **SEC-H025** Own-feedback IDOR: ownership token HMAC + submitter match (`OwnershipToken`, `feedbacks_controller`)
- [ ] **SEC-H026** Attachment download scoped to owner

## 5. Dashboard & notifications

- [ ] **SEC-H027** Dashboard requires `authorize_dashboard`
- [ ] **SEC-H028** Integration secrets encrypted (`NotificationSecrets`)
- [ ] **SEC-H029** Webhook URLs HTTPS in production; signing secrets rotated
- [ ] **SEC-H030** Lark credentials stored encrypted; test delivery limited to operators

## 6. MCP (stdio & HTTP)

- [ ] **SEC-H031** `mcp_enabled` false unless deliberately on
- [ ] **SEC-H032** Strong `mcp_api_key`; stored in secrets manager not repo
- [ ] **SEC-H033** HTTP MCP uses constant-time Bearer compare (`mcp_controller`)
- [ ] **SEC-H034** SSE events stream same auth (`mcp_events_controller`)
- [ ] **SEC-H035** Remote federation URLs HTTPS (`RemoteClient` Ruby + TS)
- [ ] **SEC-H036** IDE agents treat MCP strings as data (document in runbooks)
- [ ] **SEC-H037** Webhook deliveries signed (`webhook_client`)

## 7. Local BYOK agent (development only)

- [ ] **SEC-H038** `enable_local_agent` false in production/staging unless exception approved
- [ ] **SEC-H039** Loopback + same-origin walls on `/agent/*` (`AgentController`)
- [ ] **SEC-H040** Workspace sandbox denylist reviewed (`WorkspaceSandbox`)
- [ ] **SEC-H041** No shell tool; diffs require Apply (`Orchestrator` + `apply_edit!`)
- [ ] **SEC-H042** BYOK vault file permissions `0600` under `tmp/`

## 8. Widget assistant (Ask / Build / Feedback)

- [ ] **SEC-A001** `assistant_enabled` intentional; 404 when off
- [ ] **SEC-A002** Org BYOK for Ask/Build; Feedback works without LLM
- [ ] **SEC-A003** Ask tools: no `git_*` / `repo_*` registration
- [ ] **SEC-A004** Build write tools only after ChangeSet approve + `approval_token`
- [ ] **SEC-A005** ChangeSet session/submitter visibility rules acceptable for your staging ACL
- [ ] **SEC-A006** Smart mode LLM context uses friendly DOM labels (`DomContextFormatter`)
- [ ] **SEC-A007** `assistant_turns` audit: no prompt bodies stored
- [ ] **SEC-A008** Feedback lookup by id requires ownership (`Orchestrator#feedback_visible?`)
- [ ] **SEC-A009** Confirmation templates legally accurate (`assistant_feedback_confirmations`)

## 9. Host Build pack (if Build enabled)

- [ ] **SEC-H043** `config/context_drop/build.rb` implements real git/CI — not null stubs
- [ ] **SEC-H044** Git credentials only on server; not in LLM prompts
- [ ] **SEC-H045** Branch protection: adapter refuses push to `main`
- [ ] **SEC-H046** Path allowlist for `repo_read_file` / patches

## 10. Node / standalone (`@context-drop`)

- [ ] **SEC-H047** Handler parity: ownership + rate limits (`src/server/handler.ts`)
- [ ] **SEC-H048** Integrations API key for `/integrations/destinations`

## 11. Operations & compliance

- [ ] **SEC-H049** Logs do not print Bearer tokens or API keys
- [ ] **SEC-H050** LLM provider zero-retention / DPA in place (host)
- [ ] **SEC-H051** Soft-deleted feedback excluded from public list/MCP default scopes
- [ ] **SEC-H052** Run `ruby spec/run_all.rb` + `npm test` after config changes

---

## Sign-off block

| Area | Reviewer | Date | Notes |
|------|----------|------|-------|
| Ingestion & IDOR | | | |
| MCP & events | | | |
| Assistant / Build | | | |
| Local agent | | | |
| Notifications | | | |