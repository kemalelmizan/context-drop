# Proposal: Assistant vs. Local Agent LLM Isolation (`SEC-H053`)

## Why
`SEC-H053` in `docs/security/COVERAGE_MATRIX.md` and `docs/assistant/byok-policy.md` call for isolating public/staging widget assistant LLM credentials, model allowlists, HTTP timeouts, tool iteration caps, and rate-limit buckets from the developer-only loopback agent:

1. Previously, `Assistant::Orchestrator` unconditionally shared `Agent::KeyStore` without supporting dedicated assistant env vars or an isolated assistant vault.
2. `AssistantController#turn` forwarded untrusted browser `params[:provider]` and `params[:model]` directly to `Orchestrator`, allowing anonymous Ask callers to override `config.assistant_models[:ask]` with expensive frontier models.
3. `LlmClient` used a fixed 60s `READ_TIMEOUT` instead of per-mode timeouts (45s Ask, 90s Build), and assistant endpoints shared the exact same IP counter bucket as feedback submissions.
4. `FeedbackConfirmation.render_guidance` referenced an undefined helper (`deterministic_rng`) when `POST /assistant/turn` ran in `feedback` mode without `feedback_id`.

## What Changes
- **Dedicated Assistant Key Resolution:** `Agent::KeyStore` supports `scope: :assistant` checking `CONTEXT_DROP_ASSISTANT_*_API_KEY` env vars and `config.assistant_key_store_path` (`tmp/context_drop_assistant_byok.enc`) first, with configurable `config.assistant_allow_shared_key_store` (default `true` for backward compatibility; set `false` for strict vault/env separation).
- **Server-Authoritative Model Policy:** Add `config.assistant_allow_client_model_override` (default `false`) and `config.assistant_allowed_models`. Untrusted client `provider`/`model` parameters on `POST /assistant/turn` are ignored unless client overrides are enabled, and any disallowed model returns `422 Unprocessable Entity`.
- **Per-Mode Timeouts, Iterations & Rate-Limit Bucket:** Add `config.assistant_timeouts` (`{ ask: 45, build: 90 }`), `config.assistant_max_iterations` (`{ ask: 4, build: 8 }`), and `config.assistant_rate_limit` (isolated `assistant` cache namespace).
- **Feedback Guidance Fix:** Fix `FeedbackConfirmation.render_guidance` RNG selection so `mode: "feedback"` guidance turns succeed cleanly.

## Impact
- Upgrades `SEC-H053` to `Implemented` in `docs/security/COVERAGE_MATRIX.md`.
- Backward-compatible with existing `ENV["ANTHROPIC_API_KEY"]` setups while preventing client-side model escalation out of the box.
