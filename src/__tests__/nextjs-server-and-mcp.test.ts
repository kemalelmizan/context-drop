import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { PassThrough, Readable } from "node:stream";
import { describe, it } from "node:test";
import type { IncomingMessage, ServerResponse } from "node:http";
import { loadEnvFilesIfPresent, runCli } from "../cli.ts";
import {
  ContextDropMcpDispatcher,
  runContextDropMcpStdio
} from "../mcp/index.ts";
import {
  createContextDropNextHandler,
  createContextDropPagesHandler,
  createLocalStorageAdapter,
  createMemoryStorageAdapter,
  createPostgresStorageAdapter,
  type BlobStorageAdapter,
  type PostgresQueryable
} from "../server/index.ts";

// Valid 1x1 transparent PNG (67 bytes)
const VALID_1X1_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
const VALID_1X1_PNG_BYTES = new Uint8Array(Buffer.from(VALID_1X1_PNG_BASE64, "base64"));

describe("Next.js Route Handlers, Sanitization, Validation & CORS", () => {
  it("handles GET /config, POST /attachments, and POST /feedback end-to-end in App Router", async () => {
    const storage = createMemoryStorageAdapter();
    let createdHookId: number | string | null = null;

    const { GET, POST } = createContextDropNextHandler({
      environment: "staging",
      storage,
      onFeedbackCreated: (fb) => {
        createdHookId = fb.id;
      }
    });

    // 1. GET /api/context-drop/config
    const cfgRes = await GET(new Request("http://localhost:3000/api/context-drop/config"));
    assert.equal(cfgRes.status, 200);
    const cfg = (await cfgRes.json()) as Record<string, unknown>;
    assert.equal(cfg["enabled"], true);
    assert.equal(cfg["environment"], "staging");
    assert.equal(
      (cfg["features"] as Record<string, unknown>)["selection_mode"],
      "verbose"
    );

    // 2. POST /api/context-drop/attachments (multipart upload)
    const form = new FormData();
    form.append(
      "file",
      new Blob([VALID_1X1_PNG_BYTES], { type: "image/png" }),
      "checkout-bug.png"
    );
    const uploadRes = await POST(
      new Request("http://localhost:3000/api/context-drop/attachments", {
        method: "POST",
        headers: { Origin: "http://localhost:3000" },
        body: form
      })
    );
    assert.equal(uploadRes.status, 201);
    const uploadJson = (await uploadRes.json()) as {
      signed_blob_id: string;
      dimensions: [number, number];
      content_type: string;
    };
    assert.ok(uploadJson.signed_blob_id.includes("."));
    assert.deepEqual(uploadJson.dimensions, [1, 1]);
    assert.equal(uploadJson.content_type, "image/png");

    // 3. POST /api/context-drop/feedback linking element_reference + signed_blob_id
    const fbRes = await POST(
      new Request("http://localhost:3000/api/context-drop/feedback", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "http://localhost:3000"
        },
        body: JSON.stringify({
          feedback: {
            message: "Checkout button clips on mobile Safari",
            page_url: "http://localhost:3000/checkout",
            user_agent: "Mozilla/5.0 Test",
            metadata: {
              plan: "pro",
              cookie: "should-be-stripped",
              authorization: "Bearer secret-stripped"
            },
            element_references: [
              {
                client_ref: "el_1",
                tag_name: "button",
                selector: "button[data-testid='pay-btn']",
                dom_path: "main > form > button",
                text_content: "  Pay   Now ",
                attributes_snapshot: {
                  "data-testid": "pay-btn",
                  onclick: "evil()",
                  value: "secret-val",
                  "aria-label": "Complete purchase"
                },
                bounding_rect: { x: 12.345, y: 200.1, width: 140, height: 44 }
              }
            ],
            attachments: [
              {
                attachment_type: "screenshot",
                filename: "checkout-bug.png",
                signed_blob_id: uploadJson.signed_blob_id,
                element_reference_ref: "el_1",
                metadata: { capture_scope: "element" }
              }
            ]
          }
        })
      })
    );

    assert.equal(fbRes.status, 201);
    const fbJson = (await fbRes.json()) as {
      id: number;
      environment: string;
      attachments_count: number;
      element_references_count: number;
    };
    assert.equal(fbJson.id, 1);
    assert.equal(fbJson.environment, "staging");
    assert.equal(fbJson.attachments_count, 1);
    assert.equal(fbJson.element_references_count, 1);
    assert.equal(createdHookId, 1);

    // Verify stored record stripped forbidden keys and linked attachment to element_reference
    const stored = await storage.getFeedback(1);
    assert.ok(stored);
    assert.equal(stored.metadata["plan"], "pro");
    assert.equal(stored.metadata["cookie"], undefined);
    assert.equal(stored.metadata["authorization"], undefined);
    assert.equal(stored.element_references[0]?.text_content, "Pay Now");
    assert.equal(stored.element_references[0]?.attributes_snapshot["onclick"], undefined);
    assert.equal(stored.element_references[0]?.attributes_snapshot["value"], undefined);
    assert.equal(
      stored.element_references[0]?.attributes_snapshot["aria-label"],
      "Complete purchase"
    );
    assert.equal(
      stored.attachments[0]?.element_reference_id,
      stored.element_references[0]?.id
    );
  });

  it("rejects sensitive DOM elements, disguised non-image uploads, and unauthorized cross-origin mutations", async () => {
    const storage = createMemoryStorageAdapter();
    const { POST, OPTIONS } = createContextDropNextHandler({
      environment: "production",
      storage,
      allowedOrigins: ["https://app.acme.com"]
    });

    // Reject sensitive password input element (422)
    const pwRes = await POST(
      new Request("https://api.acme.com/api/context-drop/feedback", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "https://app.acme.com"
        },
        body: JSON.stringify({
          feedback: {
            message: "Password field issue",
            page_url: "https://app.acme.com/login",
            element_references: [
              {
                client_ref: "pw_1",
                tag_name: "input",
                selector: "input#password",
                attributes_snapshot: { type: "password" }
              }
            ]
          }
        })
      })
    );
    assert.equal(pwRes.status, 422);
    assert.equal(pwRes.headers.get("Access-Control-Allow-Origin"), "https://app.acme.com");

    // Reject disguised text file uploaded as .png
    const fakeForm = new FormData();
    fakeForm.append(
      "file",
      new Blob(["not a real png binary"], { type: "image/png" }),
      "fake.png"
    );
    const fakeUploadRes = await POST(
      new Request("https://api.acme.com/api/context-drop/attachments", {
        method: "POST",
        headers: { Origin: "https://app.acme.com" },
        body: fakeForm
      })
    );
    assert.equal(fakeUploadRes.status, 422);

    // Reject untrusted cross-origin POST (403) and preflight OPTIONS (403)
    const evilPost = await POST(
      new Request("https://api.acme.com/api/context-drop/feedback", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "https://evil.example.org"
        },
        body: JSON.stringify({
          feedback: { message: "CSRF attempt", page_url: "https://app.acme.com" }
        })
      })
    );
    assert.equal(evilPost.status, 403);

    const evilOpt = await OPTIONS(
      new Request("https://api.acme.com/api/context-drop/feedback", {
        method: "OPTIONS",
        headers: { Origin: "https://evil.example.org" }
      })
    );
    assert.equal(evilOpt.status, 403);

    const goodOpt = await OPTIONS(
      new Request("https://api.acme.com/api/context-drop/feedback", {
        method: "OPTIONS",
        headers: { Origin: "https://app.acme.com" }
      })
    );
    assert.equal(goodOpt.status, 204);
    assert.equal(goodOpt.headers.get("Access-Control-Allow-Origin"), "https://app.acme.com");
  });

  it("supports Next.js Pages Router Node req/res handler", async () => {
    const storage = createMemoryStorageAdapter();
    const pagesHandler = createContextDropPagesHandler({
      environment: "production",
      storage
    });

    const bodyStr = JSON.stringify({
      feedback: {
        message: "Pages router submission",
        page_url: "http://localhost:3000/pricing",
        attachments: [
          {
            attachment_type: "screenshot",
            filename: "pricing.png",
            data_url: `data:image/png;base64,${VALID_1X1_PNG_BASE64}`
          }
        ]
      }
    });

    const mockReq = Object.assign(Readable.from([Buffer.from(bodyStr, "utf8")]), {
      method: "POST",
      url: "/api/context-drop/feedback",
      headers: {
        host: "localhost:3000",
        origin: "http://localhost:3000",
        "content-type": "application/json"
      }
    }) as unknown as IncomingMessage;

    let statusCode = 200;
    const resHeaders: Record<string, string> = {};
    const chunks: Buffer[] = [];

    const mockRes = {
      get statusCode() {
        return statusCode;
      },
      set statusCode(code: number) {
        statusCode = code;
      },
      setHeader(k: string, v: string) {
        resHeaders[k.toLowerCase()] = v;
      },
      end(buf?: Buffer) {
        if (buf) chunks.push(buf);
      }
    } as unknown as ServerResponse;

    await pagesHandler(mockReq, mockRes);
    assert.equal(statusCode, 201);
    const parsed = JSON.parse(Buffer.concat(chunks).toString("utf8")) as {
      id: number;
      environment: string;
      attachments_count: number;
    };
    assert.equal(parsed.id, 1);
    assert.equal(parsed.environment, "production");
    assert.equal(parsed.attachments_count, 1);
  });
});

