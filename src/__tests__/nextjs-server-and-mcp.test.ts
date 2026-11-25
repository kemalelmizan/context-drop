import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { PassThrough, Readable } from "node:stream";
import { describe, it } from "node:test";
import type { IncomingMessage, ServerResponse } from "node:http";
import { loadEnvFilesIfPresent, runCli } from "../cli.ts";
import { LocalEventStore } from "../events/local-event-store.ts";
import { publishFeedbackEvent } from "../events/publisher.ts";
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

        const updated = await writer.updateFeedbackStatus(created.id, "fixed");
        assert.equal(updated?.previous_status, "new");
        assert.equal(updated?.feedback.status, "fixed");
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

    // 5. update_feedback_status("staging:1", "fixed") transitions remote record
    const updateRpc = await hub.dispatch({
      jsonrpc: "2.0",
      id: 5,
      method: "tools/call",
      params: {
        name: "update_feedback_status",
        arguments: { id: "staging:1", status: "fixed" }
      }
    });
    assert.ok(updateRpc && !Array.isArray(updateRpc));
    const stagingAfter = await stagingStorage.getFeedback(1);
    assert.equal(stagingAfter?.status, "fixed");
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

describe("Own Feedback Sync, Update, Soft Delete & MCP Soft-Delete Filtering", () => {
  it("supports GET /feedback, PATCH /feedback/:id, DELETE /feedback/:id, attachment preview, and strict IDOR protection in Next.js App & Pages Routers", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "cd-own-fb-sqlite-"));
    try {
      const storage = createLocalStorageAdapter({
        dir: tmpDir,
        backend: "sqlite"
      });

      const updatedIds: Array<number | string> = [];
      const deletedIds: Array<number | string> = [];

      const handler = createContextDropNextHandler({
        environment: "staging",
        ownershipSecret: "test-nextjs-hmac-secret-key-999",
        storage,
        onFeedbackUpdated: (fb) => {
          updatedIds.push(fb.id);
        },
        onFeedbackDeleted: (fb) => {
          deletedIds.push(fb.id);
        }
      });

      // 1. Create feedback with 1 element + 1 PNG attachment
      const createRes = await handler.POST(
        new Request("http://localhost:3000/api/context-drop/feedback", {
          method: "POST",
          headers: {
            Origin: "http://localhost:3000",
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            feedback: {
              message: "Original pricing badge clipped",
              page_url: "http://localhost:3000/pricing",
              user_agent: "NodeTest",
              element_references: [
                {
                  client_ref: "el_1",
                  tag_name: "span",
                  selector: ".price-badge",
                  dom_path: "body > .price-badge",
                  text_content: "$49/mo",
                  bounding_rect: { x: 12, y: 24, width: 80, height: 24 }
                }
              ],
              attachments: [
                {
                  attachment_type: "screenshot",
                  filename: "badge-1.png",
                  data_url: `data:image/png;base64,${VALID_1X1_PNG_BASE64}`,
                  element_reference_ref: "el_1",
                  metadata: { capture_type: "element" }
                }
              ]
            }
          })
        })
      );
      assert.equal(createRes.status, 201);
      const setCookie = createRes.headers.get("Set-Cookie") || "";
      assert.ok(setCookie.includes("cd_session="));

      const created = (await createRes.json()) as {
        id: number;
        ownership_token: string;
        feedback: { attachments: Array<{ id: number }> };
      };
      const fbId = created.id;
      const ownershipToken = created.ownership_token;
      const firstAttId = created.feedback.attachments[0]?.id;
      assert.ok(ownershipToken && firstAttId);

      // 2. Stranger without cookie or token gets empty list and 403 on PATCH / DELETE / attachment preview
      const strangerListRes = await handler.GET(
        new Request("http://localhost:3000/api/context-drop/feedback")
      );
      assert.equal(strangerListRes.status, 200);
      assert.deepEqual(
        ((await strangerListRes.json()) as { feedbacks: unknown[] }).feedbacks,
        []
      );

      const strangerPatchRes = await handler.PATCH(
        new Request(`http://localhost:3000/api/context-drop/feedback/${fbId}`, {
          method: "PATCH",
          headers: {
            Origin: "http://localhost:3000",
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ feedback: { message: "Hijacked" } })
        })
      );
      assert.equal(strangerPatchRes.status, 403);

      const strangerDelRes = await handler.DELETE(
        new Request(`http://localhost:3000/api/context-drop/feedback/${fbId}`, {
          method: "DELETE",
          headers: { Origin: "http://localhost:3000" }
        })
      );
      assert.equal(strangerDelRes.status, 403);

      const strangerAttRes = await handler.GET(
        new Request(
          `http://localhost:3000/api/context-drop/feedback/${fbId}/attachments/${firstAttId}`
        )
      );
      assert.equal(strangerAttRes.status, 403);

      // 3. Owner with signed ownership_token lists own feedback and previews inline attachment safely
      const ownListRes = await handler.GET(
        new Request("http://localhost:3000/api/context-drop/feedback?limit=10", {
          headers: {
            "X-Context-Drop-Ownership-Tokens": ownershipToken
          }
        })
      );
      assert.equal(ownListRes.status, 200);
      const ownList = (await ownListRes.json()) as {
        total_count: number;
        feedbacks: Array<{ id: number }>;
      };
      assert.equal(ownList.total_count, 1);
      assert.equal(ownList.feedbacks[0]?.id, fbId);

      const previewRes = await handler.GET(
        new Request(
          `http://localhost:3000/api/context-drop/feedback/${fbId}/attachments/${firstAttId}?ownership_token=${encodeURIComponent(ownershipToken)}`
        )
      );
      assert.equal(previewRes.status, 200);
      assert.equal(previewRes.headers.get("Content-Type"), "image/png");
      assert.ok((previewRes.headers.get("Content-Security-Policy") || "").includes("sandbox"));
      const previewBytes = new Uint8Array(await previewRes.arrayBuffer());
      assert.equal(previewBytes.byteLength, VALID_1X1_PNG_BYTES.byteLength);

      // 4. Update message + element_references + retain existing attachment + add a 2nd attachment
      const patchRes = await handler.PATCH(
        new Request(`http://localhost:3000/api/context-drop/feedback/${fbId}`, {
          method: "PATCH",
          headers: {
            Origin: "http://localhost:3000",
            "Content-Type": "application/json",
            "X-Context-Drop-Ownership-Token": ownershipToken
          },
          body: JSON.stringify({
            feedback: {
              message: "Updated: clipped on both tablet and mobile viewports",
              element_references: [
                {
                  client_ref: "el_1",
                  tag_name: "span",
                  selector: ".price-badge",
                  dom_path: "body > .price-badge",
                  bounding_rect: { x: 12, y: 24, width: 80, height: 24 }
                },
                {
                  client_ref: "el_2",
                  tag_name: "div",
                  selector: ".plan-card",
                  dom_path: "body > .plan-card",
                  bounding_rect: { x: 0, y: 0, width: 320, height: 400 }
                }
              ],
              attachments: [
                {
                  existing_id: firstAttId,
                  attachment_type: "screenshot",
                  element_reference_ref: "el_1"
                },
                {
                  attachment_type: "image",
                  filename: "mobile-shot.png",
                  data_url: `data:image/png;base64,${VALID_1X1_PNG_BASE64}`,
                  element_reference_ref: "el_2"
                }
              ]
            }
          })
        })
      );
      assert.equal(patchRes.status, 200);
      const patched = (await patchRes.json()) as {
        element_references_count: number;
        attachments_count: number;
        feedback: { message: string };
      };
      assert.equal(patched.element_references_count, 2);
      assert.equal(patched.attachments_count, 2);
      assert.equal(
        patched.feedback.message,
        "Updated: clipped on both tablet and mobile viewports"
      );
      assert.deepEqual(updatedIds, [fbId]);

      // 5. Reject emptying both message & all context (422) and cross-feedback existing_id (422)
      const emptyPatchRes = await handler.PATCH(
        new Request(`http://localhost:3000/api/context-drop/feedback/${fbId}`, {
          method: "PATCH",
          headers: {
            Origin: "http://localhost:3000",
            "Content-Type": "application/json",
            "X-Context-Drop-Ownership-Token": ownershipToken
          },
          body: JSON.stringify({
            feedback: {
              message: "   ",
              element_references: [],
              attachments: []
            }
          })
        })
      );
      assert.equal(emptyPatchRes.status, 422);

      const foreignAttPatchRes = await handler.PATCH(
        new Request(`http://localhost:3000/api/context-drop/feedback/${fbId}`, {
          method: "PATCH",
          headers: {
            Origin: "http://localhost:3000",
            "Content-Type": "application/json",
            "X-Context-Drop-Ownership-Token": ownershipToken
          },
          body: JSON.stringify({
            feedback: {
              message: "Valid text",
              attachments: [{ existing_id: 999999 }]
            }
          })
        })
      );
      assert.equal(foreignAttPatchRes.status, 422);

      // 6. Soft-delete via Pages Router handler to verify Pages Router PATCH/DELETE parity too
      const pagesHandler = createContextDropPagesHandler({
        environment: "staging",
        ownershipSecret: "test-nextjs-hmac-secret-key-999",
        storage,
        onFeedbackDeleted: (fb) => {
          deletedIds.push(fb.id);
        }
      });

      let pagesStatus = 0;
      const pagesChunks: Buffer[] = [];
      const mockReq = Object.assign(Readable.from([]), {
        method: "DELETE",
        url: `/api/context-drop/feedback/${fbId}`,
        headers: {
          host: "localhost:3000",
          origin: "http://localhost:3000",
          "x-context-drop-ownership-token": ownershipToken
        }
      }) as unknown as IncomingMessage;

      const mockRes = {
        statusCode: 200,
        setHeader: () => {},
        end: (chunk?: Buffer | string) => {
          pagesStatus = mockRes.statusCode;
          if (chunk) pagesChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        }
      } as unknown as ServerResponse;

      await pagesHandler(mockReq, mockRes);
      assert.equal(pagesStatus, 200);
      const delJson = JSON.parse(Buffer.concat(pagesChunks).toString("utf8")) as {
        deleted: boolean;
      };
      assert.equal(delJson.deleted, true);
      assert.deepEqual(deletedIds, [fbId]);

      // Excluded from GET /feedback, 404 on repeat DELETE and 404 on attachment preview
      const afterDelList = await handler.GET(
        new Request("http://localhost:3000/api/context-drop/feedback", {
          headers: { "X-Context-Drop-Ownership-Tokens": ownershipToken }
        })
      );
      assert.deepEqual(((await afterDelList.json()) as { feedbacks: unknown[] }).feedbacks, []);

      const repeatDel = await handler.DELETE(
        new Request(`http://localhost:3000/api/context-drop/feedback/${fbId}`, {
          method: "DELETE",
          headers: {
            Origin: "http://localhost:3000",
            "X-Context-Drop-Ownership-Token": ownershipToken
          }
        })
      );
      assert.equal(repeatDel.status, 404);

      // 7. MCP excludes soft-deleted feedback by default and inspects on demand with include_deleted: true
      const mcp = new ContextDropMcpDispatcher({
        storage,
        hostEnvironment: "staging"
      });

      const defaultMcpList = await mcp.dispatch({
        jsonrpc: "2.0",
        id: 71,
        method: "tools/call",
        params: { name: "list_feedbacks", arguments: {} }
      });
      assert.ok(defaultMcpList && !Array.isArray(defaultMcpList));
      assert.equal(
        (
          JSON.parse(
            (defaultMcpList.result as { content: Array<{ text: string }> }).content[0]?.text ?? "{}"
          ) as { total: number }
        ).total,
        0
      );

      const withDeletedMcpList = await mcp.dispatch({
        jsonrpc: "2.0",
        id: 72,
        method: "tools/call",
        params: { name: "list_feedbacks", arguments: { include_deleted: true } }
      });
      assert.ok(withDeletedMcpList && !Array.isArray(withDeletedMcpList));
      const parsedWithDel = JSON.parse(
        (withDeletedMcpList.result as { content: Array<{ text: string }> }).content[0]?.text ?? "{}"
      ) as { total: number; feedbacks: Array<{ deleted?: boolean }> };
      assert.equal(parsedWithDel.total, 1);
      assert.equal(parsedWithDel.feedbacks[0]?.deleted, true);

      const hiddenGet = await mcp.dispatch({
        jsonrpc: "2.0",
        id: 73,
        method: "tools/call",
        params: { name: "get_feedback", arguments: { id: fbId } }
      });
      assert.ok(hiddenGet && !Array.isArray(hiddenGet));
      assert.equal((hiddenGet.result as { isError: boolean }).isError, true);

      const includedGet = await mcp.dispatch({
        jsonrpc: "2.0",
        id: 74,
        method: "tools/call",
        params: { name: "get_feedback", arguments: { id: fbId, include_deleted: true } }
      });
      assert.ok(includedGet && !Array.isArray(includedGet));
      assert.equal((includedGet.result as { isError: boolean }).isError, false);
      assert.equal(
        (
          JSON.parse(
            (includedGet.result as { content: Array<{ text: string }> }).content[0]?.text ?? "{}"
          ) as { deleted: boolean }
        ).deleted,
        true
      );

      const blockedStatus = await mcp.dispatch({
        jsonrpc: "2.0",
        id: 75,
        method: "tools/call",
        params: {
          name: "update_feedback_status",
          arguments: { id: fbId, status: "fixed" }
        }
      });
      assert.ok(blockedStatus && !Array.isArray(blockedStatus));
      assert.equal((blockedStatus.result as { isError: boolean }).isError, true);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("enforces authenticated resolveSubmitter isolation and JSON LocalStorageAdapter parity", async () => {
    const tmpJsonDir = fs.mkdtempSync(path.join(os.tmpdir(), "cd-own-fb-json-"));
    try {
      const jsonStorage = createLocalStorageAdapter({
        dir: tmpJsonDir,
        backend: "json"
      });

      let activeUserId = "user_alpha";
      const authHandler = createContextDropNextHandler({
        environment: "production",
        ownershipSecret: "auth-secret-test-key",
        storage: jsonStorage,
        resolveSubmitter: () => ({ type: "User", id: activeUserId, label: activeUserId })
      });

      // User alpha creates feedback
      const alphaCreate = await authHandler.POST(
        new Request("http://localhost:3000/api/context-drop/feedback", {
          method: "POST",
          headers: {
            Origin: "http://localhost:3000",
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            feedback: {
              message: "Alpha user report",
              page_url: "http://localhost:3000/dashboard"
            }
          })
        })
      );
      assert.equal(alphaCreate.status, 201);
      const alphaBody = (await alphaCreate.json()) as {
        id: number;
        ownership_token: string;
      };

      // Switch authenticated user to user_beta: even with alpha's ownership_token, PATCH must return 403!
      activeUserId = "user_beta";
      const crossUserPatch = await authHandler.PATCH(
        new Request(`http://localhost:3000/api/context-drop/feedback/${alphaBody.id}`, {
          method: "PATCH",
          headers: {
            Origin: "http://localhost:3000",
            "Content-Type": "application/json",
            "X-Context-Drop-Ownership-Token": alphaBody.ownership_token
          },
          body: JSON.stringify({ feedback: { message: "Beta tamper attempt" } })
        })
      );
      assert.equal(crossUserPatch.status, 403);

      // Switch back to user_alpha: GET /feedback finds own record without needing any token header!
      activeUserId = "user_alpha";
      const alphaOwn = await authHandler.GET(
        new Request("http://localhost:3000/api/context-drop/feedback")
      );
      assert.equal(alphaOwn.status, 200);
      assert.equal(
        ((await alphaOwn.json()) as { total_count: number }).total_count,
        1
      );

      // Add comment with image attachment -> transitions status to 'updated'
      const commentRes = await authHandler.POST(
        new Request(`http://localhost:3000/api/context-drop/feedback/${alphaBody.id}/comments`, {
          method: "POST",
          headers: {
            Origin: "http://localhost:3000",
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            comment: {
              body: "Here is a follow-up image",
              attachments: [
                {
                  attachment_type: "image",
                  filename: "followup.png",
                  data_url: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="
                }
              ]
            }
          })
        })
      );
      assert.equal(commentRes.status, 201);
      const commentJson = (await commentRes.json()) as {
        status: string;
        comment: { body: string; attachments: Array<{ id: number | string }> };
      };
      assert.equal(commentJson.status, "updated");
      assert.equal(commentJson.comment.body, "Here is a follow-up image");
      assert.equal(commentJson.comment.attachments.length, 1);

      // Comment attachment preview works for owner
      const attId = commentJson.comment.attachments[0]!.id;
      const attPreview = await authHandler.GET(
        new Request(`http://localhost:3000/api/context-drop/feedback/${alphaBody.id}/attachments/${attId}`)
      );
      assert.equal(attPreview.status, 200);

      // Owner can transition status to 'reviewed'
      const reviewRes = await authHandler.PATCH(
        new Request(`http://localhost:3000/api/context-drop/feedback/${alphaBody.id}`, {
          method: "PATCH",
          headers: {
            Origin: "http://localhost:3000",
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ feedback: { status: "reviewed" } })
        })
      );
      assert.equal(reviewRes.status, 200);
      assert.equal(((await reviewRes.json()) as { status: string }).status, "reviewed");
    } finally {
      fs.rmSync(tmpJsonDir, { recursive: true, force: true });
    }
  });

  it("does not create .context-drop directory when MCP starts or reads in a non-ContextDrop project", async () => {
    const tmpProject = fs.mkdtempSync(path.join(os.tmpdir(), "cd-mcp-lazy-"));
    const storageDir = path.join(tmpProject, ".context-drop");
    try {
      const outputs: string[] = [];
      const requests = [
        JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize" }),
        JSON.stringify({
          jsonrpc: "2.0",
          id: 2,
          method: "tools/call",
          params: { name: "list_feedbacks", arguments: {} }
        }),
        JSON.stringify({
          jsonrpc: "2.0",
          id: 3,
          method: "tools/call",
          params: { name: "get_feedback", arguments: { id: 1 } }
        })
      ];

      await runContextDropMcpStdio({
        storageDir,
        input: Readable.from(requests.map((r) => `${r}\n`)),
        output: {
          write(chunk: string) {
            outputs.push(chunk);
          }
        }
      });

      assert.equal(fs.existsSync(storageDir), false, ".context-drop must not be created by MCP");
      assert.equal(outputs.length, 3);

      const listRes = JSON.parse(outputs[1]!) as {
        result: { content: Array<{ text: string }> };
      };
      const listPayload = JSON.parse(listRes.result.content[0]!.text) as { total: number };
      assert.equal(listPayload.total, 0);

      // Once the app itself creates .context-drop and stores feedback, MCP reads it seamlessly
      const writer = createLocalStorageAdapter({ dir: storageDir });
      await writer.createFeedback({
        environment: "development",
        message: "Created after MCP started",
        page_url: "http://localhost:3000/",
        user_agent: "NodeTest",
        session_id: null,
        submitter: {},
        metadata: {},
        element_references: [],
        attachments: []
      });

      const outputsAfter: string[] = [];
      await runContextDropMcpStdio({
        storageDir,
        input: Readable.from([
          `${JSON.stringify({
            jsonrpc: "2.0",
            id: 4,
            method: "tools/call",
            params: { name: "list_feedbacks", arguments: {} }
          })}\n`
        ]),
        output: {
          write(chunk: string) {
            outputsAfter.push(chunk);
          }
        }
      });

      const afterRes = JSON.parse(outputsAfter[0]!) as {
        result: { content: Array<{ text: string }> };
      };
      const afterPayload = JSON.parse(afterRes.result.content[0]!.text) as {
        total: number;
        feedbacks: Array<{ message: string }>;
      };
      assert.equal(afterPayload.total, 1);
      assert.equal(afterPayload.feedbacks[0]!.message, "Created after MCP started");
    } finally {
      fs.rmSync(tmpProject, { recursive: true, force: true });
    }
  });

  it("advertises MCP Events extension and polls feedback.created occurrences", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "cd-events-"));
    const storage = createLocalStorageAdapter({ dir: tmpDir });
    const eventStore = new LocalEventStore({ dir: tmpDir });
    const dispatcher = new ContextDropMcpDispatcher({
      storage,
      hostEnvironment: "development",
      eventStore
    });

  const init = await dispatcher.dispatch({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { protocolVersion: "2026-07-28" }
    });
    assert.ok(init && !Array.isArray(init));
    const caps = (init.result as { capabilities: { extensions: Record<string, unknown> } })
      .capabilities.extensions;
    assert.ok(caps["io.modelcontextprotocol/events"]);

    const list = await dispatcher.dispatch({
      jsonrpc: "2.0",
      id: 2,
      method: "events/list"
    });
    assert.ok(list && !Array.isArray(list));
    const eventNames = (
      (list.result as { events: Array<{ name: string }> }).events ?? []
    ).map((e) => e.name);
    assert.ok(eventNames.includes("feedback.created"));

    const created = await storage.createFeedback({
      environment: "development",
      message: "Events pipeline",
      page_url: "https://example.com",
      user_agent: null,
      session_id: null,
      submitter: {},
      metadata: {},
      element_references: [],
      attachments: []
    });
    await publishFeedbackEvent(eventStore, "feedback.created", created);

    const polled = await dispatcher.dispatch({
      jsonrpc: "2.0",
      id: 3,
      method: "events/poll",
      params: { name: "feedback.created", cursor: null }
    });
    assert.ok(polled && !Array.isArray(polled));
    const events = (polled.result as { events: Array<{ data: { feedback_id: number } }> }).events;
    assert.equal(events.length, 1);
    assert.equal(events[0]!.data.feedback_id, created.id);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("enforces HTTPS webhook URLs on /integrations/destinations and exposes privacy.persist_ownership_tokens", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "cd-webhooks-"));
    try {
      const prodNext = createContextDropNextHandler({
        environment: "production",
        storageDir: tmpDir,
        privacy: { persistOwnershipTokens: false },
        notifications: { enabled: true, allowInsecureWebhooks: true },
        mcp: { apiKey: "int-secret-key" }
      });

      const cfgRes = await prodNext.GET(new Request("https://acme.com/api/context-drop/config"));
      assert.equal(cfgRes.status, 200);
      const cfgJson = (await cfgRes.json()) as { privacy: { persist_ownership_tokens?: boolean } };
      assert.equal(cfgJson.privacy.persist_ownership_tokens, false);

      // Production rejects http:// and private IP webhooks even when allowInsecureWebhooks is true
      for (const badUrl of [
        "http://acme.com/hook",
        "http://localhost:4000/hook",
        "https://169.254.169.254/latest"
      ]) {
        const badRes = await prodNext.POST(
          new Request("https://acme.com/api/context-drop/integrations/destinations", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: "Bearer int-secret-key"
            },
            body: JSON.stringify({
              name: "Bad",
              destination_type: "webhook",
              settings: { url: badUrl }
            })
          })
        );
        assert.equal(badRes.status, 422);
      }

      // Valid HTTPS webhook succeeds
      const okRes = await prodNext.POST(
        new Request("https://acme.com/api/context-drop/integrations/destinations", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer int-secret-key"
          },
          body: JSON.stringify({
            name: "Prod Hook",
            destination_type: "webhook",
            settings: { url: "https://hooks.acme.com/context-drop" },
            secrets: { signing_secret: "whsec_123" }
          })
        })
      );
      assert.equal(okRes.status, 201);

      // Development handler honors allowInsecureWebhooks strictly for loopback http://
      const devNext = createContextDropNextHandler({
        environment: "development",
        storageDir: tmpDir,
        notifications: { enabled: true, allowInsecureWebhooks: true },
        mcp: { apiKey: "int-secret-key" }
      });
      const devLocalRes = await devNext.POST(
        new Request("http://localhost:3000/api/context-drop/integrations/destinations", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer int-secret-key"
          },
          body: JSON.stringify({
            name: "Local Dev Hook",
            destination_type: "webhook",
            settings: { url: "http://localhost:4000/hook" }
          })
        })
      );
      assert.equal(devLocalRes.status, 201);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("provides full Next.js Ask / Build / Feedback assistant parity, ChangeSet ACL, secret scrubbing, and 0600 key permissions", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "cd-node-assistant-"));
    try {
      const { AssistantToolConfigError } = await import("../assistant/tools.ts");
      const { encryptSecrets, redactSecretsFromText } = await import("../notifications/secrets.ts");
      const { validateRemoteMcpUrl, RemoteMcpError } = await import("../mcp/remote-client.ts");

      // 1. Secret redaction, 0600 notification.key mode, and metadata-IP MCP block
      const scrubbed = redactSecretsFromText(
        "Err: Bearer secret_jwt_token_123456 key=sk-ant-api03-abcdef123456 ?ownership_token=9.nonce.sig whsec_abcdef1234"
      );
      assert.ok(!scrubbed.includes("secret_jwt_token_123456"));
      assert.ok(!scrubbed.includes("sk-ant-api03-abcdef123456"));
      assert.ok(!scrubbed.includes("9.nonce.sig"));
      assert.ok(!scrubbed.includes("whsec_abcdef1234"));

      encryptSecrets({ signing_secret: "whsec_test_perm" }, { storageDir: tmpDir });
      const keyMode = fs.statSync(path.join(tmpDir, "notification.key")).mode & 0o777;
      assert.equal(keyMode, 0o600);

      assert.throws(
        () => validateRemoteMcpUrl("meta", "https://169.254.169.254/mcp"),
        RemoteMcpError
      );

      // 2. Ask tool denylist rejects git_* at boot
      assert.throws(
        () =>
          createContextDropNextHandler({
            assistant: {
              enabled: true,
              askTools: [
                {
                  name: "git_push_branch",
                  description: "forbidden",
                  execute: () => ({})
                }
              ]
            }
          }),
        AssistantToolConfigError
      );

      // 3. Production default blocks Build mode and returns smart confirmation_message without raw selectors
      const prodApp = createContextDropNextHandler({
        environment: "production",
        storage: createMemoryStorageAdapter(),
        ownershipSecret: "prod-node-ownership-secret-key-0123456789",
        assistant: {
          enabled: true
        }
      });

      const createFbRes = await prodApp.POST(
        new Request("https://acme.com/api/context-drop/feedback", {
          method: "POST",
          headers: { "Content-Type": "application/json", Origin: "https://acme.com" },
          body: JSON.stringify({
            feedback: {
              message: "Checkout button stuck",
              page_url: "https://acme.com/checkout",
              element_references: [
                {
                  client_ref: "c1",
                  tag_name: "button",
                  selector: "#internal-pay-btn",
                  dom_path: "body > button",
                  text_content: "Pay",
                  metadata: { friendly_label: "Complete Order button" }
                }
              ],
              attachments: [
                {
                  attachment_type: "screenshot",
                  filename: "shot.png",
                  data_url: `data:image/png;base64,${VALID_1X1_PNG_BASE64}`
                }
              ]
            }
          })
        })
      );
      assert.equal(createFbRes.status, 201);
      const createdFb = (await createFbRes.json()) as {
        id: number;
        ownership_token: string;
        confirmation_message: string;
        confirmation_metadata: { pins_summary: string };
        feedback: { attachments: Array<{ id: number }> };
      };
      assert.ok(createdFb.confirmation_message.includes(`#${createdFb.id}`));
      assert.ok(!createdFb.confirmation_message.includes("#internal-pay-btn"));
      assert.equal(createdFb.confirmation_metadata.pins_summary, "Complete Order button");

      // Attachment download sets Referrer-Policy: no-referrer & X-Content-Type-Options: nosniff
      const attRes = await prodApp.GET(
        new Request(
          `https://acme.com/api/context-drop/feedback/${createdFb.id}/attachments/${createdFb.feedback.attachments[0]!.id}?ownership_token=${encodeURIComponent(createdFb.ownership_token)}`
        )
      );
      assert.equal(attRes.status, 200);
      assert.equal(attRes.headers.get("referrer-policy"), "no-referrer");
      assert.equal(attRes.headers.get("x-content-type-options"), "nosniff");

      // Feedback mode works without BYOK; IDOR lookup without token returns 403
      const guidanceRes = await prodApp.POST(
        new Request("https://acme.com/api/context-drop/assistant/turn", {
          method: "POST",
          headers: { "Content-Type": "application/json", Origin: "https://acme.com" },
          body: JSON.stringify({
            mode: "feedback",
            page_url: "https://acme.com/checkout",
            messages: [{ role: "user", content: "Help" }]
          })
        })
      );
      assert.equal(guidanceRes.status, 200);

      const idorConfirmRes = await prodApp.POST(
        new Request("https://acme.com/api/context-drop/assistant/turn", {
          method: "POST",
          headers: { "Content-Type": "application/json", Origin: "https://acme.com" },
          body: JSON.stringify({
            mode: "feedback",
            feedback_id: createdFb.id,
            page_url: "https://acme.com/checkout",
            messages: [{ role: "user", content: "status?" }]
          })
        })
      );
      assert.equal(idorConfirmRes.status, 403);

      const validConfirmRes = await prodApp.POST(
        new Request("https://acme.com/api/context-drop/assistant/turn", {
          method: "POST",
          headers: { "Content-Type": "application/json", Origin: "https://acme.com" },
          body: JSON.stringify({
            mode: "feedback",
            feedback_id: createdFb.id,
            ownership_token: createdFb.ownership_token,
            page_url: "https://acme.com/checkout",
            messages: [{ role: "user", content: "status?" }]
          })
        })
      );
      assert.equal(validConfirmRes.status, 200);

      // Build rejected on production default (403)
      const prodBuildRes = await prodApp.POST(
        new Request("https://acme.com/api/context-drop/assistant/turn", {
          method: "POST",
          headers: { "Content-Type": "application/json", Origin: "https://acme.com" },
          body: JSON.stringify({
            mode: "build",
            page_url: "https://acme.com/checkout",
            messages: [{ role: "user", content: "Change copy" }]
          })
        })
      );
      assert.equal(prodBuildRes.status, 403);

      // 4. Staging Build flow: write tools gated until approval, strict submitter ACL, prompt-free audit
      let currentActor: { type: string; id: number; label: string } | null = {
        type: "Staff",
        id: 10,
        label: "staff10@acme.com"
      };
      const writeLog: string[] = [];
      let buildStep = 0;

      const stagingApp = createContextDropNextHandler({
        environment: "staging",
        storageDir: tmpDir,
        ownershipSecret: "staging-node-secret-key-0123456789",
        resolveSubmitter: () => currentActor,
        assistant: {
          enabled: true,
          buildTarget: { repo: "acme/web", defaultBaseBranch: "main" },
          llm: {
            provider: "anthropic",
            apiKey: "sk-ant-node-staging-key",
            models: { ask: "claude-3-5-haiku-latest", build: "claude-sonnet-4-20250514" },
            transport: async ({ tools, conversation, credentials }) => {
              // Build write tools MUST NOT appear in LLM tool schema list
              assert.ok(!tools.some((t) => t.name === "git_push_branch"));
              assert.equal(credentials.model, "claude-sonnet-4-20250514");
              assert.equal(conversation[0]?.images?.length, 1);
              buildStep += 1;
              if (buildStep === 1) {
                return {
                  text: "",
                  tool_calls: [
                    {
                      id: "tc_1",
                      name: "propose_change_set",
                      arguments: {
                        summary: "Fix CTA label",
                        patches: [{ path: "app/page.tsx", old_string: "Buy", new_string: "Pay Now" }]
                      }
                    }
                  ]
                };
              }
              return { text: "Draft ChangeSet ready for approval.", tool_calls: [] };
            }
          },
          buildTools: [
            {
              name: "build_status_get",
              description: "CI status",
              write: false,
              execute: () => ({ status: "preview_ready", preview_url: "https://pr-1.preview.acme.com" })
            },
            {
              name: "git_create_branch",
              description: "branch",
              write: true,
              execute: (args) => {
                writeLog.push(`branch:${String(args["branch_name"])}`);
                return { ok: true };
              }
            },
            {
              name: "git_apply_patches",
              description: "patch",
              write: true,
              execute: () => {
                writeLog.push("patch");
                return { ok: true };
              }
            },
            {
              name: "git_push_branch",
              description: "push",
              write: true,
              execute: () => {
                writeLog.push("push");
                return { ok: true };
              }
            },
            {
              name: "pull_request_open",
              description: "pr",
              write: true,
              execute: () => {
                writeLog.push("pr");
                return { pr_url: "https://github.com/acme/web/pull/77" };
              }
            }
          ]
        }
      });

      const buildTurnRes = await stagingApp.POST(
        new Request("https://staging.acme.com/api/context-drop/assistant/turn", {
          method: "POST",
          headers: { "Content-Type": "application/json", Origin: "https://staging.acme.com" },
          body: JSON.stringify({
            mode: "build",
            model: "claude-opus-4-ignored",
            page_url: "https://staging.acme.com/checkout",
            messages: [{ role: "user", content: "Secret prompt text that must not be audited" }],
            attachments: [
              {
                attachment_type: "screenshot",
                filename: "ui.png",
                data_url: `data:image/png;base64,${VALID_1X1_PNG_BASE64}`
              }
            ]
          })
        })
      );
      assert.equal(buildTurnRes.status, 200);
      const setCookie = buildTurnRes.headers.get("set-cookie") ?? "";
      const sessionCookie = setCookie.split(";")[0] ?? "";
      const buildTurnJson = (await buildTurnRes.json()) as {
        change_set: { id: number; status: string };
        approval_token: string;
      };
      assert.equal(buildTurnJson.change_set.status, "draft");
      assert.equal(writeLog.length, 0);

      // Audit log stores mode + tool_names without prompt text
      const turns = stagingApp.handler.getAssistantStateStore().listTurns();
      assert.equal(turns.length, 1);
      assert.ok(!JSON.stringify(turns).includes("Secret prompt text"));

      // Staff #2 on the exact same session cookie is denied (403)
      currentActor = { type: "Staff", id: 99, label: "staff99@acme.com" };
      const crossStaffGet = await stagingApp.GET(
        new Request(
          `https://staging.acme.com/api/context-drop/assistant/change_sets/${buildTurnJson.change_set.id}`,
          { headers: { Cookie: sessionCookie } }
        )
      );
      assert.equal(crossStaffGet.status, 403);

      // Owner Staff #10 approves with valid HMAC approval_token -> executes write tools & opens PR
      currentActor = { type: "Staff", id: 10, label: "staff10@acme.com" };
      const approveRes = await stagingApp.POST(
        new Request(
          `https://staging.acme.com/api/context-drop/assistant/change_sets/${buildTurnJson.change_set.id}/approve`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Origin: "https://staging.acme.com",
              Cookie: sessionCookie
            },
            body: JSON.stringify({ approval_token: buildTurnJson.approval_token })
          }
        )
      );
      assert.equal(approveRes.status, 200);
      const approvedJson = (await approveRes.json()) as {
        change_set: { status: string; pr_url: string; preview_url: string };
      };
      assert.equal(approvedJson.change_set.status, "preview_ready");
      assert.equal(approvedJson.change_set.pr_url, "https://github.com/acme/web/pull/77");
      assert.equal(approvedJson.change_set.preview_url, "https://pr-1.preview.acme.com");
      assert.deepEqual(writeLog.slice(1), ["patch", "push", "pr"]);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});


