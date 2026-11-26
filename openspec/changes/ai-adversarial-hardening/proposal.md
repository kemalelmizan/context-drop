# Proposal: AI-Adversarial Security Hardening (`ai-adversarial-hardening`)

## Why

A comprehensive AI-adversarial security audit identified 13 attack vectors (`AI-SEC-01` through `AI-SEC-13`) that autonomous hacking agents, indirect text/vision prompt injectors, and automated cost-amplification bots could chain across ContextDrop's public widget surface, embedded org-BYOK Ask/Build assistant, developer IDE MCP plane, Triage Dashboard, and outbound notification/federation clients.

## What Changes

1. **Cross-Agent Prompt/Vision Fencing & Exfiltration Severing (`AI-SEC-01`):**
   - Wrap untrusted feedback text, selectors, URLs, and image attachments inside explicit `<untrusted_feedback_data>` envelopes with anti-injection directives in MCP `investigate_feedback` and `get_feedback` (Ruby & TypeScript).
   - Default `add_feedback_comment` MCP agent comments to internal visibility (`expose_agent_comments_to_submitter = false` unless explicitly marked `visibility: "public"` or opted in via config) and scrub comment bodies with `SecretRedactor`, severing the anonymous `ownership_token` exfiltration loop.
2. **Safe Build Repo Reader & Patch Guardrails (`AI-SEC-02`, `AI-SEC-05`):**
   - Introduce `ContextDrop::Assistant::SafeRepoReader` (enforcing `realpath` root jail, trailing-slash boundary, symlink rejection, `256 KB` cap, secret denylist, and `allowed_globs`) and update `context_drop_build.rb.tt` + `docs/assistant/host-build-pack.md`.
   - Introduce `ContextDrop::Assistant::PatchValidator` (and TypeScript `validateChangeSetPatches`) blocking path traversal, secret files, and CI/workflow/build-execution targets (`.github/**`, `Dockerfile*`, `Gemfile*`, `config/initializers/**`, etc.) in `propose_change_set`.
   - Fence `<untrusted_dom_context>`, strip control characters from `page_url` in prompts, display patched file paths in `widget.ts#renderChangeSetCard`, and require safe `http(s)` URLs on `ChangeSet#pr_url` and `preview_url`.
3. **Storage Secret Fail-Closed, Safe URI Schemes & Dashboard CSP (`AI-SEC-03`, `AI-SEC-04`, `AI-SEC-10`, `AI-SEC-13`):**
   - Remove the hardcoded default secret fallback in `PostgresStorageAdapter` (`postgres.ts`), failing closed in production when no secret is configured and using random per-instance keys in non-production.
   - Enforce safe URI schemes (`http://`, `https://`, or single-slash `/path`) on `Feedback#page_url` (Rails & Node), Dashboard external links, `Referer` navigation shortcuts, and Widget links, backed by a per-request nonce `Content-Security-Policy` on Dashboard HTML views.
   - Scope Rails `AttachmentsController` pending upload `signed_id`s with `purpose: :context_drop_pending_upload`, `expires_in: 30.minutes`, and unattached verification.
   - Enforce `Sec-Fetch-Site: cross-site` rejection on Rails mutating routes when cross-origin widget rules do not apply.
4. **Outbound DNS-Pinning SSRF Defense & Lark Card Hardening (`AI-SEC-06`, `AI-SEC-09`):**
   - Introduce `ContextDrop::SsrfGuard` (Ruby) and TypeScript DNS-validated outbound helpers blocking wildcard DNS rebinding domains (`nip.io`, `sslip.io`), private/CGNAT/link-local/metadata IPs, and HTTP redirects, pinning resolved IPs on Ruby `Net::HTTP` sockets.
   - Harden `LarkClient` (Ruby & TS) with `api_host` allowlist + SSRF validation, `lark_md` metacharacter escaping, safe `dashboard_url` validation, and optional canonical `public_base_url` configuration.
5. **LLM Token-Amplification Caps, Proxy Rate-Limit Hardening, Bounded Blobs/SSE & Screenshot Redaction (`AI-SEC-07`, `AI-SEC-08`, `AI-SEC-11`, `AI-SEC-12`):**
   - Enforce `assistant_max_messages`, `assistant_max_message_length`, and `assistant_max_total_message_chars` across Assistant and Local Agent endpoints (Ruby & TS).
   - Default `trustProxy` to `false` in Node `handler.ts` (using rightmost hop or custom resolver when enabled) and bound in-memory rate-limit maps (`10,000` max keys).
   - Enforce TTL/count pruning on Node pending upload blobs and bounded `SizedQueue` + max-subscriber caps + heartbeats on MCP SSE streams.
   - Traverse open `shadowRoot` subtrees in `screenshot.ts` and prevent painting `<textarea>` / `[contenteditable]` text onto screenshots.

## Impact

- **Capabilities affected:** `security-hardening`, `assistant-security`, `mcp-server`, `feedback-dashboard`, `feedback-events-notifications`, `screenshot-capture`.
- **Compatibility:** Additive configuration knobs with secure defaults; zero new runtime gem or npm dependencies.
