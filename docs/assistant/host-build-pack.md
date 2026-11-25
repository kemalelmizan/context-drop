# Host Build Pack — MCP Tools & Resources

Register tools with `ContextDrop.config.register_build_tool(definition, callable, write: false|true)`.

Write tools (`write: true`) execute **only** after the user approves a `ContextDrop::ChangeSet` in the widget.

## Required read tools

| Tool | Purpose |
|------|---------|
| `build_context_resolve` | `page_url` + pins → routes, allowed globs |
| `repo_read_file` | Path-allowlisted file read |
| `repo_search` | Scoped repository search |
| `build_status_get` | CI status for `change_set_id` |

## Required write tools

| Tool | Purpose |
|------|---------|
| `change_set_create` | Optional; gem creates AR record by default |
| `git_create_branch` | From `config.build_target[:default_base_branch]` |
| `git_apply_patches` | Commit patches; never target `main` directly |
| `git_push_branch` | Push feature branch |
| `pull_request_open` | Open PR with title/body |
| `change_set_abandon` | Close PR / delete branch |

## Optional tools

| Tool | Purpose |
|------|---------|
| `preview_environment_request` | Review app URL |
| `run_lint_on_branch` | Fast CI signal |
| `generate_patch_from_pins` | Host-specific pin → file mapping |

## Resources

| URI | Purpose |
|-----|---------|
| `host://build/policy` | Allowed paths, branch naming |
| `host://build/repo` | Default branch, remote, monorepo roots |
| `host://change_sets/{id}` | Branch, PR, checks, preview |

## Configuration

```ruby
ContextDrop.configure do |c|
  c.build_target = {
    environment: "staging",
    repo: "acme/web",
    default_base_branch: "main"
  }

  c.register_build_tool(..., write: false) { |args| ... }
  c.register_build_tool(..., write: true) { |args| ... }
end
```

See `lib/context_drop/assistant/adapters/null_build.rb` for stub handlers and `lib/generators/context_drop/install/templates/context_drop_build.rb.tt`.