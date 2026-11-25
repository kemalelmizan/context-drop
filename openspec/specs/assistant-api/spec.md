# Widget Assistant HTTP API Specification

## Purpose
Defines server-side Ask/Build/Feedback assistant turns, ChangeSet approval, and mode authorization separate from the loopback local agent.

## Requirements

### Requirement: Assistant Turn Endpoint
The engine SHALL expose `POST /context_drop/assistant/turn` accepting `mode` (`ask`, `build`, or `feedback`), `messages`, `page_url`, optional `element_references`, `attachments`, optional `change_set_id`, optional `feedback_id`, and optional `ownership_token`, returning assistant `reply`, optional `change_set`, `tool_calls`, and optional `feedback_confirmation` metadata.

#### Scenario: Ask turn with configured BYOK
- **GIVEN** Ask mode is enabled for the environment and org BYOK credentials resolve
- **WHEN** the client posts a valid Ask turn
- **THEN** the server responds with `200 OK` and a plain-language `reply`
- **AND** only Ask-allowlisted tools may execute

#### Scenario: Ask turn without BYOK
- **GIVEN** no LLM credentials are configured
- **WHEN** the client posts an Ask or Build turn
- **THEN** the server responds with `422 Unprocessable Entity` describing missing assistant LLM configuration

### Requirement: Mode Authorization
The engine SHALL enforce `config.authorize_assistant_mode` and environment mode allowlists before executing assistant turns or ChangeSet mutations.

#### Scenario: Build rejected on production default
- **GIVEN** default production mode allowlist excludes `build`
- **WHEN** the client posts `mode: build` on production
- **THEN** the server responds with `403 Forbidden`

### Requirement: ChangeSet Approval Gate
The engine SHALL persist Build proposals as `ContextDrop::ChangeSet` records in `draft` status and SHALL invoke host Build write tools only after explicit `POST /context_drop/assistant/change_sets/:id/approve` with a valid `approval_token`.

#### Scenario: Approve opens PR via host adapter
- **GIVEN** a draft ChangeSet with staged patches
- **WHEN** an authorized user approves the ChangeSet with valid `approval_token`
- **THEN** the server calls host `git_*` and `pull_request_open` tools
- **AND** updates ChangeSet status to reflect branch and PR URL

#### Scenario: Approve rejected without token
- **WHEN** approve is called with missing `approval_token`
- **THEN** the server responds with `422 Unprocessable Entity`
- **AND** no git write tools execute

### Requirement: Feedback Mode Turn Without LLM
`POST /context_drop/assistant/turn` with `mode: feedback` SHALL succeed without org BYOK (see [`assistant-feedback/spec.md`](../assistant-feedback/spec.md)).

#### Scenario: Feedback guidance turn
- **GIVEN** assistant is enabled and LLM is not configured
- **WHEN** the client posts `mode: "feedback"`
- **THEN** the server responds with `200 OK` and guidance `reply`
- **AND** does not call external LLM APIs

#### Scenario: Feedback confirmation by id
- **GIVEN** valid `ownership_token` for feedback `#42`
- **WHEN** client posts `mode: "feedback"`, `feedback_id: 42`, and token
- **THEN** response includes `feedback_confirmation` with interpolated metadata

#### Scenario: Feedback confirmation IDOR
- **GIVEN** no valid ownership for feedback `#42`
- **WHEN** client posts `feedback_id: 42` without token
- **THEN** the server responds with `403 Forbidden`

### Requirement: Assistant Status Endpoint
The engine SHALL expose `GET /context_drop/assistant/status` returning `enabled`, `modes`, `llm_configured`, and `build_enabled` without secrets.

#### Scenario: Status for widget bootstrap
- **WHEN** widget loads config and status
- **THEN** it can hide Build tab when `build_enabled` is false