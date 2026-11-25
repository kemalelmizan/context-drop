# Proposal: Ask / Build / Feedback Assistant Modes

## Why

End users need product help (Ask), internal teams need PR-first vibe coding (Build), and everyone needs contextual feedback (Feedback) in one widget. Today feedback is one-way and the local BYOK agent is loopback-only; production cannot safely reuse that path.

## What Changes

- Three chat modes in the feedback composer: **Ask**, **Build**, **Feedback** (host-configurable per environment).
- Server-side **Assistant API** (`POST /context_drop/assistant/turn`) separate from the loopback Agent API.
- **ChangeSet** persistence for Build: propose → approve → git branch → PR → CI status (host adapters).
- **Host tool registry** for Ask and Build MCP-style tool packs (schemas + Ruby callables).
- Org **BYOK** via existing KeyStore; Ask/Build fail closed when LLM is not configured.
- Widget mode switcher, assistant message stream, and ChangeSet status card (“not on main yet”).

## Impact

- New engine migrations (`context_drop_change_sets`, `context_drop_assistant_turns`).
- Configuration: `assistant_modes`, `authorize_assistant_mode`, `build_target`, tool registration hooks.
- Documentation: BYOK policy and host MCP tool contracts under `docs/assistant/`.
- Optional OpenSpec capabilities: `assistant-api`, `assistant-widget`, `change-set-persistence`, `host-assistant-tools`.