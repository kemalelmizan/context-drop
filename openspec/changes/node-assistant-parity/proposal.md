# Proposal: Standalone Node / Next.js Assistant Parity (`@context-drop`)

## Why
While `@context-drop` (`src/server/handler.ts`) already implements full parity with the Rails engine for feedback ingestion, own-feedback IDOR protection, comments, MCP HTTP/stdio, MCP Events, and encrypted webhook/Lark destinations, it did not yet expose the **Ask / Build / Feedback** widget assistant endpoints (`/assistant/*`) or return `confirmation_message` / `confirmation_metadata` on `POST /feedback`. Next.js and Node hosts mounting `<ContextDrop />` could not enable assistant modes without a Rails backend.

## What Changes
- **Feedback Confirmations (`src/assistant/confirmations.ts`):** Bring `FeedbackConfirmation` and `DomContextFormatter` to `@context-drop`, emitting `confirmation_message` and `confirmation_metadata` on `POST /feedback` (`201 Created`) with smart-mode selector suppression (`SEC-H019`, `SEC-H088`).
- **Assistant Tool Registry & ChangeSet Store (`src/assistant/tools.ts`, `src/assistant/change-sets.ts`):** Implement mode-separated Ask/Build registries with Ask forbidden-prefix validation (`SEC-A004`), Build write-tool gating (`SEC-A005`), HMAC-SHA256 `approval_token` verification (`SEC-A006`), strict polymorphic submitter + hashed `cd_session` ChangeSet ACL (`SEC-A007`), and prompt-free turn audit records (`SEC-A010`).
- **Server-Side Org BYOK LLM Client (`src/assistant/llm-client.ts`):** Zero-dependency Anthropic, Gemini, and OpenAI-compatible client with `CONTEXT_DROP_ASSISTANT_*` env priority, custom base URL HTTPS/SSRF validation (`SEC-H052`, `redirect: "error"`), and per-mode timeouts (`45s` Ask, `90s` Build).
- **HTTP Handler Routes (`src/server/handler.ts`, `src/server/types.ts`):** Expose `assistant` metadata in `GET /config`, plus `GET /assistant/status`, `POST /assistant/turn`, `GET /assistant/change_sets/:id`, and `POST /assistant/change_sets/:id/approve` with isolated assistant rate limiting and multimodal attachment validation.

## Impact
- Achieves full capability and security parity between the Rails engine and `@context-drop` Next.js App/Pages Router handlers (`SEC-H066`, `SEC-H067`, `SEC-A001`–`SEC-A011`).
