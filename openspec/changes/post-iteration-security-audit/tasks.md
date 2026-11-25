# Tasks: Post-Iteration Security Audit & Hardening Fixes

- [x] 1.1 Harden `NotificationSecrets` and `src/notifications/secrets.ts` (`0o600` key mode + `CONTEXT_DROP_SECRET_KEY` resolution)
- [x] 1.2 Sanitize `options[:metadata]` in `WidgetHelper#context_drop_widget`
- [x] 1.3 Add `redirect: "error"`, private/metadata host SSRF checks, and production `allow_insecure_http` block to Ruby & TS `RemoteClient`
- [x] 1.4 Enforce `max_attachments` and `max_element_references` in `AgentController#chat` and add `Referrer-Policy: no-referrer` + `X-Content-Type-Options: nosniff` to attachment responses
- [x] 1.5 Add Ruby and TypeScript security regression tests and update `openspec/specs/`, `openspec/STATE.md`, and `docs/security/COVERAGE_MATRIX.md`
