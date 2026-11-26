# Security Requirements — Code Coverage Matrix

Maps normative requirements to implementation paths, automated tests, and ownership (**Gem** = shipped in `context_drop`, **Host** = host app config/adapters, **Op** = operational/process).

**Specs:** [`security-hardening`](../../openspec/specs/security-hardening/spec.md) · [`assistant-security`](../../openspec/specs/assistant-security/spec.md) · [`assistant-feedback`](../../openspec/specs/assistant-feedback/spec.md)

**Status legend:** `Implemented` · `Partial` · `Host` · `Op` · `Gap` (not enforced in code yet)

---

## Trust boundaries & engine

| ID | Requirement | Implementation (primary paths) | Tests | Status | Owner |
|----|-------------|-------------------------------|-------|--------|-------|
| SEC-H001 | Isolated namespace & disabled surface | [`lib/context_drop/engine.rb`](../../lib/context_drop/engine.rb) `isolate_namespace`; [`app/controllers/context_drop/application_controller.rb`](../../app/controllers/context_drop/application_controller.rb) `require_context_drop_enabled`; [`app/helpers/context_drop/widget_helper.rb`](../../app/helpers/context_drop/widget_helper.rb) | `configuration_spec.rb` | Implemented | Gem |
| SEC-H002 | (same as H001) | (same) | — | Implemented | Gem |
| SEC-H003 | Host owns identity | [`lib/context_drop/configuration.rb`](../../lib/context_drop/configuration.rb) `current_submitter`, `resolve_submitter`; [`app/controllers/context_drop/feedbacks_controller.rb`](../../app/controllers/context_drop/feedbacks_controller.rb) create | `configuration_spec.rb` | Implemented | Host+Gem |
| SEC-H004 | (see H003 submission auth) | `authorize_submission`, `submission_authorized?` | `configuration_spec.rb` | Implemented | Host |

---

## Browser widget

| ID | Requirement | Implementation | Tests | Status | Owner |
|----|-------------|----------------|-------|--------|-------|
| SEC-H011 | Shadow DOM isolation | [`app/javascript/context_drop/widget.ts`](../../app/javascript/context_drop/widget.ts) `attachShadow`; bundle `context_drop.js` | `widget.test.ts` | Implemented | Gem |
| SEC-H012 | Capture-phase pin suppression | [`app/javascript/context_drop/element-picker.ts`](../../app/javascript/context_drop/element-picker.ts) capture listeners | `widget.test.ts` | Implemented | Gem |
| SEC-H013 | No secrets in DOM (keys) | [`lib/context_drop/agent/key_store.rb`](../../lib/context_drop/agent/key_store.rb) `providers_status` masking; [`app/controllers/context_drop/agent_controller.rb`](../../app/controllers/context_drop/agent_controller.rb) status JSON | `agent_spec.rb` | Implemented | Gem |
| SEC-H014 | No raw MCP/BYOK in storage; configurable ownership token persistence | Keys/approval tokens never in `localStorage`; [`app/javascript/context_drop/api-client.ts`](../../app/javascript/context_drop/api-client.ts) bounded scoped map + `persist_ownership_tokens` memory-only mode | `api-client.test.ts`, `configuration_spec.rb` | Implemented | Gem+Host |

---

## DOM, sanitization & smart disclosure

| ID | Requirement | Implementation | Tests | Status | Owner |
|----|-------------|----------------|-------|--------|-------|
| SEC-H016 | Recursive sensitive exclusion | [`app/javascript/context_drop/sanitizer.ts`](../../app/javascript/context_drop/sanitizer.ts); [`lib/context_drop/configuration.rb`](../../lib/context_drop/configuration.rb) `MANDATORY_EXCLUDED_SELECTORS` | `sanitizer` / widget tests | Implemented | Gem |
| SEC-H017 | Server metadata sanitizer | [`app/services/context_drop/metadata_sanitizer.rb`](../../app/services/context_drop/metadata_sanitizer.rb); used in `feedbacks_controller.rb` | `dashboard_spec` / ingestion specs | Implemented | Gem |
| SEC-H018 | Pre-capture redaction | [`app/javascript/context_drop/screenshot.ts`](../../app/javascript/context_drop/screenshot.ts); `excluded_selectors` from config | `screenshot` / widget tests | Implemented | Gem |
| SEC-H019 | Smart confirmation omits selectors | [`lib/context_drop/assistant/feedback_confirmation.rb`](../../lib/context_drop/assistant/feedback_confirmation.rb); [`feedbacks_controller.rb`](../../app/controllers/context_drop/feedbacks_controller.rb) create | `assistant_security_spec.rb` | Implemented | Gem |
| SEC-H088 | Smart LLM DOM disclosure | [`lib/context_drop/assistant/dom_context_formatter.rb`](../../lib/context_drop/assistant/dom_context_formatter.rb); [`orchestrator.rb`](../../lib/context_drop/assistant/orchestrator.rb) | `assistant_security_spec.rb` | Implemented | Gem |

