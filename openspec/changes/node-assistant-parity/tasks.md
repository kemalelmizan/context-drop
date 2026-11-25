# Tasks: Standalone Node / Next.js Assistant Parity

- [x] 1.1 Implement `src/assistant/confirmations.ts`, `src/assistant/tools.ts`, `src/assistant/change-sets.ts`, `src/assistant/llm-client.ts`, and `src/assistant/orchestrator.ts`
- [x] 1.2 Wire `assistant` config, `POST /feedback` confirmation fields, `GET /config` assistant block, and `/assistant/*` routes in `src/server/types.ts` and `src/server/handler.ts`
- [x] 1.3 Export assistant types/helpers from `src/server/index.ts` and promote deltas to `openspec/specs/` (`security-hardening`, `assistant-api`, `http-ingestion-api`)
- [x] 1.4 Add comprehensive Next.js App Router tests covering Ask/Build/Feedback turns, BYOK isolation, Ask tool denylist, ChangeSet approval & staging ACL, and smart confirmations
