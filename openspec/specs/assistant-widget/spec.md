# Assistant Widget Modes Specification

## Purpose
Defines Ask / Build / Feedback mode switcher, confirmation UX, and ChangeSet status UI in the feedback composer.

## Requirements

### Requirement: Composer Mode Switcher
The widget SHALL render mode tabs for enabled modes (`ask`, `build`, `feedback`) from `config.assistant.modes` and SHALL hide Build when `config.assistant.build.enabled` is false.

#### Scenario: Production default modes
- **GIVEN** `assistant.modes` is `["ask", "feedback"]`
- **WHEN** the composer opens
- **THEN** only Ask and Feedback tabs are visible

### Requirement: Feedback Guidance on Tab Select
When the user selects Feedback mode and assistant is enabled, the widget SHOULD request a feedback-mode assistant turn and display predefined guidance in the assistant stream.

#### Scenario: Guidance displayed without LLM keys
- **GIVEN** `assistant.llm_configured` is `false`
- **WHEN** the user opens Feedback mode
- **THEN** guidance text still appears
- **AND** Ask/Build tabs remain disabled or show error if selected without BYOK

### Requirement: Post-Submit Confirmation Display
After successful `POST /feedback`, the widget SHALL surface `confirmation_message` from the create response as an assistant-style message when assistant is enabled.

#### Scenario: Confirmation in status and stream
- **WHEN** create returns `confirmation_message`
- **THEN** the widget shows the message in the status region and assistant message stream
- **AND** appends the feedback entry to the session thread as today

### Requirement: ChangeSet Status Card
When Build mode returns a ChangeSet, the widget SHALL display branch/PR state, copy that changes are **not on main**, and provide Approve and Refresh actions.

#### Scenario: Approve ChangeSet
- **GIVEN** a draft ChangeSet with diff preview and `approval_token` from turn response
- **WHEN** the user clicks Approve
- **THEN** the widget calls `POST /assistant/change_sets/:id/approve` with the token
- **AND** updates the status card with PR URL when returned

#### Scenario: Approve without token
- **GIVEN** the widget lost the approval token (page reload)
- **WHEN** the user clicks Approve
- **THEN** the widget SHALL NOT call approve until a new draft ChangeSet is created