# Delta: ContextDrop Security Hardening (`assistant-llm-budget-isolation`)

## MODIFIED Requirements

### Requirement: Separate Assistant vs Agent Budget
The engine SHALL isolate assistant LLM execution from the local loopback agent via dedicated `CONTEXT_DROP_ASSISTANT_*` environment keys and `assistant_key_store_path` vault resolution (with optional `assistant_allow_shared_key_store` fallback), separate rate-limit buckets (`assistant_rate_limit`), per-mode read timeouts (`assistant_timeouts`), and server-enforced model selection (`assistant_allow_client_model_override = false` by default and optional `assistant_allowed_models`).

#### Scenario: Untrusted client model override ignored by default
- **GIVEN** `assistant_models` sets `{ ask: "claude-3-5-haiku-latest" }` and `assistant_allow_client_model_override` is `false`
- **WHEN** a browser client posts `mode: "ask"` with `model: "claude-opus-4"`
- **THEN** the orchestrator executes with `"claude-3-5-haiku-latest"`

#### Scenario: Strict assistant vault isolation
- **GIVEN** `assistant_allow_shared_key_store` is `false` and only `ANTHROPIC_API_KEY` (not `CONTEXT_DROP_ASSISTANT_ANTHROPIC_API_KEY` or assistant vault) is set
- **WHEN** a client posts an Ask turn
- **THEN** `assistant_llm_configured?` is `false` and the server responds with `422 Unprocessable Entity`
