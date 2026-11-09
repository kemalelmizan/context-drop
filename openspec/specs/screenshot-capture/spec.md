# Screenshot Capture Specification

## Purpose
Defines viewport-level and element-level screenshot capture operations, exclusion of ContextDrop's own UI during capture, metadata recording, and graceful fallback when browser capture APIs are restricted or unavailable.

## Requirements

### Requirement: Viewport Screenshot Capture
ContextDrop SHALL allow users to capture a screenshot of the currently visible browser viewport, temporarily hiding ContextDrop's own widget UI during rasterization and attaching the resulting image (`attachment_type: "screenshot"`, `capture_type: "viewport"`) to the composer.

#### Scenario: Capturing the current viewport from the composer
- **GIVEN** the user has opened the feedback composer on an application page
- **WHEN** the user activates the viewport screenshot control
- **THEN** ContextDrop hides its own floating UI, captures the visible viewport image, restores the composer UI, and adds the screenshot with a thumbnail preview and metadata (`capture_type: "viewport"`, `image_dimensions`, `viewport`, `captured_at`) to the attachment tray

### Requirement: Element-Scoped Screenshot Capture
ContextDrop SHALL support capturing a screenshot cropped to a selected DOM element's visible bounding rectangle (plus configurable surrounding context padding clamped to the viewport) and associating it with the element attachment when applicable.

#### Scenario: Capturing a screenshot of a selected DOM element
- **GIVEN** the user selects `#checkout-button` and triggers an element screenshot
- **WHEN** the capture completes
- **THEN** ContextDrop attaches a cropped screenshot image of `#checkout-button` (including configured context padding) with metadata setting `capture_type: "element"` and `element_attachment_ref` pointing to the `#checkout-button` element attachment

### Requirement: Independent Operation & Graceful Degradation
Screenshot capture SHALL work independently of DOM element attachment and MUST handle unsupported browser environments, strict Content Security Policy (CSP) restrictions, or canvas taint errors gracefully without crashing the widget or blocking text/element feedback submission.

#### Scenario: Screenshot capture fails due to browser or CSP restriction
- **GIVEN** a browser environment where canvas rasterization or screenshot capture throws a security error
- **WHEN** the user attempts to capture a screenshot
- **THEN** ContextDrop catches the error, displays a non-blocking explanation in the composer, and allows the user to continue submitting text feedback, uploaded images, and DOM element attachments