---

## Screenshots (widget UI in frame)

| ID | Requirement | Implementation | Tests | Status | Owner |
|----|-------------|----------------|-------|--------|-------|
| SEC-H018b | Widget UI excluded from capture | [`screenshot.ts`](../../app/javascript/context_drop/screenshot.ts) hides widget where implemented | widget tests | Implemented | Gem |

---

## HTTP: CSRF, CORS, config

| ID | Requirement | Implementation | Tests | Status | Owner |
|----|-------------|----------------|-------|--------|-------|
| SEC-H020 | CSRF on mutations | Rails `protect_from_forgery`; [`api-client.ts`](../../app/javascript/context_drop/api-client.ts) `buildJsonHeaders` + CSRF from `/config` | ingestion / widget tests | Implemented | Gem+Host |
| SEC-H021 | Config non-leakage | [`configuration.rb`](../../lib/context_drop/configuration.rb) `public_widget_config`; [`configs_controller.rb`](../../app/controllers/context_drop/configs_controller.rb) | `configuration_spec.rb` | Implemented | Gem |
| SEC-H022 | CORS preflight | [`configs_controller.rb`](../../app/controllers/context_drop/configs_controller.rb) `cors_preflight`; [`application_controller.rb`](../../app/controllers/context_drop/application_controller.rb) `origin_allowed?` | `configs_controller_spec.rb` | Implemented | Host+Gem |
| SEC-H023 | Submission authorization | [`application_controller.rb`](../../app/controllers/context_drop/application_controller.rb) `enforce_submission_authorization!` | `feedbacks_controller_spec.rb` | Implemented | Host |

---

## Ownership & IDOR

| ID | Requirement | Implementation | Tests | Status | Owner |
|----|-------------|----------------|-------|--------|-------|
| SEC-H025 | HMAC ownership tokens | [`app/services/context_drop/ownership_token.rb`](../../app/services/context_drop/ownership_token.rb) | `feedbacks_controller_spec.rb` | Implemented | Gem |
| SEC-H026 | Session hash on feedback | `feedbacks_controller.rb` session id stamping; `matchesOwnFeedback` patterns | handler / Rails specs | Implemented | Gem |
| SEC-H027 | Attachment download scope | [`feedbacks_controller.rb`](../../app/controllers/context_drop/feedbacks_controller.rb) `attachment`; `owns_feedback?` | controller specs | Implemented | Gem |

---

## Rate limits & caps

| ID | Requirement | Implementation | Tests | Status | Owner |
|----|-------------|----------------|-------|--------|-------|
| SEC-H028 | Rate limiting | [`application_controller.rb`](../../app/controllers/context_drop/application_controller.rb) `enforce_rate_limit!`; assistant `before_action` | controller specs | Implemented | Gem |
| SEC-H029 | Attachment/element caps | `feedbacks_controller.rb` create/update; `configuration.rb` limits | ingestion specs | Implemented | Gem |

---

## Upload validation

| ID | Requirement | Implementation | Tests | Status | Owner |
|----|-------------|----------------|-------|--------|-------|
| SEC-H030 | Magic-byte MIME | [`app/services/context_drop/upload_validator.rb`](../../app/services/context_drop/upload_validator.rb); [`src/server/upload-validator.ts`](../../src/server/upload-validator.ts) | `upload_validator_spec.rb` | Implemented | Gem |
| SEC-H031 | Size/dimensions | `UploadValidator`; config limits; TS handler | upload specs | Implemented | Gem |

---

## Dashboard & comments

| ID | Requirement | Implementation | Tests | Status | Owner |
|----|-------------|----------------|-------|--------|-------|
| SEC-H032 | Dashboard auth | [`app/controllers/context_drop/dashboard/`](../../app/controllers/context_drop/dashboard/) `ApplicationController` ancestry; `authorize_dashboard` | `dashboard_spec.rb` | Implemented | Host+Gem |
| SEC-H033 | Integration encryption | [`lib/context_drop/notification_secrets.rb`](../../lib/context_drop/notification_secrets.rb); [`notification_destination.rb`](../../app/models/context_drop/notification_destination.rb) | `events_and_notifications_spec.rb` | Implemented | Gem |
| SEC-H034 | Comment author types | [`app/models/context_drop/comment.rb`](../../app/models/context_drop/comment.rb); MCP `AddFeedbackComment` | mcp specs | Implemented | Gem |

