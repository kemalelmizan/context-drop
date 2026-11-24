## ADDED Requirements

### Requirement: MCP Events Extension (`io.modelcontextprotocol/events`)
The MCP server (Rails `ContextDrop::MCP::Dispatcher` and TypeScript `ContextDropMcpDispatcher`) SHALL advertise the MCP Events extension in `initialize` capabilities and SHALL implement `events/list`, `events/poll`, `events/subscribe`, and `events/unsubscribe` for feedback lifecycle event types with `poll`, `push`, and `webhook` delivery modes.

#### Scenario: Polling new feedback events after IDE reconnect
- **GIVEN** feedback event persistence is installed and MCP is authenticated
- **WHEN** the client invokes `events/poll` with `{ "name": "feedback.created", "cursor": null }` after a new feedback is submitted
- **THEN** the response includes at least one occurrence with `feedback_id`, `environment`, `status`, and `page_url` in `data`

### Requirement: MCP Events Push Stream Endpoint
When remote HTTP MCP is enabled, ContextDrop SHALL expose an SSE MCP events stream authenticated with the same Bearer token as `POST …/mcp`.

#### Scenario: SSE client receives feedback.created
- **GIVEN** a client holds an authenticated SSE connection to the MCP events stream
- **WHEN** a widget submits new feedback
- **THEN** the client receives an SSE payload matching the `events/poll` occurrence schema