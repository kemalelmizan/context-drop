# OpenSpec implementation state (handoff)

**Last verified:** 2026-11-25 — Ruby `spec/run_all.rb` (79 passed), `npm test` (51 passed), `npm run typecheck` (0 errors).

Read this file **before** planning new work. Normative behavior lives in `openspec/specs/<capability>/spec.md`. Project context: `openspec/project.md`. Agent workflow: `openspec/AGENTS.md`.

## Canonical capability index

| Capability | Spec | Primary code |
|------------|------|--------------|
| Engine config | `engine-configuration` | `lib/context_drop/configuration.rb` |
| HTTP ingestion | `http-ingestion-api` | `app/controllers/context_drop/feedbacks_controller.rb` |
| Widget composer | `widget-composer` | `app/javascript/context_drop/widget.ts` |
| DOM selection | `dom-element-selection` | `element-picker.ts`, sanitizer |
| Screenshots | `screenshot-capture` | `screenshot.ts` |
| Persistence | `feedback-persistence` | `app/models/context_drop/*` |
| Dashboard | `feedback-dashboard` | `app/controllers/context_drop/dashboard/*` |
| Events & notifications | `feedback-events-notifications` | `lib/context_drop/feedback_events/*` |
| MCP server | `mcp-server` | `lib/context_drop/mcp/*` |
| Privacy baseline | `security-and-privacy` | sanitizer, upload validator |
| Security hardening | `security-hardening` | cross-cutting (see matrix) |
| Security ops | `security-operations` | `docs/security/*` |
| Assistant HTTP API | `assistant-api` | `assistant_controller.rb`, `assistant/orchestrator.rb` |
| Assistant widget UX | `assistant-widget` | `widget.ts` (modes, ChangeSet card) |
| Assistant security | `assistant-security` | `tool_registry.rb`, approval tokens, ChangeSet ACL |
| Assistant feedback | `assistant-feedback` | `feedback_confirmation.rb`, create JSON |
| ChangeSets | `change-set-persistence` | `change_set.rb`, `build_executor.rb` |
| Host tool packs | `host-assistant-tools` | `configuration.rb` registrars, `docs/assistant/*` |

**Local BYOK agent (loopback)** is implemented under `lib/context_drop/agent/*` and `agent_controller.rb` but is not a separate OpenSpec capability; hardening scenarios are in `security-hardening`.

## Completed change folders (implemented — do not re-build from scratch)

All tasks in these folders are `[x]`. Deltas are **merged into** `openspec/specs/` unless noted.

| Change ID | Theme |
|-----------|--------|
| `initial-mvp` | Engine, widget, ingestion, dashboard |
| `mcp-server` | MCP tools + HTTP transport |
| `mcp-events-notifications` | Events, Lark/webhook, SSE |
| `assistant-three-modes` | Ask / Build / Feedback assistant |
| `assistant-security-and-confirmations` | Hardening specs + confirmations + security docs |
| `close-spec-drift` | Assistant multimodal turn attachments, webhook HTTPS/SSRF validation, ChangeSet ACL hardening, memory-only ownership tokens |

Use `openspec/changes/<id>/design.md` for historical rationale only. **Do not treat change deltas as the only source of truth** when a matching file exists under `openspec/specs/`.

## Spec ↔ code alignment

All previously tracked drift items have been closed and promoted into `openspec/specs/`:

| Topic | Canonical spec | Status |
|-------|----------------|--------|
| `POST /assistant/turn` `attachments` | `assistant-api` | **Aligned** — controller, orchestrator, and widget validate & forward `signed_blob_id` / `data_url` vision inputs |
| Webhook HTTPS & private-host validation | `security-hardening` (`SEC-H042`) | **Aligned** — `NotificationDestination`, `WebhookClient`, and Node `/integrations/destinations` reject non-HTTPS and private/metadata hosts on save & delivery (`allow_insecure_webhooks` permits loopback `http://` in `development` only) |
| ChangeSet ACL | `assistant-security` (`SEC-A007`) | **Aligned** — strict polymorphic `submitter` match, `turn` `change_set_id` visibility check, hashed session IDs (no `remote_ip` fallback), and authenticated submitter required on non-local environments by default |
| Ownership tokens storage | `security-hardening` (`SEC-H014`) | **Aligned** — bounded endpoint-scoped `localStorage` default with `persist_ownership_tokens = false` / `persistOwnershipTokens: false` memory-only mode |
| `change_set_create` tool | `host-assistant-tools` | **Aligned** — marked optional in canonical spec and `host-build-pack.md` |

## Verification (run after spec or security changes)

```bash
ruby spec/run_all.rb
npm test
```

Operator traceability: walk `docs/security/REVIEW_CHECKLIST.md` with `docs/security/COVERAGE_MATRIX.md`.

## Documentation map (assistant)

- BYOK: `docs/assistant/byok-policy.md`
- Host packs: `docs/assistant/host-ask-pack.md`, `host-build-pack.md`
- Threat summary: `docs/assistant/security.md`

## Suggested next work (not started)

1. Optional separate LLM vault / rate-limit budget split between widget assistant and loopback local agent (`SEC-H053`).
2. Archive or delete `openspec/changes/*` per your org’s OpenSpec promote workflow once comfortable (folders kept for audit trail).
3. Optional: `bundle exec rspec spec/` in CI host with full Bundler setup (gem uses `spec/run_all.rb` for lightweight runs).