---

## MCP HTTP / stdio / federation

| ID | Requirement | Implementation | Tests | Status | Owner |
|----|-------------|----------------|-------|--------|-------|
| SEC-H035 | MCP disabled default | [`configuration.rb`](../../lib/context_drop/configuration.rb); [`mcp_controller.rb`](../../app/controllers/context_drop/mcp_controller.rb) | `mcp_spec.rb` | Implemented | Gem |
| SEC-H036 | Constant-time Bearer | [`mcp_controller.rb`](../../app/controllers/context_drop/mcp_controller.rb); [`mcp_events_controller.rb`](../../app/controllers/context_drop/mcp_events_controller.rb) `secure_compare` | `mcp_spec.rb` | Implemented | Gem |
| SEC-H037 | MCP data fenced & agent comment isolation | `<untrusted_feedback_data>` framing in [`investigate_feedback.rb`](../../lib/context_drop/mcp/prompts/investigate_feedback.rb) & [`dispatcher.ts`](../../src/mcp/dispatcher.ts); internal-by-default `AddFeedbackComment` + `SecretRedactor` | `assistant_security_spec.rb`, `nextjs-server-and-mcp.test.ts` | Implemented | Gem |
| SEC-H038 | Remote HTTPS & DNS-pinning SSRF/redirect defense | [`lib/context_drop/ssrf_guard.rb`](../../lib/context_drop/ssrf_guard.rb); [`remote_client.rb`](../../lib/context_drop/mcp/remote_client.rb) (`ipaddr=`); [`src/server/ssrf-guard.ts`](../../src/server/ssrf-guard.ts); [`remote-client.ts`](../../src/mcp/remote-client.ts) | `mcp_spec.rb`, `assistant_security_spec.rb`, `nextjs-server-and-mcp.test.ts` | Implemented | Gem |
| SEC-H039 | MCP status auth | Same Bearer as HTTP MCP | `mcp_spec.rb` | Implemented | Gem |
| SEC-H040 | SSE auth & bounded queues | `mcp_events_controller.rb` + [`event_stream_registry.rb`](../../lib/context_drop/mcp/event_stream_registry.rb) (`SizedQueue`, max 50 subscribers); TS `event-stream-registry.ts` | `events_and_notifications_spec.rb`, `assistant_security_spec.rb` | Implemented | Gem |
| SEC-H041 | Webhook signing | [`lib/context_drop/notifications/webhook_client.rb`](../../lib/context_drop/notifications/webhook_client.rb); TS `webhook-client.ts` | notifications spec | Implemented | Gem |
| SEC-H042 | Webhook & Lark URL/markdown policy | [`ssrf_guard.rb`](../../lib/context_drop/ssrf_guard.rb); [`lark_client.rb`](../../lib/context_drop/notifications/lark_client.rb) (`api_host` allowlist + `escape_lark_md`); [`webhook_client.rb`](../../lib/context_drop/notifications/webhook_client.rb); TS `lark-client.ts` & `webhook-client.ts` | `events_and_notifications_spec.rb`, `assistant_security_spec.rb`, `nextjs-server-and-mcp.test.ts` | Implemented | Gem+Host |
| SEC-H043 | Event payload minimization | [`lib/context_drop/feedback_events/publisher.rb`](../../lib/context_drop/feedback_events/publisher.rb) | events specs | Implemented | Gem |
| SEC-H044 | Stdio MCP | [`lib/context_drop/mcp/stdio_runner.rb`](../../lib/context_drop/mcp/stdio_runner.rb); `bin/rails context_drop:mcp` | `mcp_spec.rb` | Implemented | Gem |

---

## Local agent (loopback)

| ID | Requirement | Implementation | Tests | Status | Owner |
|----|-------------|----------------|-------|--------|-------|
| SEC-H045 | Production hard deny | [`configuration.rb`](../../lib/context_drop/configuration.rb) `local_agent_allowed?`; `agent_controller.rb` `enforce_local_agent_security_wall!` | `agent_spec.rb` | Implemented | Gem |
| SEC-H046 | Same-origin mutations | `agent_controller.rb` `valid_same_origin_request?` | `agent_spec.rb` | Implemented | Gem |
| SEC-H047 | Dashboard auth for agent | `authorize_dashboard` in agent wall | `agent_spec.rb` | Implemented | Host+Gem |
| SEC-H048 | Workspace jail | [`lib/context_drop/agent/workspace_sandbox.rb`](../../lib/context_drop/agent/workspace_sandbox.rb) | `agent_spec.rb` | Implemented | Gem |
| SEC-H049 | No shell tool | [`lib/context_drop/agent/orchestrator.rb`](../../lib/context_drop/agent/orchestrator.rb) `AGENT_TOOLS` list | `agent_spec.rb` | Implemented | Gem |
| SEC-H050 | Human-in-the-loop edits | `propose_file_edit`; `apply_edit!` digest check | `agent_spec.rb` | Implemented | Gem |

