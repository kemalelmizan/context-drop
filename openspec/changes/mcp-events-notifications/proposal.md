# Proposal: MCP Events, Dashboard Webhooks & Lark Notifications

## Why
Developers and unattended agents need to react when new feedback arrives without polling MCP tools on an interval. Operations teams also need configurable Lark or HTTPS webhook destinations without writing custom `on_feedback_created` glue in every host app.

## What Changes
- MCP Events extension (`io.modelcontextprotocol/events`) on the Rails and TypeScript MCP servers: `events/list`, `events/poll`, `events/subscribe`, `events/unsubscribe`, and `GET …/mcp/events/stream` push delivery.
- Durable feedback lifecycle events: `feedback.created`, `feedback.updated`, `feedback.status_changed`, `feedback.deleted`.
- Rails dashboard **Integrations** UI to configure Lark bots and signed HTTPS webhooks (encrypted credentials at rest).
- Standalone `@context-drop` HTTP API for notification destinations under `/integrations/destinations` (Bearer auth).

## Impact
- New engine migration for event occurrences, notification destinations, and MCP webhook subscriptions.
- HTTP ingestion and dashboard status updates emit events and trigger configured destinations.
- Node MCP stdio and Next.js route handlers gain event parity with the Rails engine.