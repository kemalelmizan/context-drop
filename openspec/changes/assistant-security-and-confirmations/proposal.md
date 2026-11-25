# Proposal: Assistant Security Hardening & Feedback Confirmations

## Why
Ask/Build/Feedback assistant modes introduce LLM, git, and confirmation flows that must be specified with the same rigor as ingestion and MCP. Operators need a single security-hardening spec; product needs normative scenarios for feedback confirmations and assistant abuse cases.

## What Changes
- New capability spec: `openspec/specs/security-hardening/spec.md` (cross-cutting security requirements).
- Delta updates: `assistant-api`, `assistant-widget`, `http-ingestion-api`, `assistant-feedback`, `assistant-security`.
- Scenarios for `confirmation_message`, ownership-gated feedback lookup, ChangeSet approval tokens, smart DOM disclosure, and Ask tool denylist.

## Impact
- Documentation-only for host apps; normative targets for existing Rails/TS implementations.
- Test authors can map `spec/context_drop/assistant_security_spec.rb` to OpenSpec scenarios.