# Host Ask Pack — MCP Tools & Resources

Register tools with `ContextDrop.config.register_ask_tool`. These tools are the **only** host tools exposed during **Ask** mode.

## Recommended tools

| Tool | Required | Description |
|------|----------|-------------|
| `search_product_knowledge` | Recommended | FAQ/docs search; return citations |
| `resolve_page_context` | Recommended | Map `page_url` → `screen_id`, help slug |
| `list_known_issues` | Optional | Open feedback/issues on same page |

## Recommended resources (read via tool wrappers)

| URI | Content |
|-----|---------|
| `host://help/{screen_id}` | Markdown help |
| `host://page-manifest` | URL → feature map JSON |
| `host://policy/assistant` | Legal / product guardrails |

## Explicit denylist (must NOT register for Ask)

- `git_*`, `change_set_*`, `pull_request_*`
- `repo_read_file`, `repo_search` (unless `config.assistant_allow_code_tools_in_ask = true` for staff-only)
- `deploy_*`, `run_shell`, arbitrary SQL

## Example

```ruby
ContextDrop.configure do |c|
  c.register_ask_tool(
    name: "search_product_knowledge",
    description: "Search product FAQ",
    parameters: {
      type: "object",
      required: ["query"],
      properties: { query: { type: "string" } }
    }
  ) do |args|
    { results: MyHelp.search(args["query"]) }
  end
end
```