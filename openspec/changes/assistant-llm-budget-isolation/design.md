# Design: Assistant vs. Local Agent LLM Isolation (`SEC-H053`)

## Credential & Vault Separation
- `ContextDrop.config.assistant_key_store` instantiates `Agent::KeyStore` with:
  - `store_path`: `config.resolved_assistant_key_store_path` (`tmp/context_drop_assistant_byok.enc` by default)
  - `scope: :assistant` (prioritizing `CONTEXT_DROP_ASSISTANT_ANTHROPIC_API_KEY`, `CONTEXT_DROP_ASSISTANT_GEMINI_API_KEY`, `CONTEXT_DROP_ASSISTANT_OPENAI_API_KEY`, `CONTEXT_DROP_ASSISTANT_LLM_API_KEY`, and `CONTEXT_DROP_ASSISTANT_LLM_BASE_URL`)
  - `allow_shared_fallback`: `config.assistant_allow_shared_key_store` (defaults to `true`; when `false`, shared agent keys/vault are ignored)

## Model Policy & Cost Containment
- `config.assistant_allow_client_model_override` defaults to `false`. When `false`, `AssistantController#turn` ignores `params[:provider]` and `params[:model]` so browser clients cannot escalate from configured `assistant_models` (e.g., Haiku) to higher-cost models.
- When `config.assistant_allowed_models` is configured (Array of model IDs or per-mode Hash `{ ask: [...], build: [...] }`), both client overrides (when enabled) and resolved credentials are checked against the allowlist, raising `ContextDrop::Error` (`422 Unprocessable Entity`) on mismatch.

## Timeouts, Iteration Caps & Rate Limiting
- `Agent::LlmClient.complete_step` accepts `read_timeout:` and forwards it to `Net::HTTP#read_timeout`.
- `Orchestrator` passes `config.resolved_assistant_timeout(mode)` (`45`s for `ask`, `90`s for `build`) and caps tool loops at `config.resolved_assistant_max_iterations(mode)` (`4` for `ask`, `8` for `build`).
- `ApplicationController#enforce_assistant_rate_limit!` tracks assistant requests under `context_drop:rate_limit:assistant:<ip>:<bucket>` using `config.effective_assistant_rate_limit` (`config.assistant_rate_limit` when set, otherwise `config.rate_limit`).
