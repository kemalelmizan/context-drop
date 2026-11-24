# Feedback Events & Notification Destinations Specification

## Purpose
Defines ContextDrop feedback lifecycle MCP Events (`io.modelcontextprotocol/events`), durable event occurrences for cursor replay, dashboard-configurable notification destinations (Lark message cards and signed HTTPS webhooks), and the standalone Node integrations API for `@context-drop` deployments.

## Requirements

### Requirement: Feedback Lifecycle Event Names
ContextDrop SHALL emit MCP Events for the following event types when feedback is created, updated (without status transition), status-changed, or soft-deleted: `feedback.created`, `feedback.updated`, `feedback.status_changed`, and `feedback.deleted`.

#### Scenario: New widget submission emits feedback.created
- **GIVEN** notifications are enabled and persistence is installed
- **WHEN** a client successfully `POST`s a new feedback record
- **THEN** the server persists an event occurrence named `feedback.created` with `feedback_id`, `environment`, `status`, and `page_url` in the payload
- **AND** matching enabled notification destinations receive an outbound delivery

### Requirement: MCP Events Discovery (`events/list`)
The MCP server SHALL advertise the `io.modelcontextprotocol/events` extension in `initialize` capabilities and SHALL implement `events/list` returning each event type with `inputSchema`, `payloadSchema`, and supported `delivery` modes (`poll`, `push`, `webhook`).

#### Scenario: IDE discovers feedback event types
- **GIVEN** an authenticated MCP client calls `initialize`
- **WHEN** the client invokes `events/list`
- **THEN** the response includes all four feedback lifecycle event types with `delivery` containing `poll`, `push`, and `webhook`

### Requirement: MCP Events Poll Delivery (`events/poll`)
The MCP server SHALL implement `events/poll` with opaque cursor replay from durable event occurrences, returning `{ events, cursor, nextPollMs, truncated }`.

#### Scenario: Client polls after missing a disconnect
- **GIVEN** event `#99` was the last occurrence received at cursor `"98"`
- **WHEN** the client calls `events/poll` with `cursor: "98"`
- **THEN** occurrences with `id > 98` are returned in chronological order
- **AND** the response `cursor` advances to the last delivered occurrence

### Requirement: MCP Events Webhook Subscribe (`events/subscribe` / `events/unsubscribe`)
The MCP server SHALL implement `events/subscribe` to register HTTPS callback URLs with a signing secret and TTL, delivering subsequent matching occurrences via signed POST requests; `events/unsubscribe` SHALL remove a subscription by `subscriptionId`.

#### Scenario: Agent registers a webhook subscription for new feedback
- **GIVEN** a client calls `events/subscribe` with `name: "feedback.created"` and an `https://` callback URL
- **WHEN** a new feedback record is created afterward
- **THEN** the server POSTs the occurrence JSON to the callback with Standard Webhooks signature headers

### Requirement: MCP Events Push Stream (`GET …/mcp/events/stream`)
When MCP HTTP is enabled, ContextDrop SHALL expose an SSE stream authenticated with the same Bearer token as `POST …/mcp`, emitting `mcp-event` frames for each persisted occurrence.

#### Scenario: Long-lived push client receives an event
- **GIVEN** a client holds `GET /context_drop/mcp/events/stream` open with a valid Bearer token
- **WHEN** `feedback.created` is published
- **THEN** the client receives an SSE event whose `data` JSON matches the poll/webhook occurrence payload

### Requirement: Dashboard Notification Destinations (Rails)
The Rails engine dashboard SHALL provide `GET/POST/PATCH/DELETE /context_drop/dashboard/integrations` to configure enabled notification destinations with encrypted Lark or webhook secrets, event type filters, and a **Test** action.

#### Scenario: Operator configures Lark for new feedback only
- **GIVEN** an authorized dashboard user opens Integrations
- **WHEN** they save a Lark destination with `feedback.created` selected and valid app credentials
- **THEN** subsequent new feedback submissions trigger a Lark interactive message card to the configured `receive_id`

### Requirement: Standalone Integrations REST API (Node)
The TypeScript `@context-drop` server handler SHALL expose `GET/POST /integrations/destinations` and `PATCH/DELETE /integrations/destinations/:id` protected by `config.integrations.authorize` or `CONTEXT_DROP_INTEGRATIONS_API_KEY` (falling back to the MCP API key).

#### Scenario: Next.js host registers a webhook destination via API
- **GIVEN** `CONTEXT_DROP_INTEGRATIONS_API_KEY` is configured
- **WHEN** an operator `POST`s a webhook destination with Bearer authorization
- **THEN** the destination is persisted in `<storageDir>/events-state.json` with encrypted secrets
- **AND** matching lifecycle events invoke the HTTPS callback