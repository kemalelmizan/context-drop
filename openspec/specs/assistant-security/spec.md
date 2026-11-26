# Widget Assistant Security Specification

## Purpose
Defines security controls specific to Ask, Build, and Feedback assistant modes, distinct from the loopback-only Local BYOK Agent sidebar.

## Requirements

### Requirement: Assistant Enabled Master Switch
When `config.assistant_enabled` is `false`, all `/context_drop/assistant/*` endpoints SHALL respond with `404 Not Found` and the widget SHALL NOT render assistant mode tabs.

#### Scenario: Assistant disabled
- **GIVEN** `assistant_enabled` is `false`
- **WHEN** a client requests `POST /context_drop/assistant/turn`
- **THEN** the response status is `404 Not Found`

### Requirement: Environment Mode Allowlist
The engine SHALL expose only modes listed in `resolved_assistant_modes` (default: production → `ask`, `feedback`; non-production → `ask`, `build`, `feedback`). Hosts MAY override via `assistant_modes_by_environment`.

#### Scenario: Build blocked on production default
- **GIVEN** resolved environment is `production` and host has not opted into Build
- **WHEN** `mode: build` is posted
- **THEN** the server responds with `403 Forbidden`

### Requirement: Per-Mode Authorization Callback
The engine SHALL invoke `config.authorize_assistant_mode.call(controller, mode)` before executing turns or ChangeSet mutations. Build mode SHALL default to stricter policy than Ask (staff/admin/development).

#### Scenario: Build requires elevated principal
- **GIVEN** default `authorize_assistant_mode` and an anonymous session
- **WHEN** the user attempts Build mode
- **THEN** the server responds with `403 Forbidden`

### Requirement: Ask Tool Registration Denylist
`register_ask_tool` SHALL reject tool names matching forbidden prefixes (`git_`, `change_set_`, `pull_request_`, `repo_`, `deploy_`, `run_shell`) unless explicitly documented host override in a future version.

#### Scenario: Host attempts git tool on Ask pack
- **WHEN** `register_ask_tool(name: "git_push_branch", ...)` is called at boot
- **THEN** registration raises a configuration error before the server accepts traffic

### Requirement: Build Write Tool Gating
Build-mode LLM tool lists SHALL NOT include host write tools (`write: true`) during `assistant/turn`. Write tools SHALL execute only inside `BuildExecutor` after ChangeSet approval.

#### Scenario: LLM cannot push during plan turn
- **GIVEN** a Build assistant turn without approval
- **WHEN** the tool registry is queried with `allow_write: false`
- **THEN** `git_push_branch` and `pull_request_open` are absent from the schema list

### Requirement: ChangeSet Approval Token
Approving a draft ChangeSet SHALL require `approval_token` matching the HMAC digest stored at creation (`OwnershipToken.resolved_secret` domain `cd_change_set:v1`).

#### Scenario: Approve without token
- **WHEN** `POST .../change_sets/:id/approve` is sent without `approval_token`
- **THEN** the server responds with `422 Unprocessable Entity`

#### Scenario: Approve with wrong token
- **WHEN** approve is called with a tampered token
- **THEN** `approve!` raises and the server responds with `422` or `403` without invoking git write tools

### Requirement: ChangeSet Visibility
`GET /assistant/change_sets/:id`, `POST /assistant/change_sets/:id/approve`, and `POST /assistant/turn` with `change_set_id` SHALL enforce strict ChangeSet ownership: when a ChangeSet records a polymorphic `submitter`, access SHALL require an authenticated submitter matching `submitter_type` and `submitter_id` without falling back to `session_id`; when unattributed, access SHALL be permitted only when anonymous ChangeSets are allowed for the environment (default: `development` and `test` only; disabled on `staging` and `production` unless `config.assistant_allow_anonymous_change_sets` is enabled) and the caller's hashed session identifier matches `record.session_id` (never `request.remote_ip`).

#### Scenario: Cross-session read denied
- **GIVEN** anonymous ChangeSets are allowed in `development` and ChangeSet `#7` has hashed `session_id` for browser session A
- **WHEN** another browser session B requests `GET /assistant/change_sets/7` or posts `change_set_id: 7` to `POST /assistant/turn`
- **THEN** the server responds with `403 Forbidden`

#### Scenario: Attributed ChangeSet blocks same-session impersonation
- **GIVEN** ChangeSet `#8` belongs to `submitter` `Employee#1`
- **WHEN** `Employee#2` (or an unauthenticated request sharing the same session cookie or IP) requests `GET` or `approve` on ChangeSet `#8`
- **THEN** the server responds with `403 Forbidden`

#### Scenario: Shared staging requires authenticated submitter by default
- **GIVEN** `resolved_environment` is `staging` and `assistant_allow_anonymous_change_sets` is not enabled
- **WHEN** an unauthenticated caller attempts to propose or read an unattributed ChangeSet
- **THEN** the server responds with `403 Forbidden`

### Requirement: Smart DOM Disclosure for LLM Context
When `resolved_selection_mode` is `smart`, Ask and Build turns SHALL append only friendly pin labels to LLM user context, not raw CSS selectors or `dom_path`.

#### Scenario: Smart Ask turn DOM appendix
- **GIVEN** smart mode and a pin with `friendly_label`
- **WHEN** an Ask turn includes element references
- **THEN** the appended context lines contain the friendly label
- **AND** do not contain `#id` selectors

### Requirement: Assistant Rate Limiting
`assistant/turn` and `assistant/change_sets/:id/approve` SHALL be subject to the same configurable rate limit as feedback submission (`config.rate_limit`).

#### Scenario: Assistant turn throttled
- **GIVEN** rate limit exceeded for client IP
- **WHEN** another assistant turn is posted
- **THEN** the server responds with `429 Too Many Requests`

### Requirement: Assistant Audit Minimization
`context_drop_assistant_turns` SHALL store mode, provider, model, tool name list, duration, and optional `change_set_id`, and SHALL NOT store full prompt bodies or API keys.

#### Scenario: Audit row after Ask turn
- **WHEN** an Ask turn completes
- **THEN** a row is inserted with `mode: "ask"` and `tool_names` array
- **AND** no column contains raw user message text

### Requirement: Public Widget Config Secret Hygiene
`public_widget_config` SHALL expose `assistant.llm_configured` boolean and `assistant.modes` but SHALL NOT expose API key material, MCP keys, or approval tokens.

#### Scenario: Config endpoint inspection
- **WHEN** `GET /context_drop/config` returns JSON
- **THEN** no field matches `/api[_-]?key/i` patterns with non-masked values

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