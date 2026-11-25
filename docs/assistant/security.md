# Assistant Security: Ask, Build, Feedback

## Threat model (browser-facing)

| Risk | Ask | Build | Feedback |
|------|-----|-------|----------|
| Anonymous LLM abuse | Rate limits + BYOK required | Stricter `authorize_assistant_mode` | No LLM |
| Tool injection → git write | N/A | Write tools only after ChangeSet approve + HMAC token | N/A |
| IDOR on feedback / ChangeSet | N/A | Session/submitter or ownership token | Ownership token on confirm |
| DOM/selector leak to users | Smart mode uses **friendly** LLM context only | Full context server-side; user sees PR UX | Confirmations hide selectors in smart mode |
| Host tool overreach | Ask denylist blocks `git_*`, `repo_*`, `deploy_*` | Host implements allowlisted git adapter | Fixed templates only |

## Controls implemented

1. **Mode allowlists** — `resolved_assistant_modes`; Build off on production by default.
2. **Separate tool registries** — Ask cannot register git/repo tools; Build write tools omitted from LLM until `allow_write: true` (executor only).
3. **ChangeSet approval** — `approval_token` required; compared with `ActiveSupport::SecurityUtils.secure_compare`.
4. **Feedback confirmation IDOR** — `feedback_id` + `OwnershipToken.valid?` or authenticated submitter match.
5. **Smart disclosure** — `DomContextFormatter` `:friendly` vs `:full` for production smart Ask/Build prompts.
6. **Audit** — `assistant_turns` stores mode and tool names, not prompts.

## Residual risks (host responsibility)

- **Weak `authorize_assistant_mode`** — default Build requires staff/admin/dev; tighten for your org.
- **Null Build adapter** — Approve still calls stubs until `config/context_drop/build.rb` is implemented.
- **Session-bound ChangeSets** — Same `session_id` can view draft; prefer authenticated submitter in multi-user staging.
- **Ask RAG tools** — Host must not return secrets or internal URLs in tool JSON echoed to the model.

## Recommendations

- Run Build only on staging with GitHub App credentials on the server, never in the browser.
- Set `config.assistant_modes_by_environment = { production: %i[ask feedback] }`.
- Customize `assistant_feedback_confirmations` for legal tone; avoid promising SLA unless true.