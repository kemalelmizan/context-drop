## ADDED Requirements

### Requirement: Cross-Cutting Security Hardening Catalog
ContextDrop implementations SHALL comply with the requirements catalogued in `openspec/specs/security-hardening/spec.md`, covering widget, HTTP, MCP, notifications, local agent, assistant modes, and host git adapters.

#### Scenario: Enabling MCP and assistant together
- **GIVEN** a host enables `mcp_enabled` and `assistant_enabled`
- **WHEN** security review is performed
- **THEN** reviewers verify items in security-hardening spec for MCP Bearer auth, assistant rate limits, and Build approval tokens