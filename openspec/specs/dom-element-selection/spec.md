# DOM Element Selection Specification

## Purpose
Defines the interactive DOM element picker mode, hover highlight overlay, click interception mechanics to protect host page interactions, multi-element selection flow, and point-in-time DOM metadata snapshot capture.

## Requirements

### Requirement: Interactive Element Selection Mode
When the user activates the DOM element selection control, ContextDrop SHALL enter selection mode, display a selection cursor and status banner, highlight hovered DOM elements with a visual bounding overlay, and remain in selection mode as elements are clicked until the user explicitly exits (`Escape` or `"Done"` button) or reaches `max_attachments`.

#### Scenario: Selecting multiple DOM elements in one selection session
- **GIVEN** the user clicks the DOM element selection button in the composer
- **WHEN** the user hovers over `button#checkout-button` and clicks it, then hovers over `div.cart-summary` and clicks it, and finally presses `Escape`
- **THEN** both `button#checkout-button` and `div.cart-summary` are added as separate `element` attachments in the composer
- **AND** selection mode exits and restores the composer view

### Requirement: Host Click Handler Suppression During Selection
While in element selection mode, ContextDrop SHALL intercept pointer and click events in the capture phase (`preventDefault`, `stopPropagation`, `stopImmediatePropagation`) so clicking links, submit buttons, or interactive components on the host page never triggers the host application's navigation or click handlers.

#### Scenario: Clicking a submit button or anchor link in selection mode
- **GIVEN** the user is in DOM element selection mode on a page containing `<a href="/logout">Log out</a>` and `<button type="submit">Pay Now</button>`
- **WHEN** the user clicks either element to attach it to feedback
- **THEN** the element is attached to the feedback composer
- **AND** the browser does not navigate to `/logout` or submit the form

### Requirement: Complex DOM Geometry & Container Support
The element selection and highlighting mechanism SHALL accurately resolve target elements and viewport-relative bounding boxes across nested DOM trees, accessible open Shadow DOM roots, `position: fixed` and `position: sticky` elements, scrollable containers, and dynamically rendered content, while ignoring ContextDrop's own widget elements.

#### Scenario: Selecting an element inside a scrolled overflow container
- **GIVEN** a scrollable `<div style="overflow-y: auto">` that has been scrolled down by `300px`
- **WHEN** the user hovers and clicks a child element inside that container
- **THEN** the highlight overlay aligns with the element's current visible position and `bounding_rect` records the accurate viewport-relative CSS pixel coordinates (`getBoundingClientRect()`)

### Requirement: Point-in-Time Element Metadata Snapshot
Selecting a DOM element SHALL immediately capture a sanitized metadata snapshot containing `tag_name`, `selector`, `dom_path`, `text_content`, allowlisted `attributes`, `bounding_rect` (`x`, `y`, `width`, `height`), `viewport` (`width`, `height`), and `captured_at` ISO-8601 timestamp without assuming the selector is unique or that the element will persist in the DOM later.

#### Scenario: Dynamic element removed from DOM after selection
- **GIVEN** the user selects a dynamically rendered toast notification element in selection mode
- **WHEN** the toast notification disappears from the host DOM before the user clicks Submit
- **THEN** the feedback submission still includes the full element metadata snapshot captured at the moment of selection
