import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { ContextDropApiClient } from "../api-client.ts";

describe("ContextDropApiClient CSRF handling & lazy bootstrap", () => {
  const originalDocument = globalThis.document;
  const originalFetch = globalThis.fetch;

  let mockMetaContent: string | null = null;
  let fetchCalls: Array<{ url: string; options: RequestInit }> = [];
  let mockFetchHandler: (url: string, options: RequestInit) => Promise<Response>;

  beforeEach(() => {
    mockMetaContent = null;
    fetchCalls = [];

    // Mock document with querySelector for meta[name="csrf-token"]
    (globalThis as unknown as { document: unknown }).document = {
      querySelector: (selector: string) => {
        if (selector === 'meta[name="csrf-token"]') {
          if (mockMetaContent !== null) {
            return {
              getAttribute: (name: string) => (name === "content" ? mockMetaContent : null),
              setAttribute: (name: string, value: string) => {
                if (name === "content") mockMetaContent = value;
              }
            };
          }
          return null;
        }
        return null;
      }
    };

    // Default mock fetch
    mockFetchHandler = async (url: string, _options: RequestInit) => {
      if (url.endsWith("/config")) {
        return new Response(
          JSON.stringify({
            enabled: true,
            position: "bottom_right",
            csrf_token: "bootstrap-csrf-token-123"
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      return new Response(JSON.stringify({ id: 1, status: "new" }), {
        status: 201,
        headers: { "Content-Type": "application/json" }
      });
    };

    globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      const options = init || {};
      fetchCalls.push({ url, options });
      return mockFetchHandler(url, options);
    };
  });

  afterEach(() => {
    (globalThis as unknown as { document: unknown }).document = originalDocument;
    globalThis.fetch = originalFetch;
  });

  it("prefers document meta[name='csrf-token'] when present", () => {
    mockMetaContent = "dom-token-xyz";
    const client = new ContextDropApiClient("/context_drop");
    assert.equal(client.getCsrfToken(), "dom-token-xyz");
  });

  it("returns null when meta is absent and no token has been cached", () => {
    mockMetaContent = null;
    const client = new ContextDropApiClient("/context_drop");
    assert.equal(client.getCsrfToken(), null);
  });

  it("caches csrf_token when fetchConfig() is called", async () => {
    mockMetaContent = null;
    const client = new ContextDropApiClient("/context_drop");

    const config = await client.fetchConfig();
    assert.equal(config.csrf_token, "bootstrap-csrf-token-123");
    assert.equal(client.getCsrfToken(), "bootstrap-csrf-token-123");
    assert.equal(fetchCalls.length, 1);
    assert.equal(fetchCalls[0].url, "/context_drop/config");
    assert.equal(fetchCalls[0].options.credentials, "same-origin");
  });

  it("deduplicates concurrent in-flight fetchConfig() calls", async () => {
    mockMetaContent = null;
    const client = new ContextDropApiClient("/context_drop");

    const [cfg1, cfg2, cfg3] = await Promise.all([
      client.fetchConfig(),
      client.fetchConfig(),
      client.fetchConfig()
    ]);

    assert.equal(cfg1.csrf_token, "bootstrap-csrf-token-123");
    assert.equal(cfg2.csrf_token, "bootstrap-csrf-token-123");
    assert.equal(cfg3.csrf_token, "bootstrap-csrf-token-123");
    assert.equal(fetchCalls.length, 1);
  });

  it("uses DOM meta token directly in submitFeedback() without calling /config", async () => {
    mockMetaContent = "meta-token-abc";
    const client = new ContextDropApiClient("/context_drop");

    await client.submitFeedback({
      message: "Feedback from ERB page",
      page_url: "http://localhost/erb",
      user_agent: "test-agent",
      metadata: {},
      element_references: [],
      attachments: []
    });

    assert.equal(fetchCalls.length, 1);
    assert.equal(fetchCalls[0].url, "/context_drop/feedback");
    const headers = fetchCalls[0].options.headers as Record<string, string>;
    assert.equal(headers["X-CSRF-Token"], "meta-token-abc");
  });

  it("lazily bootstraps CSRF token from /config on static SPA page without meta tag", async () => {
    mockMetaContent = null;
    const client = new ContextDropApiClient("/context_drop");

    await client.submitFeedback({
      message: "Feedback from SPA page",
      page_url: "http://localhost/spa",
      user_agent: "test-agent",
      metadata: {},
      element_references: [],
      attachments: []
    });

    // 1st call: GET /config to fetch csrf_token
    // 2nd call: POST /feedback with X-CSRF-Token
    assert.equal(fetchCalls.length, 2);
    assert.equal(fetchCalls[0].url, "/context_drop/config");
    assert.equal(fetchCalls[1].url, "/context_drop/feedback");

    const postHeaders = fetchCalls[1].options.headers as Record<string, string>;
    assert.equal(postHeaders["X-CSRF-Token"], "bootstrap-csrf-token-123");

    // Next request reuses cached token without calling /config again
    await client.submitFeedback({
      message: "Second feedback from SPA page",
      page_url: "http://localhost/spa",
      user_agent: "test-agent",
      metadata: {},
      element_references: [],
      attachments: []
    });

    assert.equal(fetchCalls.length, 3);
    assert.equal(fetchCalls[2].url, "/context_drop/feedback");
    const nextHeaders = fetchCalls[2].options.headers as Record<string, string>;
    assert.equal(nextHeaders["X-CSRF-Token"], "bootstrap-csrf-token-123");
  });

  it("automatically refreshes token and retries once when receiving 422 CSRF authenticity error", async () => {
    mockMetaContent = "stale-token-1";
    const client = new ContextDropApiClient("/context_drop");

    let postAttempt = 0;
    mockFetchHandler = async (url: string, _options: RequestInit) => {
      if (url.endsWith("/config")) {
        return new Response(
          JSON.stringify({
            enabled: true,
            position: "bottom_right",
            csrf_token: "refreshed-session-token-456"
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      if (url.endsWith("/feedback")) {
        postAttempt++;
        if (postAttempt === 1) {
          // First attempt fails with 422 Rails CSRF error
          return new Response(
            JSON.stringify({ error: "Invalid or missing CSRF authenticity token" }),
            { status: 422, headers: { "Content-Type": "application/json" } }
          );
        }
        // Second attempt succeeds
        return new Response(
          JSON.stringify({ id: 42, status: "new", created_at: "2026-11-11T00:00:00Z" }),
          { status: 201, headers: { "Content-Type": "application/json" } }
        );
      }
      throw new Error(`Unexpected URL ${url}`);
    };

    const res = await client.submitFeedback({
      message: "Feedback with stale token",
      page_url: "http://localhost/spa",
      user_agent: "test-agent",
      metadata: {},
      element_references: [],
      attachments: []
    });

    assert.equal(res.id, 42);
    assert.equal(postAttempt, 2);

    // Call 1: POST /feedback with stale-token-1
    // Call 2: GET /config to refresh token
    // Call 3: POST /feedback with refreshed-session-token-456
    assert.equal(fetchCalls.length, 3);
    assert.equal(fetchCalls[0].url, "/context_drop/feedback");
    assert.equal(
      (fetchCalls[0].options.headers as Record<string, string>)["X-CSRF-Token"],
      "stale-token-1"
    );
    assert.equal(fetchCalls[1].url, "/context_drop/config");
    assert.equal(fetchCalls[2].url, "/context_drop/feedback");
    assert.equal(
      (fetchCalls[2].options.headers as Record<string, string>)["X-CSRF-Token"],
      "refreshed-session-token-456"
    );

    // DOM meta was also updated to new token
    assert.equal(mockMetaContent, "refreshed-session-token-456");
  });

  it("does not retry on non-CSRF 422 errors", async () => {
    mockMetaContent = "valid-token";
    const client = new ContextDropApiClient("/context_drop");

    mockFetchHandler = async (url: string, _options: RequestInit) => {
      if (url.endsWith("/feedback")) {
        return new Response(
          JSON.stringify({ error: "Feedback message cannot be blank" }),
          { status: 422, headers: { "Content-Type": "application/json" } }
        );
      }
      return new Response("{}", { status: 200 });
    };

    await assert.rejects(
      async () => {
        await client.submitFeedback({
          message: "",
          page_url: "http://localhost/spa",
          user_agent: "test-agent",
          metadata: {},
          element_references: [],
          attachments: []
        });
      },
      {
        message: "Feedback message cannot be blank"
      }
    );

    // Only 1 attempt was made; no retry or config refresh was triggered
    assert.equal(fetchCalls.length, 1);
  });

  it("handles uploadAttachment CSRF token bootstrap and 422 retry", async () => {
    mockMetaContent = null;
    const client = new ContextDropApiClient("/context_drop");

    let uploadAttempts = 0;
    mockFetchHandler = async (url: string, _options: RequestInit) => {
      if (url.endsWith("/config")) {
        return new Response(
          JSON.stringify({
            enabled: true,
            csrf_token: uploadAttempts === 0 ? "upload-token-1" : "upload-token-2"
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      if (url.endsWith("/attachments")) {
        uploadAttempts++;
        if (uploadAttempts === 1) {
          return new Response(
            JSON.stringify({ error: "Can't verify CSRF token authenticity" }),
            { status: 422, headers: { "Content-Type": "application/json" } }
          );
        }
        return new Response(JSON.stringify({ signed_blob_id: "blob-abc-123" }), {
          status: 201,
          headers: { "Content-Type": "application/json" }
        });
      }
      throw new Error(`Unexpected URL ${url}`);
    };

    const dummyBlob = new Blob(["dummy content"], { type: "image/png" });
    const res = await client.uploadAttachment(dummyBlob, "test.png");

    assert.equal(res.signed_blob_id, "blob-abc-123");
    assert.equal(uploadAttempts, 2);

    // Call 1: GET /config (initial bootstrap)
    // Call 2: POST /attachments (fails with 422 CSRF)
    // Call 3: GET /config (refresh)
    // Call 4: POST /attachments (retried with new token, succeeds)
    assert.equal(fetchCalls.length, 4);
    assert.equal(fetchCalls[0].url, "/context_drop/config");
    assert.equal(fetchCalls[1].url, "/context_drop/attachments");
    assert.equal(fetchCalls[2].url, "/context_drop/config");
    assert.equal(fetchCalls[3].url, "/context_drop/attachments");
  });

  it("avoids redundant /config calls when Next.js backend returns csrf_token: null and sends X-Context-Drop-Client cross-origin", async () => {
    mockMetaContent = null;
    mockFetchHandler = async (url: string, _options: RequestInit) => {
      if (url.endsWith("/config")) {
        return new Response(
          JSON.stringify({
            enabled: true,
            position: "bottom_right",
            csrf_token: null
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      return new Response(JSON.stringify({ id: 9, status: "new" }), {
        status: 201,
        headers: { "Content-Type": "application/json" }
      });
    };

    const client = new ContextDropApiClient("https://api.acme.com/api/context-drop", {
      credentials: "include",
      headers: { "X-Tenant-Id": "acme" }
    });

    await client.submitFeedback({
      message: "First Next.js feedback",
      page_url: "https://app.acme.com/home",
      user_agent: "test-agent",
      metadata: {},
      element_references: [],
      attachments: []
    });

    await client.submitFeedback({
      message: "Second Next.js feedback",
      page_url: "https://app.acme.com/home",
      user_agent: "test-agent",
      metadata: {},
      element_references: [],
      attachments: []
    });

    // Only 1 /config bootstrap call + 2 /feedback calls (no redundant /config before second submit)
    assert.equal(fetchCalls.length, 3);
    assert.equal(fetchCalls[0].url, "https://api.acme.com/api/context-drop/config");
    assert.equal(fetchCalls[1].url, "https://api.acme.com/api/context-drop/feedback");
    assert.equal(fetchCalls[2].url, "https://api.acme.com/api/context-drop/feedback");
    assert.equal(fetchCalls[1].options.credentials, "include");
    const sentHeaders = fetchCalls[1].options.headers as Record<string, string>;
    assert.equal(sentHeaders["X-Context-Drop-Client"], "1");
    assert.equal(sentHeaders["X-Tenant-Id"], "acme");
  });
});
