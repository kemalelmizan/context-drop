## ADDED Requirements

### Requirement: Recursive DOM Sanitization & Sensitive Element Exclusion
ContextDrop SHALL exclude password inputs (`input[type="password"]`), hidden inputs (`input[type="hidden"]`), sensitive payment/credential inputs (`[autocomplete^="cc-"]`), elements marked with `data-feedback-ignore` or `data-feedback-sensitive`, and any element matching `ContextDrop.config.excluded_selectors` from DOM selection and metadata capture, applying exclusions recursively to all descendant nodes and never capturing raw `outerHTML` or form control `value` properties.

#### Scenario: Attempting to select an element inside a `data-feedback-ignore` container
- **GIVEN** a page contains `<div data-feedback-ignore><span id="ssn">123-45-6789</span></div>`
- **WHEN** the user hovers over or clicks `<span id="ssn">` in DOM selection mode
- **THEN** ContextDrop ignores the element, does not highlight it, and prevents it from being attached

#### Scenario: Selecting a parent element that contains a sensitive descendant
- **GIVEN** a `<form id="profile-form">` contains both a `<label>Email</label>` and `<input type="password" value="s3cret!" />` or `<div data-feedback-sensitive>Secret Token</div>`
- **WHEN** the user selects `<form id="profile-form">`
- **THEN** the captured `text_content` and `attributes` of `#profile-form` omit all text and values from the password input and the `[data-feedback-sensitive]` descendant
- **AND** raw `outerHTML` is not included in the metadata payload

### Requirement: Pre-Capture Screenshot Redaction
Before capturing a viewport or element screenshot, ContextDrop SHALL redact all visible elements matching the default privacy exclusions (`[data-feedback-ignore]`, `[data-feedback-sensitive]`, `input[type="password"]`) and `ContextDrop.config.excluded_selectors` by masking their bounding boxes so sensitive content is not visible in the resulting screenshot image.

#### Scenario: Capturing a viewport screenshot containing a sensitive block
- **GIVEN** the viewport displays `<div data-feedback-ignore>Sensitive customer information</div>`
- **WHEN** the user captures a viewport screenshot
- **THEN** the bounding box of the `[data-feedback-ignore]` element is masked with an opaque redaction placeholder in the captured image

### Requirement: Server-Side Upload & Binary Validation
The backend SHALL validate all uploaded files on the server by inspecting binary magic bytes for allowed MIME types (`image/png`, `image/jpeg`, `image/webp`, `image/gif`), verifying matching file extensions, enforcing `config.max_attachment_size` and `config.max_image_dimensions`, and enforcing `config.max_attachments` per feedback submission without trusting client-provided `Content-Type` headers or filenames.

#### Scenario: Rejecting an executable or HTML file disguised with a `.png` extension
- **GIVEN** an attacker uploads an HTML or script payload named `exploit.png` with `Content-Type: image/png`
- **WHEN** the backend inspects the file's magic bytes on `POST /context_drop/attachments` or `POST /context_drop/feedback`
- **THEN** the backend detects the actual content type is not an allowed image MIME type and rejects the request with `422 Unprocessable Entity`

#### Scenario: Rejecting an oversized attachment
- **GIVEN** `ContextDrop.config.max_attachment_size` is `10.megabytes`
- **WHEN** a client uploads an `11 MB` PNG file
- **THEN** the backend rejects the upload with `422 Unprocessable Entity` (or `413 Payload Too Large`)

### Requirement: CSRF Protection, Rate Limiting & Retrieval Authorization
The engine SHALL enforce Rails CSRF token verification on all mutating HTTP requests, apply configurable rate limiting per IP/session on feedback and attachment endpoints, and prevent unauthorized public access to persisted feedback records and uploaded Active Storage attachments.

#### Scenario: Mutating request sent without a valid CSRF token
- **GIVEN** CSRF protection is active in the Rails environment
- **WHEN** a client sends `POST /context_drop/feedback` without a valid `X-CSRF-Token`
- **THEN** the request is rejected with `422 Unprocessable Entity` / `403 Forbidden`

#### Scenario: Client exceeds configured submission rate limit
- **GIVEN** `ContextDrop.config.rate_limit` allows at most `20` requests per hour per client IP
- **WHEN** the same client sends a 21st submission request within one hour
- **THEN** the engine responds with `429 Too Many Requests`
