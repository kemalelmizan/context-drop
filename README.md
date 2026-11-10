# ContextDrop (`context_drop`)

**ContextDrop** is a self-hosted, open-source contextual feedback engine for Ruby on Rails applications (`Rails >= 7.1`, including `Rails 8+`).

It provides:
- **Mountable Rails Engine (`isolate_namespace ContextDrop`)** with three engine-owned database tables (`context_drop_feedbacks`, `context_drop_attachments`, `context_drop_element_references`).
- **Decoupled TypeScript Frontend Widget (`<context-drop-widget>`)** with **Shadow DOM** CSS isolation, a **draggable floating chatbox UI** with session message thread, a **pin-shaped selector in the top-left corner** (plus a freely draggable floating pin dock), a **minimize-to-compact-bar** mode during element pinning, **precision overlapping/cascading DOM element disambiguation** (scroll-wheel/arrow-key depth cycling, click-to-pick layer stack popover, and interactive DOM breadcrumb bar), and privacy-redacted viewport/element screenshot capture.
- **Self-Hosted Feedback Triage Dashboard (`/context_drop/dashboard/feedbacks`)** rendered inside your Rails application.
- **Built-in Model Context Protocol (MCP) Server** (`stdio` and Streamable HTTP) so developers and AI coding agents (Cursor, Claude Code, Antigravity, Windsurf, VS Code) can query feedback, inspect DOM selectors & multimodal screenshots, and resolve issues directly from their IDE.

> **Core Design Principle:**  
> **ContextDrop owns its domain. The host application owns its identity and infrastructure.**  
> ContextDrop works seamlessly whether your Rails app uses Devise, Sorcery, Authlogic, Rails 8 built-in authentication, or custom session logic.

---

## Requirements

- Ruby `>= 3.1`
- Ruby on Rails `>= 7.1` (`7.1`, `7.2`, `8.0+`)
- **Active Storage** configured in the host application (`bin/rails active_storage:install`)

---

## Installation

Add `context_drop` to your application's `Gemfile` and run the installer generator:

```bash
bundle add context_drop
bin/rails generate context_drop:install
bin/rails db:migrate
```

