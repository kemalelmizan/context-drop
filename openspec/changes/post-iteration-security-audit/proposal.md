# Proposal: Post-Iteration Security Audit & Hardening Fixes

## Why
Following iterative implementation of drift closures, assistant LLM budget isolation, Node assistant parity, and secret-logging guards, a full codebase security audit against `security-hardening` and `assistant-security` uncovered five defense-in-depth gaps across existing and newly integrated surfaces:

1. **Notification master key permissions & env resolution (`SEC-H009`, `SEC-H033`, `SEC-H064`):** `NotificationSecrets` (Ruby) and `src/notifications/secrets.ts` (Node) created fallback `notification.key` files without `0600` permissions and did not resolve `ENV["CONTEXT_DROP_SECRET_KEY"]`.
2. **View helper DOM metadata sanitization (`SEC-H013`, `SEC-H017`):** `WidgetHelper#context_drop_widget(metadata: ...)` serialized custom `metadata` into `data-metadata` HTML attributes before running `MetadataSanitizer.sanitize_feedback_metadata`.
3. **Remote MCP client redirect & private-IP SSRF hardening (`SEC-H038`):** `src/mcp/remote-client.ts` lacked `redirect: "error"` on `fetch`, and both Ruby and TypeScript remote MCP clients did not block private/link-local/metadata hosts or ignore `allow_insecure_http` in production.
4. **Local agent payload caps (`SEC-H029`):** `AgentController#chat` did not enforce `max_attachments` and `max_element_references` server-side caps.
5. **Attachment response headers (`SEC-H027`):** Attachment download responses lacked `Referrer-Policy: no-referrer` and `X-Content-Type-Options: nosniff` alongside their sandbox CSP.

## What Changes
- Enforce `0o600` file permissions and `CONTEXT_DROP_SECRET_KEY` / `CONTEXT_DROP_OWNERSHIP_SECRET` resolution in `NotificationSecrets` and `src/notifications/secrets.ts`.
- Sanitize `options[:metadata]` in `WidgetHelper#context_drop_widget` via `MetadataSanitizer.sanitize_feedback_metadata`.
- Harden `MCP::RemoteClient` (Ruby) and `RemoteMcpClient` (TS) with `redirect: "error"`, private/metadata IP blocking, and production enforcement against `allow_insecure_http`.
- Enforce `max_attachments` and `max_element_references` caps on `AgentController#chat`.
- Add `Referrer-Policy: no-referrer` and `X-Content-Type-Options: nosniff` on Rails and Node attachment preview responses.

## Impact
- Closes subtle file-permission, DOM-attribute, SSRF/redirect, DoS-cap, and referrer-leakage vectors without breaking existing host integrations.
