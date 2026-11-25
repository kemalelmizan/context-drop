# Design: Ask / Build / Feedback Assistant

## Architecture

- **AssistantOrchestrator** selects tools by mode (hard allowlist). Ask pack excludes all `git_*` / write tools.
- **Build write tools** run only after `ChangeSet#approve!` with server-issued approval token.
- **Host adapters** implement git/CI (see `docs/assistant/host-build-pack.md`); gem ships `NullBuildAdapter` that errors until configured.
- **BYOK**: `ContextDrop::Agent::KeyStore` on server; widget receives `assistant.llm_configured` only.

## Default mode matrix

| Rails env (resolved) | Default modes |
|---------------------|---------------|
| production | ask, feedback |
| staging, development, other | ask, build, feedback |

Overridable via `config.assistant_modes_by_environment`.

## Security

- `authorize_assistant_mode` per mode (defaults stricter for build).
- Build on production off unless host opts in.
- Git credentials stay inside host adapter; never passed to LLM.

## Local agent

Unchanged: loopback sidebar with workspace `propose_file_edit`. Build mode in composer uses ChangeSet + host git adapters (same as staging).