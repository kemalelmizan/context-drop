# Delta: Widget Assistant Security (`close-spec-drift`)

## MODIFIED Requirements

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
