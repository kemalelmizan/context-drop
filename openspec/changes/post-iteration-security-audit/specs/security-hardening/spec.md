# Delta: ContextDrop Security Hardening (`post-iteration-security-audit`)

## MODIFIED Requirements

### Requirement: Attachment Download Scoping
Attachment bytes SHALL only be served for feedback the caller owns (submitter, token, or session match), with `Content-Security-Policy: default-src 'none'; sandbox`, `X-Content-Type-Options: nosniff`, and `Referrer-Policy: no-referrer` headers.

#### Scenario: Cross-user attachment URL
- **WHEN** user B requests user A's attachment id
- **THEN** `403 Forbidden`

### Requirement: Remote Federation HTTPS
`RemoteClient` (Ruby and TypeScript) SHALL require HTTPS for non-loopback MCP URLs, block private/link-local/metadata hosts, ignore `allow_insecure_http` in production, and refuse HTTP redirects (`redirect: "error"`) to prevent Bearer token leakage.

#### Scenario: http:// remote URL
- **THEN** connection refused or error at configuration/call time

#### Scenario: Metadata IP remote URL
- **WHEN** a remote MCP environment is configured with `https://169.254.169.254/mcp`
- **THEN** `RemoteClient` refuses the connection before sending `Authorization` headers
