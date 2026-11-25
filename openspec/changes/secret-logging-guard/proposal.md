# Proposal: Central Secret-Logging Guard (`SEC-H069`)

## Why
`SEC-H069` in `openspec/specs/security-hardening/spec.md` requires that ContextDrop never print MCP Bearer tokens, ownership secrets/tokens, webhook signing secrets, Lark app secrets, ChangeSet approval tokens, or LLM API keys to Rails/Node logs or persisted error columns. Previously `COVERAGE_MATRIX.md` tracked `SEC-H069` as `Partial` because parameter filtering and exception/delivery message redaction were not centrally wired.

## What Changes
- **`ContextDrop::SecretRedactor` (`lib/context_drop/secret_redactor.rb`) & `redactSecretsFromText` (`src/notifications/secrets.ts`):** Centralized secret scrubber redacting configured `mcp_api_key` / `ownership_secret` values, `Bearer` tokens, `sk-*` / `sk-ant-*` / `AIza*` / `whsec_*` tokens, and query/parameter secret assignments (`ownership_token=`, `api_key=`, `approval_token=`, `signing_secret=`, `app_secret=`).
- **Rails `filter_parameters` Engine Initializer (`lib/context_drop/engine.rb`):** Automatically registers ContextDrop secret parameter keys (`:api_key`, `:app_secret`, `:signing_secret`, `:mcp_api_key`, `:ownership_secret`, `:ownership_token`, `:ownership_tokens`, `:approval_token`, `:secrets_ciphertext`) on `Rails.application.config.filter_parameters`.
- **Log & Delivery Error Scrubbing:** Scrub exception and HTTP error strings in `FeedbacksController`, `Notifications::Deliverer`, `NotificationDestination#record_delivery!`, `Agent::LlmClient`, `MCP::RemoteClient`, and Node `src/notifications/deliverer.ts` + `src/server/handler.ts`.

## Impact
- Upgrades `SEC-H069` from `Partial` to `Implemented` (`Gem+Op`) in `docs/security/COVERAGE_MATRIX.md`.
