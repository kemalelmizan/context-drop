# Assistant Widget Modes Specification

## Purpose
Defines Ask / Build / Feedback mode switcher and ChangeSet status UI in the feedback composer.

## Requirements

### Requirement: Composer Mode Switcher
The widget SHALL render mode tabs for enabled modes (`ask`, `build`, `feedback`) from `config.assistant.modes` and SHALL hide Build when `config.assistant.build.enabled` is false.

#### Scenario: Production default modes
- **GIVEN** `assistant.modes` is `["ask", "feedback"]`
- **WHEN** the composer opens
- **THEN** only Ask and Feedback tabs are visible

### Requirement: ChangeSet Status Card
When Build mode returns a ChangeSet, the widget SHALL display branch/PR state, copy that changes are **not on main**, and provide Approve and Refresh actions.

#### Scenario: Approve ChangeSet
- **GIVEN** a draft ChangeSet with diff preview
- **WHEN** the user clicks Approve
- **THEN** the widget calls `POST /assistant/change_sets/:id/approve`
- **AND** updates the status card with PR URL when returned