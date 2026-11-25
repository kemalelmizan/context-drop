# Delta: ContextDrop Security Hardening (`node-assistant-parity`)

## MODIFIED Requirements

### Requirement: Equivalent IDOR and Rate Limits
`@context-drop` HTTP handler SHALL implement own-feedback ownership checks, feedback confirmations, rate limiting, and `/assistant/*` security controls (mode allowlists, Ask tool denylist, Build write gating, HMAC ChangeSet `approval_token`, strict ChangeSet submitter/session ACL, and isolated assistant rate limits) consistent with Rails engine behavior.

#### Scenario: PATCH another user's feedback on Next.js route
- **THEN** `403 Forbidden`

#### Scenario: Build rejected on Next.js production default
- **GIVEN** `@context-drop` handler runs with `environment: "production"` and default assistant modes
- **WHEN** a client posts `mode: "build"` to `POST /assistant/turn`
- **THEN** the response status is `403 Forbidden`
