# Assistant BYOK LLM Policy

ContextDrop assistant modes (**Ask**, **Build**) use organization-level Bring Your Own Key (BYOK) credentials resolved server-side via `ContextDrop::Agent::KeyStore`. End users never paste API keys into the widget.

## Must-have

| Requirement | Implementation |
|-------------|----------------|
| Server-side keys only | `ENV` (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY`, …) or encrypted vault at `tmp/context_drop_byok.enc` |
| Supported providers | Anthropic, OpenAI, Gemini, OpenAI-compatible (`custom`) |
| Tool calling | Required for Build; optional for Ask when RAG tools are registered |
| Vision | Pass screenshot attachments on turns when present |
| Fail-closed | `assistant.llm_configured: false` in widget config; Ask/Build turns return `422` |
| Rate limits | Reuse `config.rate_limit` on assistant endpoints; default 20/hour per session |
| Audit | `context_drop_assistant_turns` logs mode, provider, model, tool names, `change_set_id` (no prompt bodies) |
| Model policy | `config.assistant_models` per mode (`ask`, `build`) |

## Should-have

- PII redaction via `MetadataSanitizer` on element references before LLM
- Shorter HTTP timeouts for Ask (45s read) vs Build (90s)
- Max tool iterations: Ask 4, Build 8 (configurable)

## Must-not

- Browser `localStorage` / cookies for API keys on assistant paths
- Embedding MCP API keys or `ownership_token` values in LLM prompts

## Enabling

```ruby
# config/initializers/context_drop.rb
ENV["ANTHROPIC_API_KEY"] = "..." # preferred for production Ask

ContextDrop.configure do |c|
  c.assistant_enabled = true
  c.assistant_models = { ask: "claude-3-5-haiku-latest", build: "claude-sonnet-4-20250514" }
end
```

Feedback mode does **not** require BYOK.