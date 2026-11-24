# Tasks: MCP Events & Notifications

- [x] 1.1 Add Rails migration for event occurrences, notification destinations, and MCP webhook subscriptions.
- [x] 1.2 Implement `FeedbackEvents::Publisher`, notification deliverers (Lark + HTTPS), and MCP `Events` handler (`events/list`, `events/poll`, `events/subscribe`, `events/unsubscribe`).
- [x] 1.3 Add Rails dashboard Integrations UI and `GET /context_drop/mcp/events/stream` SSE push endpoint.
- [x] 1.4 Mirror MCP Events and notification pipeline in TypeScript (`LocalEventStore`, dispatcher handlers, handler routes).
- [x] 1.5 Document in OpenSpec and README; add Ruby and Node tests.