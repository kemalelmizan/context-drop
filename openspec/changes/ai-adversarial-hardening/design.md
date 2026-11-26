# Design: AI-Adversarial Security Hardening

## Architectural Decisions

1. **Defense Against Closed-Loop MCP Exfiltration (`AI-SEC-01`):**
   - MCP prompts (`investigate_feedback`) and tools (`get_feedback`) wrap all user-originated fields in `<untrusted_feedback_data>` blocks preceded by explicit instructions that untrusted data and screenshots must never override system/developer instructions, access credentials, or echo workspace secrets into comments.
   - `AddFeedbackComment` defaults `visibility` to `"internal"` (persisted in `comment.metadata["visibility"]`) and scrubs `body` via `SecretRedactor.scrub`. Submitter-facing `GET /feedback` (`FeedbacksController#serialize_own_feedback` and Node `serializeOwnFeedback`) omits `Agent` comments unless `visibility == "public"` or `expose_agent_comments_to_submitter` is explicitly enabled, while operator views (Dashboard & MCP `get_feedback`) retain full visibility.

2. **Shared Build Sandbox & Patch Target Policy (`AI-SEC-02`, `AI-SEC-05`):**
   - `ContextDrop::Assistant::SafeRepoReader` delegates path containment and secret denylisting to `ContextDrop::Agent::WorkspaceSandbox` (`File.realpath`, trailing `/` check, `256 KB` cap, binary check, `BLOCKED_RELATIVE_PATTERNS`) and adds recursive `allowed_globs` matching so generated Build packs (`context_drop_build.rb.tt`) are safe out of the box.
   - `ContextDrop::Assistant::PatchValidator` (and TS `validateChangeSetPatches`) enforces `<= 20` patches, `<= 256 KB` total patch bytes, normalized relative paths without `..`, and a denylist covering CI/CD workflows (`.github/**`, `.gitlab-ci*`, `Dockerfile*`, `Gemfile*`, `package.json`, `config/initializers/**`, secrets) unless matched by host policy, while `widget.ts` renders every patched file path on the approval card.

3. **Two-Layer Outbound SSRF & DNS Rebinding Protection (`AI-SEC-06`, `AI-SEC-09`):**
   - **Layer 1 (Static Validation on Save/Config):** Rejects non-HTTPS schemes (except explicit dev loopback opt-in), URL userinfo, private/loopback/link-local/CGNAT (`100.64.0.0/10`)/unspecified IP literals (including IPv4-mapped IPv6 `::ffff:...`), internal suffixes (`.localhost`, `.local`, `.internal`), and wildcard rebinding domains (`*.nip.io`, `*.sslip.io`, `*.xip.io`, embedded private IPv4 labels). For Lark `api_host`, additionally enforces an allowlist (`open.larksuite.com`, `open.feishu.cn`, plus `config.lark_allowed_hosts`).
   - **Layer 2 (Connect-Time DNS Resolution, IP Pinning & No Redirects):** Resolves A/AAAA records right before opening outbound HTTP connections, verifies every resolved IP is public, pins `Net::HTTP#ipaddr=` in Ruby so no second DNS lookup occurs, and sets `redirect: "error"` + strict timeouts in TypeScript `fetch`.

4. **Safe URI Schemes, Nonce CSP & Scoped ActiveStorage Pending Uploads (`AI-SEC-04`, `AI-SEC-10`, `AI-SEC-13`):**
   - `ContextDrop::UrlSafety` (and TS equivalents) restricts `page_url` to `http://`, `https://`, or single-slash relative paths (`/\A\/(?!\/)/`) under `2048` characters without control bytes. Dashboard views pair safe `href` helpers with a per-request CSP script nonce (`script-src 'self' 'nonce-...'`).
   - `AttachmentsController#create` signs pending blobs with `purpose: :context_drop_pending_upload` and `expires_in: 30.minutes`, and consumers reject unscoped or already-attached blobs.

5. **Asymmetric Bot Cost & Resource Controls (`AI-SEC-03`, `AI-SEC-07`, `AI-SEC-08`, `AI-SEC-11`, `AI-SEC-12`):**
   - `PostgresStorageAdapter` throws in production when no secret is configured and generates random ephemeral secrets in non-production.
   - Conversation arrays on `assistant/turn` and `agent/chat` enforce message count, per-message length, and cumulative character caps before entering multi-iteration LLM loops.
   - Node `handler.ts` ignores `X-Forwarded-For` / `X-Real-IP` unless `trustProxy` is opted in, bounds rate-limit maps, and prunes expired/excess pending blobs; Rails bounds rate-limit maps and MCP SSE `SizedQueue` subscribers.
