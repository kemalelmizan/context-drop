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
`GET` and `approve` on ChangeSets SHALL allow only the polymorphic submitter match or matching `session_id` recorded on the ChangeSet.

#### Scenario: Cross-session read denied
- **GIVEN** ChangeSet `#7` has `session_id: "sess_a"`
- **WHEN** another browser session `sess_b` requests `GET /assistant/change_sets/7`
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