describe("Pluggable Storage Adapters (Local SQLite, Local JSON, and Postgres)", () => {
  for (const backend of ["sqlite", "json"] as const) {
    it(`persists feedbacks, blobs, and status updates across instances in local '${backend}' mode`, async () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), `cd-local-${backend}-`));
      try {
        const writer = createLocalStorageAdapter({ dir: tmpDir, backend });
        assert.equal(fs.existsSync(path.join(tmpDir, ".gitignore")), true);

        const pending = await writer.savePendingBlob({
          data: VALID_1X1_PNG_BYTES,
          filename: "hero.png",
          content_type: "image/png",
          byte_size: VALID_1X1_PNG_BYTES.byteLength,
          dimensions: [1, 1]
        });

        // Consume and create feedback from a second adapter instance (simulating separate worker/MCP process)
        const reader = createLocalStorageAdapter({ dir: tmpDir, backend });
        const consumed = await reader.consumePendingBlob(pending.signed_blob_id);
        assert.ok(consumed);
        assert.equal(consumed.filename, "hero.png");

        const created = await reader.createFeedback({
          environment: "development",
          message: `Test feedback in ${backend}`,
          page_url: "http://localhost:3000/dashboard",
          user_agent: "NodeTest",
          session_id: "sess_1",
          submitter: { type: "User", id: 7, label: "kemal@elmizan.com" },
          metadata: { route: "/dashboard" },
          element_references: [
            {
              client_ref: "card_1",
              tag_name: "section",
              selector: "section.kpi-card",
              dom_path: "main > section.kpi-card",
              text_content: "Revenue",
              attributes_snapshot: { class: "kpi-card" },
              bounding_rect: { x: 10, y: 20, width: 300, height: 120 },
              viewport: { width: 1440, height: 900 },
              metadata: {},
              captured_at: new Date().toISOString()
            }
          ],
          attachments: [
            {
              attachment_type: "screenshot",
              element_client_ref: "card_1",
              filename: consumed.filename,
              content_type: consumed.content_type,
              byte_size: consumed.byte_size,
              data: consumed.data,
              metadata: {}
            }
          ]
        });

        const list = await writer.listFeedbacks({ query: "kpi-card" });
        assert.equal(list.total, 1);
        assert.equal(list.records[0]?.qualified_id, `development:${created.id}`);

        const att = await writer.getAttachment(created.attachments[0]!.id);
        assert.ok(att);
        assert.equal(att.element_selector, "section.kpi-card");
        assert.equal(att.data?.byteLength, VALID_1X1_PNG_BYTES.byteLength);

        const updated = await writer.updateFeedbackStatus(created.id, "resolved");
        assert.equal(updated?.previous_status, "new");
        assert.equal(updated?.feedback.status, "resolved");
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });
  }

  it("auto-migrates and executes parameterized queries via PostgresStorageAdapter + BlobStorageAdapter", async () => {
    const queriesExecuted: string[] = [];
    const externalBlobs = new Map<string, Uint8Array>();

    const mockBlobStore: BlobStorageAdapter = {
      async putBlob({ key, data }) {
        externalBlobs.set(key, new Uint8Array(data));
        return { key };
      },
      async getBlob(key) {
        return externalBlobs.get(key) ?? null;
      },
      async deleteBlob(key) {
        externalBlobs.delete(key);
      }
    };

    const rowsFeedbacks: Array<Record<string, unknown>> = [];
    const rowsElements: Array<Record<string, unknown>> = [];
    const rowsAttachments: Array<Record<string, unknown>> = [];

    const mockPool: PostgresQueryable = {
      async query(sql: string, values: unknown[] = []) {
        queriesExecuted.push(sql.trim());
        if (sql.includes("CREATE TABLE") || sql.includes("CREATE INDEX")) {
          return { rows: [] };
        }
        if (sql.includes("INSERT INTO context_drop_feedbacks")) {
          const row = {
            id: rowsFeedbacks.length + 1,
            environment: values[0],
            status: "new",
            message: values[1],
            page_url: values[2],
            user_agent: values[3],
            session_id: values[4],
            submitter: JSON.parse(String(values[5])),
            metadata: JSON.parse(String(values[6])),
            created_at: new Date(),
            updated_at: new Date()
          };
          rowsFeedbacks.push(row);
          return { rows: [row] };
        }
        if (sql.includes("INSERT INTO context_drop_element_references")) {
          const row = {
            id: rowsElements.length + 1,
            feedback_id: values[0],
            client_ref: values[1],
            tag_name: values[2],
            selector: values[3],
            dom_path: values[4],
            text_content: values[5],
            attributes_snapshot: JSON.parse(String(values[6])),
            bounding_rect: JSON.parse(String(values[7])),
            viewport: JSON.parse(String(values[8])),
            metadata: JSON.parse(String(values[9])),
            captured_at: String(values[10])
          };
          rowsElements.push(row);
          return { rows: [{ id: row.id }] };
        }
        if (sql.includes("INSERT INTO context_drop_attachments")) {
          const row = {
            id: rowsAttachments.length + 1,
            feedback_id: values[0],
            element_reference_id: values[1],
            attachment_type: values[2],
            filename: values[3],
            content_type: values[4],
            byte_size: values[5],
            blob_key: values[6],
            data: values[7],
            metadata: JSON.parse(String(values[8])),
            created_at: new Date()
          };
          rowsAttachments.push(row);
          return { rows: [row] };
        }
        if (sql.includes("FROM context_drop_element_references")) {
          return { rows: rowsElements.filter((e) => e["feedback_id"] === values[0]) };
        }
        if (sql.includes("FROM context_drop_attachments a")) {
          const found = rowsAttachments.find((a) => a["id"] === values[0]);
          if (!found) return { rows: [] };
          const el = rowsElements.find((e) => e["id"] === found["element_reference_id"]);
          return { rows: [{ ...found, element_selector: el?.["selector"] ?? null }] };
        }
        if (sql.includes("FROM context_drop_attachments")) {
          return { rows: rowsAttachments.filter((a) => a["feedback_id"] === values[0]) };
        }
        if (sql.includes("SELECT * FROM context_drop_feedbacks WHERE id = $1")) {
          const fb = rowsFeedbacks.find((f) => f["id"] === values[0]);
          return { rows: fb ? [fb] : [] };
        }
        return { rows: [] };
      }
    };

    const pgAdapter = createPostgresStorageAdapter({
      pool: mockPool,
      blobStore: mockBlobStore
    });

    const created = await pgAdapter.createFeedback({
      environment: "production",
      message: "Postgres + S3 blob store check",
      page_url: "https://acme.com/settings",
      user_agent: "Test",
      session_id: null,
      submitter: { label: "ops@acme.com" },
      metadata: {},
      element_references: [
        {
          client_ref: "btn_save",
          tag_name: "button",
          selector: "#save-btn",
          dom_path: "form > #save-btn",
          text_content: "Save",
          attributes_snapshot: { id: "save-btn" },
          bounding_rect: {},
          viewport: {},
          metadata: {},
          captured_at: new Date().toISOString()
        }
      ],
      attachments: [
        {
          attachment_type: "screenshot",
          element_client_ref: "btn_save",
          filename: "save.png",
          content_type: "image/png",
          byte_size: VALID_1X1_PNG_BYTES.byteLength,
          data: VALID_1X1_PNG_BYTES,
          metadata: {}
        }
      ]
    });

    assert.equal(created.id, 1);
    assert.equal(externalBlobs.size, 1);
    assert.ok(queriesExecuted.some((q) => q.includes("CREATE TABLE IF NOT EXISTS context_drop_feedbacks")));

    const att = await pgAdapter.getAttachment(1);
    assert.ok(att);
    assert.equal(att.element_selector, "#save-btn");
    assert.equal(att.data?.byteLength, VALID_1X1_PNG_BYTES.byteLength);
  });
});

