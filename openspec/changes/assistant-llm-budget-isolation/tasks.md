# Tasks: Assistant vs. Local Agent LLM Isolation

- [x] 1.1 Extend `Configuration` and `Agent::KeyStore` with `assistant_key_store_path`, `CONTEXT_DROP_ASSISTANT_*` env keys, and `assistant_allow_shared_key_store`
- [x] 1.2 Enforce `assistant_allow_client_model_override` (default `false`) and `assistant_allowed_models` in `AssistantController` and `Assistant::Orchestrator`
- [x] 1.3 Wire `assistant_timeouts` (`45s` Ask / `90s` Build), `assistant_max_iterations`, and isolated `assistant_rate_limit` bucket
- [x] 1.4 Fix `FeedbackConfirmation.render_guidance` RNG and add specs for guidance, model override blocking, isolated vault/env keys, timeouts, and assistant rate limits