---

## BYOK / LLM

| ID | Requirement | Implementation | Tests | Status | Owner |
|----|-------------|----------------|-------|--------|-------|
| SEC-H051 | Server-side keys only | [`key_store.rb`](../../lib/context_drop/agent/key_store.rb); encrypted vault | `agent_spec.rb` | Implemented | Gem |
| SEC-H052 | Custom URL HTTPS policy | [`llm_client.rb`](../../lib/context_drop/agent/llm_client.rb) `validate_custom_base_url!` | `agent_spec.rb` | Implemented | Gem |
| SEC-H053 | Separate assistant budget | [`configuration.rb`](../../lib/context_drop/configuration.rb) `assistant_key_store`, `assistant_allowed_models`, `assistant_rate_limit`, `assistant_timeouts`; [`key_store.rb`](../../lib/context_drop/agent/key_store.rb) `scope: :assistant` | `assistant_spec.rb`, `nextjs-server-and-mcp.test.ts` | Implemented | Gem+Host |

---

## Widget assistant (Ask / Build / Feedback)

| ID | Requirement | Implementation | Tests | Status | Owner |
|----|-------------|----------------|-------|--------|-------|
| SEC-A001 | Assistant master switch | [`assistant_controller.rb`](../../app/controllers/context_drop/assistant_controller.rb) `enforce_assistant_enabled!` | `assistant_spec.rb` | Implemented | Gem |
| SEC-A002 | Mode allowlist | [`configuration.rb`](../../lib/context_drop/configuration.rb) `resolved_assistant_modes` | `assistant_spec.rb` | Implemented | Gem |
| SEC-A003 | Per-mode auth | `authorize_assistant_mode`; `assistant_authorized?` | — | Implemented | Host |
| SEC-A004 | Ask tool denylist | [`tool_registry.rb`](../../lib/context_drop/assistant/tool_registry.rb) `validate_ask_registration!` | `assistant_security_spec.rb` | Implemented | Gem |
| SEC-A005 | Build write gating | `tools_for_mode(allow_write:)`; [`build_executor.rb`](../../lib/context_drop/assistant/build_executor.rb) | `assistant_security_spec.rb` | Implemented | Gem |
| SEC-A006 | ChangeSet approval token | [`change_set.rb`](../../app/models/context_drop/change_set.rb); approve action | `assistant_spec.rb` | Implemented | Gem |
| SEC-A007 | ChangeSet visibility | [`assistant_controller.rb`](../../app/controllers/context_drop/assistant_controller.rb) `change_set_visible?` (strict submitter match, hashed session ID, non-local submitter gate, `turn` `change_set_id` check) | `assistant_security_spec.rb` | Implemented | Gem |
| SEC-A008 | Smart DOM for LLM | `dom_context_formatter.rb` | `assistant_security_spec.rb` | Implemented | Gem |
| SEC-A009 | Assistant rate limit | `before_action :enforce_assistant_rate_limit!` (`assistant` namespace); Node `checkAssistantRateLimit` | `assistant_spec.rb`, `nextjs-server-and-mcp.test.ts` | Implemented | Gem |
| SEC-A010 | Audit without prompts | [`assistant_turn.rb`](../../app/models/context_drop/assistant_turn.rb); [`src/assistant/change-sets.ts`](../../src/assistant/change-sets.ts) | `nextjs-server-and-mcp.test.ts` | Implemented | Gem |
| SEC-A011 | Public config hygiene | `public_widget_config` `assistant` block | `configuration_spec.rb` | Implemented | Gem |
| SEC-H054 | Fail-closed Ask/Build BYOK | `assistant_controller.rb` turn; Feedback exempt | `assistant_spec.rb` | Implemented | Gem |
| SEC-H055 | Mode-separated registries | `tool_registry.rb` | `assistant_security_spec.rb` | Implemented | Gem |
| SEC-H056 | Build off production default | `resolved_assistant_modes` | `assistant_spec.rb` | Implemented | Gem |
| SEC-H057 | Two-phase Build commit | `BuildExecutor`; approve endpoint | — | Implemented | Gem |
| SEC-H058 | Feedback confirmation IDOR | `orchestrator.rb` `feedback_visible?` | `assistant_security_spec.rb` | Implemented | Gem |
| SEC-H059 | Feedback templates | `feedback_confirmation.rb`; widget + create JSON | `assistant_spec.rb` | Implemented | Gem+Host |

