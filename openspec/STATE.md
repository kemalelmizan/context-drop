# OpenSpec implementation state (handoff)

**Last verified:** 2025-11-25 — Ruby `spec/run_all.rb` (74 passed), `npm test` (49 passed).

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
| Assistant security | `assistant-security` | `tool_registry.rb`, approval tokens |
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

Use `openspec/changes/<id>/design.md` for historical rationale only. **Do not treat change deltas as the only source of truth** when a matching file exists under `openspec/specs/`.

## Spec ↔ code alignment (known drift)

| Topic | Spec says | Code today | Action for next agent |
|-------|-----------|------------|------------------------|
| `POST /assistant/turn` `attachments` | Accepted on turn (`assistant-api`) | Param not passed from controller; orchestrator ignores `attachments` for Ask/Build | Either wire through + include in LLM context, or **MODIFY** spec to defer attachments |
| Webhook HTTPS in production | `security-hardening` — reject non-HTTPS | `NotificationDestination` only requires non-empty `url` | Implement `URI.parse` HTTPS check or document as **Partial** in matrix |
| ChangeSet ACL | `assistant-security` — IDOR on shared staging | `change_set_visible?` allows same `session_id` | Harden if product requires stricter ACL (matrix: Partial) |
| Ownership tokens | H014 / ingestion | Stored in widget `localStorage` | Optional memory-only mode (matrix gap) |
| `change_set_create` tool | Listed optional in `host-build-pack.md` | Promoted spec marks optional | Aligned in canonical `host-assistant-tools` |

Everything else exercised by `spec/context_drop/assistant_spec.rb` and `assistant_security_spec.rb` matches `assistant-api`, `assistant-feedback`, and `assistant-security` scenarios.

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

1. Close drift rows above (attachments, webhook HTTPS, ChangeSet ACL).
2. Archive or delete `openspec/changes/*` per your org’s OpenSpec promote workflow once comfortable (folders kept for audit trail).
3. Optional: `bundle exec rspec spec/` in CI host with full Bundler setup (gem uses `spec/run_all.rb` for lightweight runs).