What `bin/rails generate context_drop:install` does:
1. Creates [`config/initializers/context_drop.rb`](file:///Users/kemal.elmizan/self/context-drop/lib/generators/context_drop/install/templates/initializer.rb.tt).
2. Mounts `mount ContextDrop::Engine => "/context_drop"` in `config/routes.rb`.
3. Copies engine-owned migrations (`context_drop_feedbacks`, `context_drop_element_references`, `context_drop_attachments`) into `db/migrate/`.
4. Verifies that Active Storage migrations are present.

### Rendering the Widget

Render the floating widget in your layout (`app/views/layouts/application.html.erb`) before `</body>`:

```erb
<%= context_drop_widget %>
```

You can also override widget options per page without mutating global configuration:

```erb
<%= context_drop_widget(
  position: :bottom_left,
  placeholder: "Spot an issue with checkout? Let us know...",
  metadata: { release: ENV["GIT_COMMIT_SHA"], feature_flag: "checkout_v2" }
) %>
```

Enable ContextDrop via environment variable:

```bash
export CONTEXT_DROP_ENABLED=true
```

---

## Configuration

Configure ContextDrop in `config/initializers/context_drop.rb`:

```ruby
ContextDrop.configure do |config|
  # Master switch (disables widget helper, dashboard, and HTTP ingestion endpoints when false)
  config.enabled = ENV.fetch("CONTEXT_DROP_ENABLED", "false") == "true"

  # Widget corner position: :bottom_right, :bottom_left, :top_right, :top_left
  config.position = :bottom_right

  # Allow unauthenticated visitors to submit feedback
  config.allow_anonymous = true

  # Polymorphic submitter attribution — return any ActiveRecord model (User, Employee, AdminUser) or nil
  config.current_submitter = ->(controller) { controller.try(:current_user) }

  # Authorization hooks
  config.authorize_submission = ->(_controller) { true }
  config.authorize_dashboard = ->(controller) { controller.try(:current_user)&.try(:admin?) || Rails.env.development? }

  # Limits & validation
  config.max_attachments = 10
  config.max_element_references = 10
  config.max_attachment_size = 10.megabytes
  config.allowed_content_types = %w[image/png image/jpeg image/webp image/gif]
  config.max_image_dimensions = [4096, 4096]

  # Additional CSS selectors to exclude from DOM selection and redact in screenshots
  config.excluded_selectors = [
    "[data-feedback-ignore]",
    "[data-feedback-sensitive]",
    "input[type='password']",
    "input[type='hidden']",
    "[autocomplete^='cc-']"
  ]

  # Optional callback invoked after feedback persistence
  config.on_feedback_created = ->(feedback) {
    Rails.logger.info("New ContextDrop Feedback ##{feedback.id} on #{feedback.page_url}")
  }

  # Model Context Protocol (MCP) Server settings
  config.mcp_enabled = ENV.fetch("CONTEXT_DROP_MCP_ENABLED", "false") == "true"
  config.mcp_api_key = ENV["CONTEXT_DROP_MCP_API_KEY"]
  config.authorize_mcp = nil
end
```

---

## Privacy & Redaction Attributes

ContextDrop enforces zero-trust DOM sanitization and pre-capture screenshot redaction:
- Add `data-feedback-ignore` or `data-feedback-sensitive` to any HTML container to prevent it (and all of its descendants) from being selected or captured in screenshots:
  ```html
  <div data-feedback-sensitive>
    <span>Account Balance: $42,100.00</span>
  </div>
  ```
- Password inputs (`input[type="password"]`), hidden inputs (`input[type="hidden"]`), and credit-card inputs (`[autocomplete^="cc-"]`) are automatically excluded.
- Form control `value` properties and raw `outerHTML` are **never** captured.

---

## Self-Hosted Feedback Dashboard

Visit `/context_drop/dashboard/feedbacks` in your application to:
- Filter feedback by workflow status (`new`, `reviewed`, `resolved`, `dismissed`), `page_url`, or free-text search query.
- Inspect full feedback details, submitter attribution, viewport metadata, `ElementReference` cards (`selector`, `dom_path`, `bounding_rect`, `attributes_snapshot`), and Active Storage screenshots.
- Transition feedback status (`Mark Reviewed`, `Mark Resolved`, `Dismiss`).

---

## Model Context Protocol (MCP) Server for IDEs

ContextDrop includes a built-in MCP server (`ContextDrop::MCP::Server`) exposing:
- **Tools:** `list_feedbacks`, `get_feedback` (with multimodal base64 `image` blocks), `get_feedback_attachment`, `update_feedback_status`
- **Resources:** `contextdrop://feedbacks/new`, `contextdrop://feedbacks/{id}`
- **Prompt:** `investigate_feedback`

### Option 1: Local `stdio` Transport (Zero-Config Local Development)

Add the following to your IDE's MCP configuration (`.cursor/mcp.json`, `.mcp.json` for Claude Code, Antigravity `mcp_config.json`, VS Code, or Windsurf):

```json
{
  "mcpServers": {
    "context-drop": {
      "command": "bin/rails",
      "args": ["context_drop:mcp"]
    }
  }
}
```

### Option 2: Remote Streamable HTTP Transport (Staging / Production)

1. Set `CONTEXT_DROP_MCP_ENABLED=true` and `CONTEXT_DROP_MCP_API_KEY=<your-secret-token>` on your server.
2. Configure your IDE to connect to `POST /context_drop/mcp`:

```json
{
  "mcpServers": {
    "context-drop-staging": {
      "url": "https://staging.example.com/context_drop/mcp",
      "headers": {
        "Authorization": "Bearer <your-secret-token>"
      }
    }
  }
}
```

---

## Development & Testing

```bash
# Build the decoupled TypeScript widget into app/assets/javascripts/context_drop/context_drop.js
npm run build

# Run frontend TypeScript tests
npm test

# Run backend Ruby specs
ruby spec/run_all.rb
```

## License

Released under the [MIT License](file:///Users/kemal.elmizan/self/context-drop/MIT-LICENSE).
