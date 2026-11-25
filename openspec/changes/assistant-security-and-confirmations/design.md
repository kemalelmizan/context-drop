# Design: Security Hardening & Feedback Confirmations (OpenSpec)

## Spec layout
- **`security-hardening`**: umbrella catalog (all subsystems).
- **`assistant-security`**: Ask/Build/Feedback-specific controls.
- **`assistant-feedback`**: templates, metadata shape, no-LLM feedback mode.
- **Updates**: `assistant-api`, `assistant-widget`, `http-ingestion-api`, pointer in `security-and-privacy`.

## Traceability
Ruby examples: `spec/context_drop/assistant_security_spec.rb` maps to assistant-security scenarios.

## Host obligations
Security-hardening explicitly marks git credentials, RAG sanitization, branch protection, and legal copy as **host** responsibilities where the gem cannot enforce alone.