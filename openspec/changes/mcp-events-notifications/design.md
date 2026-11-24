# Design: MCP Events & Notification Destinations

## Event pipeline
1. Feedback lifecycle hooks (`create`, `update`, `soft_delete`, dashboard status change) call `ContextDrop::FeedbackEvents::Publisher` (Rails) or `publishFeedbackEvent` (TypeScript).
2. Each publish persists an `EventOccurrence` with minimal triage payload (IDs, environment, status, page URL, optional dashboard URL).
3. Matching **notification destinations** (Lark / HTTPS webhook) and active **MCP `events/subscribe` registrations** receive signed outbound deliveries.
4. In-memory **SSE push** subscribers on `GET /mcp/events/stream` receive the same payload shape as poll/webhook.

## Storage
| Surface | Events & destinations |
|---|---|
| Rails engine | `context_drop_event_occurrences`, `context_drop_notification_destinations`, `context_drop_mcp_event_subscriptions` |
| Node standalone | `<storageDir>/events-state.json` (+ encrypted secrets via AES-256-GCM) |

## Security
- Outbound webhooks: HTTPS only, private IP SSRF block, Standard Webhooks HMAC headers when a signing secret is configured.
- Lark app secrets and webhook signing secrets encrypted at rest; dashboard masks values in forms.
- MCP event payloads are untrusted (same treatment as tool results).

## Parity notes
- Rails hosts use the ERB dashboard at `/context_drop/dashboard/integrations`.
- Next.js / standalone hosts configure destinations via REST (`CONTEXT_DROP_INTEGRATIONS_API_KEY` or `config.integrations.authorize`).