describe("Unified Multi-Environment MCP Hub (Stdio + Remote HTTP Federation)", () => {
  it("federates local Next.js storage and remote HTTP /mcp endpoints with Bearer auth & multimodal screenshots", async () => {
    const localStorage = createMemoryStorageAdapter();
    const stagingStorage = createMemoryStorageAdapter();

    await localStorage.createFeedback({
      environment: "development",
      message: "Local header overlap",
      page_url: "http://localhost:3000/app",
      user_agent: "Chrome",
      session_id: null,
      submitter: {},
      metadata: {},
      element_references: [
        {
          client_ref: "h1",
          tag_name: "header",
          selector: "header.site-nav",
          dom_path: "body > header.site-nav",
          text_content: "Nav",
          attributes_snapshot: {},
          bounding_rect: {},
          viewport: {},
          metadata: {},
          captured_at: "2026-11-12T05:00:00.000Z"
        }
      ],
      attachments: []
    });

    await stagingStorage.createFeedback({
      environment: "staging",
      message: "Staging modal z-index bug",
      page_url: "https://staging.acme.com/billing",
      user_agent: "Safari",
      session_id: null,
      submitter: { label: "qa@acme.com" },
      metadata: {},
      element_references: [
        {
          client_ref: "m1",
          tag_name: "div",
          selector: "[data-testid='upgrade-modal']",
          dom_path: "body > div",
          text_content: "Upgrade Plan",
          attributes_snapshot: { "data-testid": "upgrade-modal" },
          bounding_rect: { x: 100, y: 80, width: 480, height: 320 },
          viewport: { width: 1280, height: 800 },
          metadata: {},
          captured_at: "2026-11-12T06:00:00.000Z"
        }
      ],
      attachments: [
        {
          attachment_type: "screenshot",
          element_client_ref: "m1",
          filename: "modal.png",
          content_type: "image/png",
          byte_size: VALID_1X1_PNG_BYTES.byteLength,
          data: VALID_1X1_PNG_BYTES,
          metadata: {}
        }
      ]
    });

    // Mount remote staging Next.js handler with MCP Bearer key
    const stagingNext = createContextDropNextHandler({
      environment: "staging",
      storage: stagingStorage,
      mcp: {
        enabled: true,
        apiKey: "staging-secret-token-999"
      }
    });

    // Verify unauthorized HTTP MCP calls return 401
    const unauthRes = await stagingNext.POST(
      new Request("https://staging.acme.com/api/context-drop/mcp", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer wrong-token"
        },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "ping" })
      })
    );
    assert.equal(unauthRes.status, 401);

    // Wire local hub dispatcher to talk to stagingNext.POST over simulated HTTPS transport
    const hub = new ContextDropMcpDispatcher({
      storage: localStorage,
      hostEnvironment: "development",
      environments: {
        staging: {
          url: "https://staging.acme.com/api/context-drop/mcp",
          apiKey: "staging-secret-token-999"
        }
      },
      remoteTransport: async (_envName, envCfg, method, params) => {
        const res = await stagingNext.POST(
          new Request(envCfg.url, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${envCfg.apiKey}`
            },
            body: JSON.stringify({ jsonrpc: "2.0", id: "rpc_1", method, params })
          })
        );
        assert.equal(res.status, 200);
        const json = (await res.json()) as { result: unknown };
        return json.result;
      }
    });

    // 1. list_environments with ping_remotes: true
    const envRpc = await hub.dispatch({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: "list_environments", arguments: { ping_remotes: true } }
    });
    assert.ok(envRpc && !Array.isArray(envRpc));
    const envPayload = JSON.parse(
      ((envRpc.result as { content: Array<{ text: string }> }).content[0]?.text) ?? "{}"
    ) as { environments: Array<{ name: string; reachable?: boolean }> };
    assert.equal(envPayload.environments.length, 2);
    assert.equal(
      envPayload.environments.find((e) => e.name === "staging")?.reachable,
      true
    );

    // 2. list_feedbacks across "all" environments
    const listRpc = await hub.dispatch({
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: { name: "list_feedbacks", arguments: { environment: "all" } }
    });
    assert.ok(listRpc && !Array.isArray(listRpc));
    const listPayload = JSON.parse(
      ((listRpc.result as { content: Array<{ text: string }> }).content[0]?.text) ?? "{}"
    ) as { total: number; feedbacks: Array<{ qualified_id: string }> };
    assert.equal(listPayload.total, 2);
    const qualifiedIds = listPayload.feedbacks.map((f) => f.qualified_id);
    assert.ok(qualifiedIds.includes("staging:1"));
    assert.ok(qualifiedIds.includes("development:1"));

    // 3. get_feedback("staging:1") returns JSON text + multimodal image block
    const getRpc = await hub.dispatch({
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: { name: "get_feedback", arguments: { id: "staging:1" } }
    });
    assert.ok(getRpc && !Array.isArray(getRpc));
    const getBlocks = (getRpc.result as { content: Array<{ type: string; data?: string }> })
      .content;
    assert.equal(getBlocks.length, 2);
    assert.equal(getBlocks[0]?.type, "text");
    assert.equal(getBlocks[1]?.type, "image");
    assert.equal(getBlocks[1]?.data, VALID_1X1_PNG_BASE64);

    // 4. investigate_feedback prompt includes Next.js guidance + screenshot block
    const promptRpc = await hub.dispatch({
      jsonrpc: "2.0",
      id: 4,
      method: "prompts/get",
      params: { name: "investigate_feedback", arguments: { feedback_id: "staging:1" } }
    });
    assert.ok(promptRpc && !Array.isArray(promptRpc));
    const promptMessages = (
      promptRpc.result as {
        messages: Array<{ content: Array<{ type: string; text?: string }> }>;
      }
    ).messages;
    assert.ok(promptMessages[0]?.content[0]?.text?.includes("app/**/page.tsx"));
    assert.equal(promptMessages[0]?.content[1]?.type, "image");

    // 5. update_feedback_status("staging:1", "resolved") transitions remote record
    const updateRpc = await hub.dispatch({
      jsonrpc: "2.0",
      id: 5,
      method: "tools/call",
      params: {
        name: "update_feedback_status",
        arguments: { id: "staging:1", status: "resolved" }
      }
    });
    assert.ok(updateRpc && !Array.isArray(updateRpc));
    const stagingAfter = await stagingStorage.getFeedback(1);
    assert.equal(stagingAfter?.status, "resolved");
  });

  it("streams newline-delimited JSON-RPC over stdio", async () => {
    const storage = createMemoryStorageAdapter();
    const input = new PassThrough();
    const output = new PassThrough();
    const lines: string[] = [];
    output.on("data", (chunk) => {
      lines.push(chunk.toString("utf8"));
    });

    const runnerPromise = runContextDropMcpStdio({
      storage,
      hostEnvironment: "development",
      input,
      output
    });

    input.write(
      `${JSON.stringify({ jsonrpc: "2.0", id: 10, method: "initialize", params: {} })}\n`
    );
    input.write(`${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" })}\n`);
    input.write(`${JSON.stringify({ jsonrpc: "2.0", id: 11, method: "tools/list" })}\n`);
    input.end();

    await runnerPromise;

    const parsedResponses = lines
      .join("")
      .trim()
      .split("\n")
      .map((l) => JSON.parse(l) as { id: number; result: Record<string, unknown> });

    assert.equal(parsedResponses.length, 2);
    assert.equal(parsedResponses[0]?.id, 10);
    assert.equal(parsedResponses[1]?.id, 11);
    assert.equal((parsedResponses[1]?.result["tools"] as unknown[]).length, 5);
  });
});

describe("CLI init, .env.local loader, and compiled dist subpath exports", () => {
  it("scaffolds Next.js App Router route.ts and updates .gitignore via CLI init", async () => {
    const tmpProject = fs.mkdtempSync(path.join(os.tmpdir(), "cd-cli-init-"));
    const prevCwd = process.cwd();
    try {
      fs.mkdirSync(path.join(tmpProject, "src", "app"), { recursive: true });
      fs.writeFileSync(path.join(tmpProject, "tsconfig.json"), "{}", "utf8");
      fs.writeFileSync(path.join(tmpProject, ".gitignore"), "node_modules/\n", "utf8");
      fs.writeFileSync(
        path.join(tmpProject, ".env.local"),
        'CONTEXT_DROP_CLI_TEST_VAR="loaded_from_env_local"\n',
        "utf8"
      );

      loadEnvFilesIfPresent(tmpProject);
      assert.equal(process.env["CONTEXT_DROP_CLI_TEST_VAR"], "loaded_from_env_local");
      delete process.env["CONTEXT_DROP_CLI_TEST_VAR"];

      process.chdir(tmpProject);
      await runCli(["init"]);

      const routeFile = path.join(
        tmpProject,
        "src",
        "app",
        "api",
        "context-drop",
        "[[...path]]",
        "route.ts"
      );
      assert.equal(fs.existsSync(routeFile), true);
      const routeCode = fs.readFileSync(routeFile, "utf8");
      assert.ok(routeCode.includes("createContextDropNextHandler"));

      const gitignore = fs.readFileSync(path.join(tmpProject, ".gitignore"), "utf8");
      assert.ok(gitignore.includes(".context-drop/"));
    } finally {
      process.chdir(prevCwd);
      fs.rmSync(tmpProject, { recursive: true, force: true });
    }
  });

  it("imports all compiled dist subpath entrypoints cleanly in Node SSR without DOM globals", async () => {
    const distRoot = path.resolve(import.meta.dirname, "../../dist/src");
    if (!fs.existsSync(distRoot)) return;

    const rootMod = await import("../../dist/src/index.js");
    const widgetMod = await import("../../dist/src/widget/index.js");
    const serverMod = await import("../../dist/src/server/index.js");
    const nextServerMod = await import("../../dist/src/next/server.js");
    const mcpMod = await import("../../dist/src/mcp/index.js");

    assert.equal(typeof rootMod.registerContextDropWidget, "function");
    assert.equal(typeof widgetMod.ContextDropWidgetElement, "function");
    assert.equal(typeof serverMod.createContextDropNextHandler, "function");
    assert.equal(typeof nextServerMod.createContextDropPagesHandler, "function");
    assert.equal(typeof mcpMod.createContextDropMcpServer, "function");
  });
});

