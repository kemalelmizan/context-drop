# Frontend Widget & Prompt Composer Specification

## Purpose
Defines the frontend user experience, Shadow DOM style isolation, floating trigger button, prompt-style feedback composer, attachment chip management, keyboard accessibility, and responsive behavior of the ContextDrop browser widget.

## Requirements

### Requirement: Framework-Free Shadow DOM Isolation
The frontend widget SHALL be implemented in TypeScript using standard browser APIs and mounted inside a custom element (`<context-drop-widget>`) with an isolated Shadow DOM root so that host application styles do not bleed into the widget and widget styles never alter the host application's DOM or CSS.

#### Scenario: Rendering widget on a host page with aggressive CSS resets
- **GIVEN** a host Rails page that applies global CSS rules to `button`, `textarea`, and `div` elements
- **WHEN** `<context-drop-widget>` mounts on the page
- **THEN** all widget controls render inside its Shadow Root unaffected by the host CSS rules
- **AND** the host page's layout and computed styles remain completely unchanged

### Requirement: Floating Feedback Trigger Button
ContextDrop SHALL render a floating trigger button fixed to the configured viewport corner (`bottom_right` by default) that opens the feedback composer when activated and does not obstruct pointer interactions outside its bounding box.

#### Scenario: Opening and dismissing the composer via the floating button
- **GIVEN** the floating trigger button is rendered in the bottom-right corner of the viewport
- **WHEN** the user clicks the trigger button (or activates it with `Enter` / `Space`)
- **THEN** the prompt composer opens and focuses the multiline feedback input
- **AND** pressing `Escape` or clicking the close button dismisses the composer without submitting

### Requirement: Prompt-Style Feedback Composer
The feedback composer SHALL provide a multiline text input (with default placeholder `"What would you like to tell us?"`), an image upload control, a DOM element selection control, a screenshot capture control, and a submit action supporting text-only, attachment-only, or combined submissions.

#### Scenario: Composing and submitting feedback with keyboard shortcut
- **GIVEN** the feedback composer is open and the user has typed `"The save button is misaligned on mobile"`
- **WHEN** the user presses `Cmd+Enter` (macOS) or `Ctrl+Enter` (Windows/Linux) or clicks the Submit button
- **THEN** the composer disables the submit button during transit, sends the payload to `POST /context_drop/feedback`, displays a confirmation state upon `201 Created`, and resets the composer

### Requirement: Attachment Tray & Item Management
The composer SHALL represent each attached item (uploaded image, captured screenshot, or selected DOM element) as a distinct chip/card in an attachment tray displaying a visual preview or identifier, its attachment type badge (`Image`, `Screenshot`, or `Element`), and a remove action prior to submission.

#### Scenario: Reviewing and removing an attachment before submission
- **GIVEN** a user has attached one uploaded image, one viewport screenshot, and two DOM elements (`#header` and `#checkout-button`)
- **WHEN** the user clicks the remove button on the `#header` element attachment chip
- **THEN** `#header` is removed from the composer's attachment tray
- **AND** submitting the form sends only the uploaded image, the viewport screenshot, and `#checkout-button`

### Requirement: Keyboard Accessibility & Responsive Layout
All widget controls SHALL be operable via keyboard navigation (`Tab`, `Shift+Tab`, `Enter`, `Space`, `Escape`) with visible focus rings and ARIA labels, and the composer layout MUST adapt responsively to both desktop and mobile viewports.

#### Scenario: Navigating composer controls via keyboard only
- **GIVEN** the user opens the feedback composer using the keyboard
- **WHEN** the user presses `Tab` sequentially
- **THEN** focus moves logically through the multiline text input, attachment tray items, upload/element-picker/screenshot action buttons, and the submit/close controls

### Requirement: Inline Updating & Soft-Deleting Own Feedback
The widget composer SHALL load the current user's active feedbacks from `GET /feedback` on open (persisting signed ownership tokens in browser storage with an in-memory fallback) and render accessible inline **Edit** and **Delete** controls on each own feedback entry in the thread without full-screen modals or `window.confirm()`.

#### Scenario: Editing own feedback message and pinned context inline
- **GIVEN** a user has submitted feedback `#42` and clicks its `Edit feedback` button
- **WHEN** the user modifies the message text, adds or removes pinned DOM elements or attachments in the tray, and clicks `Save`
- **THEN** the widget sends `PATCH /feedback/42`, updates the entry in the thread with an `edited` indicator, exits edit mode, and dispatches `context-drop:update`

#### Scenario: Soft-deleting own feedback with inline confirmation
- **GIVEN** a user clicks `Delete feedback` on their feedback `#42`
- **WHEN** the inline confirmation bar (`Delete this feedback?`) appears and the user clicks `Delete`
- **THEN** the widget sends `DELETE /feedback/42`, removes `#42` from the widget thread, and dispatches `context-drop:delete`
