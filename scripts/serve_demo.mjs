#!/usr/bin/env node
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const demoHtmlPath = path.join(rootDir, "demo/index.html");
const widgetBundlePath = path.join(rootDir, "app/assets/javascripts/context_drop/context_drop.js");

const port = Number(process.env.PORT || 4173);
const host = process.env.HOST || "127.0.0.1";

const feedbacks = [
  {
    id: 41,
    qualified_id: "staging:41",
    environment: "staging",
    status: "new",
    message: "Floating promo ribbon overlaps Enterprise plan price on 1280px viewports.",
    page_url: "https://staging.meridian.example/fulfillment",
    primary_selector: "#promo-ribbon-overlay",
    element_references_count: 2,
    attachments_count: 1,
    created_at: new Date(Date.now() - 3600_000).toISOString()
  },
  {
    id: 108,
    qualified_id: "production:108",
    environment: "production",
    status: "new",
    message: "Customs Hold badge needs stronger contrast and clear SLA tooltip.",
    page_url: "https://app.meridian.example/fulfillment",
    primary_selector: "#status-badge-8841",
    element_references_count: 1,
    attachments_count: 0,
    created_at: new Date(Date.now() - 7200_000).toISOString()
  }
];

const demoVault = {
  active_provider: "anthropic",
  keys: {}
};

const demoEdits = new Map();

function buildProvidersStatus() {
  const defs = [
    {
      id: "anthropic",
      label: "Anthropic Claude",
      envVar: "ANTHROPIC_API_KEY",
      defaultModel: "claude-sonnet-4-20250514",
      models: ["claude-sonnet-4-20250514", "claude-3-7-sonnet-latest", "claude-3-5-haiku-latest"],
      supportsBaseUrl: false
    },
    {
      id: "gemini",
      label: "Google Gemini",
      envVar: "GEMINI_API_KEY",
      defaultModel: "gemini-2.5-pro",
      models: ["gemini-2.5-pro", "gemini-2.5-flash"],
      supportsBaseUrl: false
    },
    {
      id: "openai",
      label: "OpenAI",
      envVar: "OPENAI_API_KEY",
      defaultModel: "gpt-4.1",
      models: ["gpt-4.1", "gpt-4.1-mini", "o4-mini"],
      supportsBaseUrl: false
    },
    {
      id: "custom",
      label: "OpenAI-Compatible (OpenRouter / Ollama)",
      envVar: "CONTEXT_DROP_LLM_API_KEY",
      defaultModel: "anthropic/claude-sonnet-4",
      models: ["anthropic/claude-sonnet-4", "google/gemini-2.5-pro", "llama3.3"],
      supportsBaseUrl: true,
      defaultBaseUrl: "https://openrouter.ai/api/v1"
    }
  ];

  const providers = defs.map((d) => {
    const saved = demoVault.keys[d.id] || {};
    const envVal = (process.env[d.envVar] || "").trim();
    const rawKey = saved.api_key || envVal;
    const source = saved.api_key ? "vault" : envVal ? "env" : "local_no_key";
    return {
      id: d.id,
      label: d.label,
      configured: true,
      source,
      env_var_hint: d.envVar,
      masked_key: rawKey ? `••••${rawKey.slice(-4)}` : "demo-sim",
      model: saved.model || d.defaultModel,
      default_model: d.defaultModel,
      models: d.models,
      supports_base_url: d.supportsBaseUrl,
      base_url: d.supportsBaseUrl ? saved.base_url || d.defaultBaseUrl : null
    };
  });

  return {
    active_provider: demoVault.active_provider,
    providers
  };
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(raw || "{}"));
      } catch (err) {
        reject(err);
      }
    });
  });
}

