# Delta: Widget Assistant Security (`ai-adversarial-hardening`)

## ADDED Requirements

### Requirement: Safe Build Repo Reader and Patch Path Guardrails
ContextDrop SHALL provide `ContextDrop::Assistant::SafeRepoReader` (enforcing `realpath` workspace containment, symlink rejection, `256 KB` cap, secret-file denylisting, and `allowed_globs`) for Build read tools, SHALL validate `propose_change_set` patches (`<= 20` files, `<= 256 KB`, no `..` traversal, blocking CI/workflow/build-config/secret paths), and SHALL display all target patch file paths on the widget `ChangeSet` approval card before approval.

#### Scenario: Prompt-injected ChangeSet targeting CI workflow is rejected
- **GIVEN** Build mode is active and the LLM emits `propose_change_set` with a patch targeting `.github/workflows/ci.yml` or `../secrets.txt`
- **WHEN** the orchestrator processes the tool call
- **THEN** `propose_change_set` rejects the forbidden patch path and no `ChangeSet` is persisted

### Requirement: Assistant Conversation Budget Limits
`POST /assistant/turn` (Rails and Node) and `POST /agent/chat` SHALL enforce upper bounds on conversation turn count (`assistant_max_messages`, default `24`), individual message length (`assistant_max_message_length`, default `8,000` chars), and cumulative message characters (`assistant_max_total_message_chars`, default `48,000` chars), rejecting oversized payloads with `422 Unprocessable Entity` before invoking any LLM provider.

#### Scenario: Oversized message history rejected before LLM call
- **GIVEN** `assistant_max_messages` is `24`
- **WHEN** a client posts `25` messages to `POST /assistant/turn`
- **THEN** the server responds with `422 Unprocessable Entity` and zero LLM steps are executed
