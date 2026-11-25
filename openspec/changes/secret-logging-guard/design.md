# Design: Central Secret-Logging Guard (`SEC-H069`)

## Defense Layers
1. **Rails Parameter Filtering (`ContextDrop::Engine`):** Appends `SecretRedactor::FILTERED_PARAMETER_KEYS` to `app.config.filter_parameters` during engine boot so ActionController request logs (`POST /agent/keys`, `POST /dashboard/integrations`, `POST /assistant/change_sets/:id/approve`, `GET .../attachments?ownership_token=...`) automatically replace secret values with `[FILTERED]`.
2. **Runtime String Scrubber (`SecretRedactor.scrub` / `redactSecretsFromText`):** Regex + literal-secret redactor applied before writing `Rails.logger` / `console.warn` / `console.error` entries, raising upstream `LlmError` / `RemoteError` messages, or persisting `NotificationDestination#last_delivery_error`.
