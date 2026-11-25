# Host Assistant Tool Registry Specification

## Purpose
Defines how host applications register Ask and Build tool packs with JSON schemas and mode allowlists.

## Requirements

### Requirement: Tool Registration API
The engine SHALL provide `ContextDrop.config.register_ask_tool` and `ContextDrop.config.register_build_tool` accepting tool definitions (`name`, `description`, `inputSchema`, `write: boolean`).

#### Scenario: Ask tool denylist
- **GIVEN** a host registers `search_product_knowledge` as an Ask tool
- **WHEN** an Ask turn runs
- **THEN** Build-only or write tools are not exposed to the LLM

### Requirement: Build Pack Contract
Host Build adapters SHALL implement required read tools (`build_context_resolve`, `repo_read_file`, `repo_search`, `build_status_get`) and write tools (`git_create_branch`, `git_apply_patches`, `git_push_branch`, `pull_request_open`, `change_set_abandon`) as documented in `docs/assistant/host-build-pack.md`. The `change_set_create` host tool is optional because the gem creates `ContextDrop::ChangeSet` records by default.

#### Scenario: Unconfigured host adapter
- **GIVEN** no host Build adapter is registered
- **WHEN** a user approves a ChangeSet
- **THEN** the server returns a descriptive configuration error without mutating git