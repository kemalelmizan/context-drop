# Security Operations Specification

## Purpose
Operator-facing traceability artifacts that link normative security requirements to code and tests.

## Requirements

### Requirement: Security Review Checklist
The project SHALL maintain `docs/security/REVIEW_CHECKLIST.md` as an operator-facing release gate aligned with `security-hardening` and `assistant-security` requirements.

#### Scenario: Pre-production assistant enablement
- **WHEN** a host enables `assistant_enabled` on production
- **THEN** operators complete checklist sections 1, 4, and 8 before go-live

### Requirement: Security Coverage Matrix
The project SHALL maintain `docs/security/COVERAGE_MATRIX.md` mapping each checklist requirement ID to concrete implementation paths, tests, status, and owner (Gem/Host/Op).

#### Scenario: Traceability audit
- **WHEN** App Sec reviews SEC-A004 (Ask tool denylist)
- **THEN** the matrix points to `lib/context_drop/assistant/tool_registry.rb` and `assistant_security_spec.rb`