---

## Host Build pack

| ID | Requirement | Implementation | Tests | Status | Owner |
|----|-------------|----------------|-------|--------|-------|
| SEC-H060 | Git creds off browser | Build tools server-side only | — | Implemented | Host |
| SEC-H061 | Protected branch | Host `register_build_tool` `git_push_branch` | — | Host | Host |
| SEC-H062 | Path allowlist & patch guardrails | [`safe_repo_reader.rb`](../../lib/context_drop/assistant/safe_repo_reader.rb); [`patch_validator.rb`](../../lib/context_drop/assistant/patch_validator.rb); [`change-sets.ts`](../../src/assistant/change-sets.ts) `validateChangeSetPatches`; `context_drop_build.rb.tt` | `assistant_security_spec.rb`, `nextjs-server-and-mcp.test.ts` | Implemented | Gem+Host |
| SEC-H063 | Null stub until configured | [`adapters/null_build.rb`](../../lib/context_drop/assistant/adapters/null_build.rb) | — | Implemented | Gem |

---

## Notifications

| ID | Requirement | Implementation | Tests | Status | Owner |
|----|-------------|----------------|-------|--------|-------|
| SEC-H064 | Encrypted at rest | `NotificationSecrets` | events spec | Implemented | Gem |
| SEC-H065 | Scoped event types | [`notification_destination.rb`](../../app/models/context_drop/notification_destination.rb) `subscribed_to?` | events spec | Implemented | Gem |

---

## Node / standalone

| ID | Requirement | Implementation | Tests | Status | Owner |
|----|-------------|----------------|-------|--------|-------|
| SEC-H066 | IDOR, Postgres secret & URI scheme parity | [`src/server/handler.ts`](../../src/server/handler.ts) `matchesOwnFeedback`, `isSafePageUrl`, `/assistant/*`; [`postgres.ts`](../../src/server/storage/postgres.ts) fail-closed production secret; [`url_safety.rb`](../../lib/context_drop/url_safety.rb) + Dashboard nonce CSP | `assistant_security_spec.rb`, `nextjs-server-and-mcp.test.ts` | Implemented | Gem |
| SEC-H067 | Rate limits & opt-in `trustProxy` + message caps | `handler.ts` `resolveClientIp` (`trustProxy: false` default) + `assistant_max_messages` / char caps | `assistant_security_spec.rb`, `nextjs-server-and-mcp.test.ts` | Implemented | Gem |
| SEC-H068 | Integrations API key | `handler.ts` integrations routes; env `CONTEXT_DROP_INTEGRATIONS_API_KEY` | `nextjs-server-and-mcp.test.ts` | Implemented | Gem |

---

## Operations & compliance

| ID | Requirement | Implementation | Tests | Status | Owner |
|----|-------------|----------------|-------|--------|-------|
| SEC-H069 | No secret logging | [`lib/context_drop/engine.rb`](../../lib/context_drop/engine.rb) `filter_parameters`; [`lib/context_drop/secret_redactor.rb`](../../lib/context_drop/secret_redactor.rb); [`src/notifications/secrets.ts`](../../src/notifications/secrets.ts) `redactSecretsFromText` | `assistant_security_spec.rb`, `nextjs-server-and-mcp.test.ts` | Implemented | Gem+Op |
| SEC-H070 | Soft delete scope | `Feedback` scopes; MCP `list_feedbacks` active filter | persistence specs | Implemented | Gem |
| SEC-H071 | LLM retention DPA | — | — | Op | Host |
| SEC-H072 | Confirmation legal accuracy | `assistant_feedback_confirmations` config | — | Host | Host |

---

## Known gaps & follow-ups

All gem-owned gaps (`SEC-H014`, `SEC-H042`, `SEC-H053`, `SEC-H069`, `SEC-A007`) and `@context-drop` assistant parity (`SEC-H066`, `SEC-H067`) are implemented and covered by automated tests. Remaining `Host` / `Op` rows (`SEC-H061`, `SEC-H062`, `SEC-H071`, `SEC-H072`) depend on host git adapters, vendor DPAs, and legal copy review.

---

## Test commands

```bash
ruby spec/run_all.rb          # Ruby mini-RSpec suite (includes assistant_security_spec)
npm test                      # TypeScript widget + handler tests
bundle exec rspec spec/       # Full RSpec when bundle available
```

Update this matrix when adding requirements to `security-hardening/spec.md` or moving implementations.