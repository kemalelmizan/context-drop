# ChangeSet Persistence Specification

## Purpose
Defines engine-owned `ContextDrop::ChangeSet` records linking Build mode proposals to git branches, pull requests, and CI preview URLs.

## Requirements

### Requirement: ChangeSet Record Schema
The engine SHALL persist ChangeSets in `context_drop_change_sets` with `status`, `page_url`, `summary`, `branch_name`, `pr_url`, `preview_url`, `metadata` (JSON), optional polymorphic `submitter`, optional `feedback_id`, and `session_id`.

#### Scenario: Draft ChangeSet from Build propose
- **GIVEN** a Build turn that stages file patches
- **WHEN** the orchestrator creates a ChangeSet
- **THEN** `status` is `draft` and patches are stored in `metadata`
- **AND** no host git write tools run

### Requirement: ChangeSet Status Lifecycle
`ContextDrop::ChangeSet` SHALL support statuses including `draft`, `approved`, `branch_pushed`, `pr_open`, `checks_running`, `preview_ready`, `merged`, `deployed`, and `abandoned`.

#### Scenario: Poll build status
- **GIVEN** a ChangeSet with `pr_open` status
- **WHEN** the client calls `GET /context_drop/assistant/change_sets/:id`
- **THEN** the server MAY refresh status via host `build_status_get` and return updated `preview_url` when available