function sendJson(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data));
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${host}:${port}`);

  if (
    req.method === "GET" &&
    (url.pathname === "/" || url.pathname === "/demo" || url.pathname === "/demo/index.html")
  ) {
    const html = fs.readFileSync(demoHtmlPath, "utf8");
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(html);
    return;
  }

  if (
    req.method === "GET" &&
    (url.pathname === "/app/assets/javascripts/context_drop/context_drop.js" ||
      url.pathname === "/assets/context_drop.js" ||
      url.pathname === "/context_drop/assets/context_drop.js")
  ) {
    const js = fs.readFileSync(widgetBundlePath, "utf8");
    res.writeHead(200, { "Content-Type": "application/javascript; charset=utf-8" });
    res.end(js);
    return;
  }

  if (req.method === "GET" && url.pathname === "/context_drop/health") {
    sendJson(res, 200, {
      status: "ok",
      version: "0.2.0",
      environment: "development",
      feedbacks_count: feedbacks.length
    });
    return;
  }

  if (req.method === "GET" && url.pathname === "/context_drop/config") {
    sendJson(res, 200, {
      enabled: true,
      environment: "development",
      position: "top_left",
      placeholder: "Describe what feels off with the pinned elements...",
      csrf_token: "demo_csrf_token_test",
      agent: {
        enabled: true
      },
      features: {
        element_selection: true,
        selection_mode: "verbose",
        screenshot_capture: true,
        element_capture_padding: 16,
        smart_capture_padding: 84
      }
    });
    return;
  }

  if (req.method === "GET" && url.pathname === "/context_drop/agent/status") {
    const info = buildProvidersStatus();
    sendJson(res, 200, {
      enabled: true,
      environment: "development",
      workspace_name: "meridian-fulfillment",
      mcp_environments: [
        { name: "local", type: "local", host_env: "development" },
        { name: "staging", type: "remote_http", url: "https://staging.meridian.example/context_drop/mcp" },
        { name: "production", type: "remote_http", url: "https://app.meridian.example/context_drop/mcp" }
      ],
      ...info
    });
    return;
  }

  if (req.method === "POST" && url.pathname === "/context_drop/agent/keys") {
    try {
      const body = await readJsonBody(req);
      const prov = String(body.provider || "anthropic");
      demoVault.keys[prov] = {
        ...(demoVault.keys[prov] || {}),
        ...(body.api_key ? { api_key: String(body.api_key) } : {}),
        ...(body.model ? { model: String(body.model) } : {}),
        ...(body.base_url !== undefined ? { base_url: String(body.base_url) } : {})
      };
      if (body.make_active !== false) {
        demoVault.active_provider = prov;
      }
      sendJson(res, 200, buildProvidersStatus());
    } catch {
      sendJson(res, 422, { error: "Invalid JSON payload" });
    }
    return;
  }

  if (req.method === "DELETE" && url.pathname === "/context_drop/agent/keys") {
    const prov = url.searchParams.get("provider") || "all";
    if (prov === "all") {
      demoVault.keys = {};
    } else if (demoVault.keys[prov]) {
      delete demoVault.keys[prov].api_key;
    }
    sendJson(res, 200, buildProvidersStatus());
    return;
  }

  if (req.method === "GET" && url.pathname === "/context_drop/agent/feedbacks") {
    const envFilter = url.searchParams.get("environment") || "all";
    const items =
      envFilter === "all"
        ? feedbacks
        : feedbacks.filter((f) => (envFilter === "local" ? f.environment === "development" || f.environment === "local" : f.environment === envFilter));
    sendJson(res, 200, {
      environment_filter: envFilter,
      total_count: items.length,
      environments_queried: ["local", "staging", "production"],
      feedbacks: items
    });
    return;
  }

  if (req.method === "POST" && url.pathname === "/context_drop/agent/chat") {
    try {
      const body = await readJsonBody(req);
      const pinned = Array.isArray(body.element_references) ? body.element_references : [];
      const primarySel = pinned[0]?.selector || "#promo-ribbon-overlay";
      const editId = `edit_demo_${Date.now()}`;
      const editRecord = {
        id: editId,
        path: "app/views/fulfillment/_enterprise_card.html.erb",
        summary: `Resolve overlap & spacing on ${primarySel}`,
        is_new_file: false,
        diff: [
          "@@ -14,5 +14,5 @@",
          '-<div class="floating-overlap-ribbon" id="promo-ribbon-overlay">',
          '+<div class="floating-overlap-ribbon is-docked" id="promo-ribbon-overlay">',
          "   Flash 20% Off",
          " </div>"
        ].join("\n"),
        added_lines: 1,
        removed_lines: 1,
        status: "pending",
        created_at: new Date().toISOString()
      };
      demoEdits.set(editId, editRecord);

      sendJson(res, 200, {
        reply: `I inspected \`${primarySel}\` across the workspace and cross-referenced open MCP feedbacks (\`staging:41\`, \`production:108\`).\n\n- Found template in \`app/views/fulfillment/_enterprise_card.html.erb\`\n- Staged a non-destructive diff below—click **Apply Change** to approve.`,
        provider: body.provider || demoVault.active_provider,
        model: body.model || "claude-sonnet-4-20250514",
        tool_calls: [
          { name: "search_code", summary: `Searched workspace for "${primarySel}" (2 hits)`, status: "ok" },
          { name: "read_file", summary: "Read app/views/fulfillment/_enterprise_card.html.erb (L1–36)", status: "ok" },
          { name: "propose_file_edit", summary: "Proposed diff for app/views/fulfillment/_enterprise_card.html.erb (+1 -1)", status: "ok" }
        ],
        proposed_edits: [editRecord]
      });
    } catch {
      sendJson(res, 422, { error: "Invalid chat payload" });
    }
    return;
  }

  const editMatch = url.pathname.match(/^\/context_drop\/agent\/edits\/([^/]+)\/(apply|reject|revert)$/);
  if (req.method === "POST" && editMatch) {
    const [, editId, action] = editMatch;
    const rec = demoEdits.get(decodeURIComponent(editId)) || {
      id: editId,
      path: "app/views/fulfillment/_enterprise_card.html.erb",
      summary: "Demo file edit",
      is_new_file: false,
      diff: "",
      added_lines: 1,
      removed_lines: 1,
      status: "pending",
      created_at: new Date().toISOString()
    };
    rec.status = action === "apply" ? "applied" : action === "reject" ? "rejected" : "reverted";
    demoEdits.set(rec.id, rec);
    sendJson(res, 200, { edit: rec });
    return;
  }

  if (req.method === "POST" && url.pathname === "/context_drop/feedback") {
    try {
      const parsed = await readJsonBody(req);
      const payload = parsed.feedback || parsed;
      const record = {
        id: feedbacks.length + 1,
        qualified_id: `local:${feedbacks.length + 1}`,
        environment: "local",
        status: "new",
        message: payload.message || "(Context drop)",
        page_url: payload.page_url || "/",
        primary_selector: payload.element_references?.[0]?.selector || null,
        attachments_count: Array.isArray(payload.attachments) ? payload.attachments.length : 0,
        element_references_count: Array.isArray(payload.element_references)
          ? payload.element_references.length
          : 0,
        created_at: new Date().toISOString(),
        payload
      };
      feedbacks.unshift(record);
      sendJson(res, 201, record);
    } catch {
      sendJson(res, 422, { error: "Invalid JSON payload" });
    }
    return;
  }

  res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
  res.end("Not Found");
});

server.listen(port, host, () => {
  console.log(`\nContextDrop v0.2 Interactive Demo running at: http://${host}:${port}`);
  console.log(`Or open directly in your browser: file://${demoHtmlPath}\n`);
});
