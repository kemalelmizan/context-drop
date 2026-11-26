# OpenSpec implementation state (handoff)

**Last verified:** 2026-11-26 — Ruby `spec/run_all.rb` (86 passed), `npm test` (54 passed), `npm run typecheck` (0 errors).

Read this file **before** planning new work. Normative behavior lives in `openspec/specs/<capability>/spec.md`. Project context: `openspec/project.md`. Agent workflow: `openspec/AGENTS.md`.

## Canonical capability index

| Capability | Spec | Primary code |
|------------|------|--------------|
| Engine config | `engine-configuration` | `lib/context_drop/configuration.rb` |
| HTTP ingestion | `http-ingestion-api` | `app/controllers/context_drop/feedbacks_controller.rb`, `src/server/handler.ts` |
| Widget composer | `widget-composer` | `app/javascript/context_drop/widget.ts` |
| DOM selection | `dom-element-selection` | `element-picker.ts`, sanitizer |
| Screenshots | `screenshot-capture` | `screenshot.ts` |
| Persistence | `feedback-persistence` | `app/models/context_drop/*`, `src/server/storage/*` |
| Dashboard | `feedback-dashboard` | `app/controllers/context_drop/dashboard/*` |
| Events & notifications | `feedback-events-notifications` | `lib/context_drop/feedback_events/*`, `src/events/*`, `src/notifications/*` |
| MCP server | `mcp-server` | `lib/context_drop/mcp/*`, `src/mcp/*` |
| Privacy baseline | `security-and-privacy` | sanitizer, upload validator |
| Security hardening | `security-hardening` | cross-cutting (`secret_redactor.rb`, `secrets.ts`, see matrix) |
| Security ops | `security-operations` | `docs/security/*` |
| Assistant HTTP API | `assistant-api` | `assistant_controller.rb`, `assistant/orchestrator.rb`, `src/assistant/*` |
| Assistant widget UX | `assistant-widget` | `widget.ts` (modes, ChangeSet card) |
| Assistant security | `assistant-security` | `tool_registry.rb`, `src/assistant/tools.ts`, approval tokens, ChangeSet ACL |
| Assistant feedback | `assistant-feedback` | `feedback_confirmation.rb`, `src/assistant/confirmations.ts` |
| ChangeSets | `change-set-persistence` | `change_set.rb`, `build_executor.rb`, `src/assistant/change-sets.ts` |
| Host tool packs | `host-assistant-tools` | `configuration.rb` registrars, `src/assistant/tools.ts`, `docs/assistant/*` |

**Local BYOK agent (loopback)** is implemented under `lib/context_drop/agent/*` and `agent_controller.rb` (hardening scenarios in `security-hardening`).

## Completed change folders (implemented — do not re-build from scratch)

All tasks in these folders are `[x]`. Deltas are **merged into** `openspec/specs/`.

| Change ID | Theme |
|-----------|--------|
| `initial-mvp` | Engine, widget, ingestion, dashboard |
| `mcp-server` | MCP tools + HTTP transport |
| `mcp-events-notifications` | Events, Lark/webhook, SSE |
| `assistant-three-modes` | Ask / Build / Feedback assistant |
| `assistant-security-and-confirmations` | Hardening specs + confirmations + security docs |
| `close-spec-drift` | Assistant multimodal turn attachments, webhook HTTPS/SSRF validation, ChangeSet ACL hardening, memory-only ownership tokens |
| `assistant-llm-budget-isolation` | Dedicated `CONTEXT_DROP_ASSISTANT_*` & vault isolation (`SEC-H053`), model allowlists, per-mode timeouts, isolated assistant rate limits |
| `node-assistant-parity` | Full `@context-drop` Next.js/Node parity for `/assistant/*`, ChangeSets, org BYOK, and smart confirmations |
| `secret-logging-guard` | Rails `filter_parameters` initializer + `SecretRedactor` / `redactSecretsFromText` runtime log & error scrubbing (`SEC-H069`) |
| `post-iteration-security-audit` | `0600` notification master keys, `WidgetHelper` metadata sanitization, `RemoteClient` SSRF/redirect defense, agent payload caps, attachment `Referrer-Policy` |
| `ai-adversarial-hardening` | MCP `<untrusted_feedback_data>` fencing & internal-by-default agent comments, `SafeRepoReader` + `PatchValidator`, safe URI schemes + Dashboard nonce CSP, `SsrfGuard` DNS pinning + Lark `api_host`/`lark_md` hardening, scoped `ActiveStorage` pending upload `signed_id`s, fail-closed Postgres secret, opt-in `trustProxy` rate limits, conversation budget caps, Shadow DOM/textarea screenshot redaction |

Use `openspec/changes/<id>/design.md` for historical rationale only. **Do not treat change deltas as the only source of truth** when a matching file exists under `openspec/specs/`.

## Spec ↔ code alignment

All canonical capability and security hardening specs under `openspec/specs/` are aligned with both the Rails engine (`context_drop`) and standalone TypeScript/Next.js package (`@context-drop`). Every gem-owned requirement in `docs/security/COVERAGE_MATRIX.md` has status `Implemented` with automated test coverage.

## Verification (run after spec or security changes)

```bash
npm run build
npm run typecheck
ruby spec/run_all.rb
npm test
```

Operator traceability: walk `docs/security/REVIEW_CHECKLIST.md` with `docs/security/COVERAGE_MATRIX.md`.

## Documentation map (assistant)

- BYOK: `docs/assistant/byok-policy.md`
- Host packs: `docs/assistant/host-ask-pack.md`, `host-build-pack.md`
- Threat summary: `docs/assistant/security.md`

## Suggested next work (not started)

1. Archive or delete historical `openspec/changes/*` folders per your org’s OpenSpec promote workflow once comfortable (folders kept for audit trail).
2. Optional: `bundle exec rspec spec/` in CI host with full Bundler setup (gem uses `spec/run_all.rb` for lightweight runs).
