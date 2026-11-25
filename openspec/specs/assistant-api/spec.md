# Widget Assistant HTTP API Specification

## Purpose
Defines server-side Ask/Build assistant turns, ChangeSet approval, and mode authorization separate from the loopback local agent.

## Requirements

### Requirement: Assistant Turn Endpoint
The engine SHALL expose `POST /context_drop/assistant/turn` accepting `mode` (`ask`, `build`, or `feedback`), `messages`, `page_url`, optional `element_references`, `attachments`, and optional `change_set_id`, returning assistant `reply`, optional `change_set`, and `tool_calls` metadata.

#### Scenario: Ask turn with configured BYOK
- **GIVEN** Ask mode is enabled for the environment and org BYOK credentials resolve
- **WHEN** the client posts a valid Ask turn
- **THEN** the server responds with `200 OK` and a plain-language `reply`
- **AND** only Ask-allowlisted tools may execute

#### Scenario: Ask turn without BYOK
- **GIVEN** no LLM credentials are configured
- **WHEN** the client posts an Ask or Build turn
- **THEN** the server responds with `422 Unprocessable Entity` describing missing assistant LLM configuration

### Requirement: ChangeSet Approval Gate
The engine SHALL persist Build proposals as `ContextDrop::ChangeSet` records in `draft` status and SHALL invoke host Build write tools only after explicit `POST /context_drop/assistant/change_sets/:id/approve`.