import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { SelectionMode, WidgetConfig, WidgetPosition } from "../../app/javascript/context_drop/types.ts";
import { ContextDropMcpDispatcher } from "../mcp/dispatcher.ts";
import { resolveHostEnvironment } from "../mcp/environment-router.ts";
import {
  MANDATORY_SERVER_EXCLUDED_SELECTORS,
  SensitiveElementError,
  sanitizeElementReference,
  sanitizeGenericMetadata
} from "./sanitizer.ts";
import { createLocalStorageAdapter } from "./storage/local.ts";
import { matchesOwnFeedback } from "./storage/memory.ts";
import {
  VERSION,
  type ContextDropServerConfig,
  type CreateAttachmentInput,
  type StorageAdapter,
  type StoredFeedbackRecord,
  type SubmitterIdentity,
  type UpdateAttachmentSpec
} from "./types.ts";
import {
  DEFAULT_ALLOWED_CONTENT_TYPES,
  UploadValidationError,
  decodeBase64DataUrl,
  validateBinaryUpload,
  type UploadValidationOptions
} from "./upload-validator.ts";

const VALID_POSITIONS: readonly WidgetPosition[] = [
  "bottom_right",
  "bottom_left",
  "top_right",
  "top_left"
];

const MAX_OWNERSHIP_TOKENS = 50;
const OWNERSHIP_TOKEN_DOMAIN = "cd_own:v1";

interface RateLimitBucket {
  count: number;
  expiresAtMs: number;
}

type ParsedSubRoute =
  | {
      kind: "static";
      name: "assets/context_drop.js" | "config" | "attachments" | "feedback" | "health" | "mcp";
    }
  | { kind: "feedback_item"; feedbackId: string }
  | { kind: "feedback_attachment"; feedbackId: string; attachmentId: string }
  | { kind: "unknown" };

let sharedDefaultLocalStorage: StorageAdapter | null = null;
const fallbackOwnershipSecret = crypto.randomBytes(32);

function getSharedDefaultStorage(storageDir?: string): StorageAdapter {
  if (storageDir) {
    return createLocalStorageAdapter({ dir: storageDir });
  }
  if (!sharedDefaultLocalStorage) {
    sharedDefaultLocalStorage = createLocalStorageAdapter();
  }
  return sharedDefaultLocalStorage;
}

function asRecord(input: unknown): Record<string, unknown> {
  if (input && typeof input === "object" && !Array.isArray(input)) {
    return input as Record<string, unknown>;
  }
  return {};
}

function jsonResponse(
  body: unknown,
  status = 200,
  extraHeaders: Record<string, string> = {}
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...extraHeaders
    }
  });
}

function resolveRequestExpectedOrigins(request: Request): Set<string> {
  const origins = new Set<string>();
  try {
    const reqUrl = new URL(request.url);
    origins.add(reqUrl.origin.toLowerCase());

    const fwdHost = request.headers
      .get("x-forwarded-host")
      ?.split(",")[0]
      ?.trim();
    const host = fwdHost || request.headers.get("host")?.trim();
    const fwdProto = request.headers
      .get("x-forwarded-proto")
      ?.split(",")[0]
      ?.trim()
      .toLowerCase();
    const proto = fwdProto || reqUrl.protocol.replace(":", "");

    if (host && proto) {
      origins.add(`${proto}://${host}`.toLowerCase());
    }
  } catch {
    // Ignore malformed URL
  }
  return origins;
}

export function isOriginExplicitlyAllowed(
  originHeader: string | null | undefined,
  allowedOrigins?: Array<string | RegExp>
): boolean {
  const origin = (originHeader ?? "").trim().replace(/\/+$/, "");
  if (!origin || !allowedOrigins || allowedOrigins.length === 0) return false;

  for (const rule of allowedOrigins) {
    if (rule instanceof RegExp) {
      if (rule.test(origin)) return true;
    } else if (typeof rule === "string") {
      const normalized = rule.trim().replace(/\/+$/, "");
      if (normalized && normalized !== "*" && normalized.toLowerCase() === origin.toLowerCase()) {
        return true;
      }
    }
  }
  return false;
}

function buildCorsHeaders(
  request: Request,
  allowedOrigins?: Array<string | RegExp>
): Record<string, string> {
  const origin = request.headers.get("origin")?.trim();
  if (!origin || !isOriginExplicitlyAllowed(origin, allowedOrigins)) {
    return {};
  }

  return {
    "Access-Control-Allow-Origin": origin,
    Vary: "Origin",
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Methods": "GET, POST, PATCH, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers":
      "Content-Type, Accept, X-CSRF-Token, X-Context-Drop-Client, X-Context-Drop-Ownership-Token, X-Context-Drop-Ownership-Tokens, Authorization",
    "Access-Control-Max-Age": "86400"
  };
}

function verifyMutationOrigin(
  request: Request,
  allowedOrigins?: Array<string | RegExp>
): { ok: true } | { ok: false; error: string } {
  const origin = request.headers.get("origin")?.trim().replace(/\/+$/, "");
  const secFetchSite = request.headers.get("sec-fetch-site")?.trim().toLowerCase();

  if (origin) {
    if (isOriginExplicitlyAllowed(origin, allowedOrigins)) {
      return { ok: true };
    }
    const selfOrigins = resolveRequestExpectedOrigins(request);
    if (selfOrigins.has(origin.toLowerCase())) {
      return { ok: true };
    }
    return {
      ok: false,
      error: "Cross-origin feedback submission rejected: Origin is not allowed"
    };
  }

  if (secFetchSite === "cross-site") {
    return {
      ok: false,
      error: "Cross-site feedback submission rejected"
    };
  }

  return { ok: true };
}

function resolveClientIp(request: Request): string {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;
  return "127.0.0.1";
}

const SESSION_COOKIE_NAME = "cd_session";
const SESSION_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

function extractRawSessionCookie(request: Request): string | null {
  const cookieHeader = request.headers.get("cookie");
  if (!cookieHeader || cookieHeader.trim().length === 0) return null;
  const pairs = cookieHeader.split(";");
  for (const pair of pairs) {
    const eqIdx = pair.indexOf("=");
    if (eqIdx <= 0) continue;
    const name = pair.slice(0, eqIdx).trim();
    if (name !== SESSION_COOKIE_NAME) continue;
    const rawVal = pair.slice(eqIdx + 1).trim();
    if (/^[a-f0-9]{32,64}$/i.test(rawVal)) {
      return rawVal.toLowerCase();
    }
  }
  return null;
}

function hashSessionCookieValue(rawToken: string): string {
  return crypto
    .createHash("sha256")
    .update(`cd_session:v1:${rawToken}`)
    .digest("hex")
    .slice(0, 32);
}

function extractHashedSessionId(request: Request): string | null {
  const rawToken = extractRawSessionCookie(request);
  if (!rawToken) return null;
  return hashSessionCookieValue(rawToken);
}

function buildSessionSetCookieHeader(rawToken: string, isSecure: boolean): string {
  const parts = [
    `${SESSION_COOKIE_NAME}=${rawToken}`,
    "Path=/",
    `Max-Age=${SESSION_COOKIE_MAX_AGE_SECONDS}`,
    "HttpOnly",
    "SameSite=Lax"
  ];
  if (isSecure) {
    parts.push("Secure");
  }
  return parts.join("; ");
}

function parseSubRoute(pathname: string): ParsedSubRoute {
  const clean = pathname.replace(/\/+$/, "");

  const fbAttMatch = /\/feedback\/([^/]+)\/attachments\/([^/]+)$/.exec(clean);
  if (fbAttMatch) {
    return {
      kind: "feedback_attachment",
      feedbackId: decodeURIComponent(fbAttMatch[1]!),
      attachmentId: decodeURIComponent(fbAttMatch[2]!)
    };
  }

  const fbItemMatch = /\/feedback\/([^/]+)$/.exec(clean);
  if (fbItemMatch) {
    return {
      kind: "feedback_item",
      feedbackId: decodeURIComponent(fbItemMatch[1]!)
    };
  }

  if (clean.endsWith("/assets/context_drop.js")) {
    return { kind: "static", name: "assets/context_drop.js" };
  }
  if (clean.endsWith("/config")) return { kind: "static", name: "config" };
  if (clean.endsWith("/attachments")) return { kind: "static", name: "attachments" };
  if (clean.endsWith("/feedback")) return { kind: "static", name: "feedback" };
  if (clean.endsWith("/health")) return { kind: "static", name: "health" };
  if (clean.endsWith("/mcp")) return { kind: "static", name: "mcp" };

  return { kind: "unknown" };
}

function timingSafeCompareStrings(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.byteLength !== bufB.byteLength || bufA.byteLength === 0) {
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

function computeOwnershipHmac(idStr: string, nonce: string, secret: Buffer): string {
  return crypto
    .createHmac("sha256", secret)
    .update(`${OWNERSHIP_TOKEN_DOMAIN}:${idStr}:${nonce}`)
    .digest("hex");
}

export function generateOwnershipToken(feedbackId: string | number, secret: Buffer): string {
  const idStr = String(feedbackId).trim();
  const nonce = crypto.randomBytes(8).toString("hex");
  const sig = computeOwnershipHmac(idStr, nonce, secret);
  return `${idStr}.${nonce}.${sig}`;
}

export function verifyOwnershipToken(
  token: string | null | undefined,
  feedbackId: string | number,
  secret: Buffer
): boolean {
  if (!token) return false;
  const raw = token.trim();
  const targetId = String(feedbackId).trim();
  if (!raw || !targetId) return false;

  const firstDot = raw.indexOf(".");
  if (firstDot <= 0) return false;
  const secondDot = raw.indexOf(".", firstDot + 1);
  if (secondDot <= firstDot + 1) return false;

  const idPart = raw.slice(0, firstDot);
  const noncePart = raw.slice(firstDot + 1, secondDot);
  const sigPart = raw.slice(secondDot + 1);
  if (idPart !== targetId || !noncePart || !sigPart) return false;

  const expected = computeOwnershipHmac(targetId, noncePart, secret);
  return timingSafeCompareStrings(sigPart, expected);
}

export function extractVerifiedOwnershipIds(rawTokens: string, secret: Buffer): string[] {
  if (!rawTokens) return [];
  const parts = rawTokens
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, MAX_OWNERSHIP_TOKENS);

  const verified = new Set<string>();
  for (const tok of parts) {
    const firstDot = tok.indexOf(".");
    if (firstDot <= 0) continue;
    const secondDot = tok.indexOf(".", firstDot + 1);
    if (secondDot <= firstDot + 1) continue;

    const idPart = tok.slice(0, firstDot);
    const noncePart = tok.slice(firstDot + 1, secondDot);
    const sigPart = tok.slice(secondDot + 1);
    if (!idPart || !noncePart || !sigPart) continue;

    const expected = computeOwnershipHmac(idPart, noncePart, secret);
    if (timingSafeCompareStrings(sigPart, expected)) {
      verified.add(idPart);
    }
  }
  return Array.from(verified);
}

function findOwnershipTokenFor(
  rawTokens: string,
  feedbackId: string | number,
  secret: Buffer
): string | null {
  if (!rawTokens) return null;
  const parts = rawTokens
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, MAX_OWNERSHIP_TOKENS);

  for (const tok of parts) {
    if (verifyOwnershipToken(tok, feedbackId, secret)) {
      return tok;
    }
  }
  return null;
}

function combineRequestOwnershipTokens(
  request: Request,
  url: URL,
  extraToken?: unknown
): string {
  return [
    typeof extraToken === "string" ? extraToken : "",
    request.headers.get("x-context-drop-ownership-token") ?? "",
    request.headers.get("x-context-drop-ownership-tokens") ?? "",
    url.searchParams.get("ownership_token") ?? "",
    url.searchParams.get("ownership_tokens") ?? ""
  ]
    .map((s) => s.trim())
    .filter(Boolean)
    .join(",");
}

function serializeOwnFeedback(record: StoredFeedbackRecord, ownershipToken: string) {
  const elById = new Map<string, StoredFeedbackRecord["element_references"][number]>();
  for (const el of record.element_references) {
    elById.set(String(el.id), el);
  }

  return {
    id: record.id,
    environment: record.environment,
    status: record.status,
    message: record.message,
    page_url: record.page_url,
    ownership_token: ownershipToken,
    created_at: record.created_at,
    updated_at: record.updated_at,
    element_references: record.element_references.map((el) => ({
      id: el.id,
      client_ref: el.client_ref,
      tag_name: el.tag_name,
      selector: el.selector,
      dom_path: el.dom_path,
      text_content: el.text_content,
      attributes_snapshot: el.attributes_snapshot ?? {},
      bounding_rect: el.bounding_rect ?? {},
      viewport: el.viewport ?? {},
      metadata: el.metadata ?? {},
      captured_at: el.captured_at
    })),
    attachments: record.attachments.map((att) => {
      const linkedEl =
        att.element_reference_id !== null ? elById.get(String(att.element_reference_id)) : undefined;
      return {
        id: att.id,
        attachment_type: att.attachment_type,
        element_reference_id: att.element_reference_id,
        element_reference_ref: linkedEl?.client_ref ?? null,
        filename: att.filename,
        content_type: att.content_type,
        byte_size: att.byte_size,
        metadata: att.metadata ?? {},
        created_at: att.created_at
      };
    })
  };
}

function resolveWidgetBundleFilePath(): string | null {
  try {
    const currentFile = fileURLToPath(import.meta.url);
    const candidates = [
      path.resolve(
        path.dirname(currentFile),
        "../../app/assets/javascripts/context_drop/context_drop.js"
      ),
      path.resolve(
        path.dirname(currentFile),
        "../../../app/assets/javascripts/context_drop/context_drop.js"
      )
    ];
    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }
  } catch {
    // Ignore file URL resolution errors on edge runtimes
  }
  return null;
}

export function defineContextDropConfig(config: ContextDropServerConfig): ContextDropServerConfig {
  return config;
}

export interface ContextDropFetchHandler {
  (request: Request): Promise<Response>;
  resetRateLimits: () => void;
  getStorage: () => StorageAdapter;
}

export function createContextDropFetchHandler(
  config: ContextDropServerConfig = {}
): ContextDropFetchHandler {
  const rateLimitStore = new Map<string, RateLimitBucket>();

  const getStorage = (): StorageAdapter =>
    config.storage ?? getSharedDefaultStorage(config.storageDir);

  const getOwnershipSecret = (): Buffer => {
    const explicit =
      config.ownershipSecret?.trim() ||
      process.env.CONTEXT_DROP_SECRET_KEY?.trim() ||
      process.env.CONTEXT_DROP_SECRET?.trim();
    if (explicit) {
      return crypto.createHash("sha256").update(explicit).digest();
    }
    const storageSecret = getStorage().getOwnershipSecret?.();
    if (storageSecret) return storageSecret;
    return fallbackOwnershipSecret;
  };

  const isEnabled = (): boolean => {
    if (config.enabled !== undefined) return Boolean(config.enabled);
    const envFlag = (process.env.CONTEXT_DROP_ENABLED ?? "").trim().toLowerCase();
    if (envFlag === "false" || envFlag === "0") return false;
    return true;
  };

  const getEnvironment = (): string => resolveHostEnvironment(config.environment);

  const getResolvedSelectionMode = (envName: string): SelectionMode => {
    if (config.selectionMode === "smart") return "smart";
    if (config.selectionMode === "verbose") return "verbose";
    return envName === "production" ? "smart" : "verbose";
  };

  const getUploadValidationOptions = (): UploadValidationOptions => ({
    maxAttachmentSize: config.limits?.maxAttachmentSize ?? 10 * 1024 * 1024,
    allowedContentTypes: config.limits?.allowedContentTypes ?? [...DEFAULT_ALLOWED_CONTENT_TYPES],
    maxImageDimensions: config.limits?.maxImageDimensions ?? [4096, 4096]
  });

  const buildPublicWidgetConfig = (): WidgetConfig => {
    const envName = getEnvironment();
    const pos =
      config.position && VALID_POSITIONS.includes(config.position)
        ? config.position
        : "bottom_right";
    const excluded = Array.from(
      new Set([
        ...MANDATORY_SERVER_EXCLUDED_SELECTORS,
        ...(config.privacy?.excludedSelectors ?? [])
      ])
    );

    return {
      enabled: isEnabled(),
      environment: envName,
      position: pos,
      placeholder: config.placeholder || "What would you like to tell us?",
      csrf_token: null,
      agent: {
        enabled: false
      },
      features: {
        element_selection: config.features?.elementSelection ?? true,
        selection_mode: getResolvedSelectionMode(envName),
        screenshot_capture: config.features?.screenshotCapture ?? true,
        element_capture_padding: config.features?.elementCapturePadding ?? 16,
        smart_capture_padding: config.features?.smartCapturePadding ?? 84
      },
      limits: {
        max_attachments: config.limits?.maxAttachments ?? 10,
        max_element_references: config.limits?.maxElementReferences ?? 10,
        max_attachment_size: config.limits?.maxAttachmentSize ?? 10 * 1024 * 1024,
        allowed_content_types: config.limits?.allowedContentTypes ?? [
          ...DEFAULT_ALLOWED_CONTENT_TYPES
        ],
        max_image_dimensions: config.limits?.maxImageDimensions ?? [4096, 4096]
      },
      privacy: {
        excluded_selectors: excluded
      }
    };
  };

  const checkSubmissionAuth = async (
    request: Request
  ): Promise<
    | { ok: true; submitter: SubmitterIdentity }
    | { ok: false; status: number; error: string }
  > => {
    const resolved = config.resolveSubmitter ? await config.resolveSubmitter(request) : null;
    const allowAnon = config.allowAnonymous ?? true;

    if (!allowAnon && (!resolved || (resolved.id === undefined && !resolved.label))) {
      return {
        ok: false,
        status: 401,
        error: "Authentication required to submit feedback"
      };
    }

    if (config.authorizeSubmission) {
      const permitted = await config.authorizeSubmission(request, resolved);
      if (!permitted) {
        return { ok: false, status: 403, error: "Forbidden" };
      }
    }

    return {
      ok: true,
      submitter: resolved ?? {}
    };
  };

  const checkRateLimit = (request: Request): boolean => {
    if (config.rateLimit === false) return true;
    const maxRequests = config.rateLimit?.maxRequests ?? 20;
    const periodSeconds = config.rateLimit?.periodSeconds ?? 3600;
    if (maxRequests <= 0 || periodSeconds <= 0) return true;

    const nowMs = Date.now();
    for (const [k, v] of rateLimitStore.entries()) {
      if (v.expiresAtMs <= nowMs) {
        rateLimitStore.delete(k);
      }
    }

    const ip = resolveClientIp(request);
    const windowBucket = Math.floor(nowMs / (periodSeconds * 1000));
    const key = `${ip}:${windowBucket}`;
    const existing = rateLimitStore.get(key);

    if (!existing) {
      rateLimitStore.set(key, {
        count: 1,
        expiresAtMs: (windowBucket + 1) * periodSeconds * 1000
      });
      return true;
    }

    existing.count += 1;
    return existing.count <= maxRequests;
  };

  const parseNewAttachmentSpec = async (
    attObj: Record<string, unknown>,
    storage: StorageAdapter,
    uploadOpts: UploadValidationOptions
  ): Promise<CreateAttachmentInput> => {
    const attTypeRaw = String(attObj["attachment_type"] ?? attObj["type"] ?? "image")
      .trim()
      .toLowerCase();
    const attType: "image" | "screenshot" =
      attTypeRaw === "screenshot" ? "screenshot" : "image";
    const attMeta = sanitizeGenericMetadata(attObj["metadata"]);

    const linkedRef =
      String(
        attObj["element_reference_ref"] ??
          attObj["element_attachment_ref"] ??
          attObj["client_ref"] ??
          attMeta["element_attachment_ref"] ??
          attMeta["client_ref"] ??
          ""
      ).trim() || null;

    const signedBlobId = String(attObj["signed_blob_id"] ?? "").trim();
    const rawDataUrl = String(attObj["data_url"] ?? attObj["data"] ?? "").trim();

    if (signedBlobId) {
      const consumed = await storage.consumePendingBlob(signedBlobId);
      if (!consumed) {
        throw new UploadValidationError("Invalid or expired signed_blob_id");
      }
      if (consumed.dimensions && !attMeta["image_dimensions"]) {
        attMeta["image_dimensions"] = {
          width: consumed.dimensions[0],
          height: consumed.dimensions[1]
        };
      }
      return {
        attachment_type: attType,
        element_client_ref: linkedRef,
        filename: consumed.filename,
        content_type: consumed.content_type,
        byte_size: consumed.byte_size,
        data: consumed.data,
        metadata: attMeta
      };
    }

    if (rawDataUrl) {
      const decoded = decodeBase64DataUrl(
        rawDataUrl,
        typeof attObj["filename"] === "string" ? attObj["filename"] : "screenshot.png",
        uploadOpts
      );
      if (decoded.dimensions && !attMeta["image_dimensions"]) {
        attMeta["image_dimensions"] = {
          width: decoded.dimensions[0],
          height: decoded.dimensions[1]
        };
      }
      return {
        attachment_type: attType,
        element_client_ref: linkedRef,
        filename: decoded.filename,
        content_type: decoded.content_type,
        byte_size: decoded.byte_size,
        data: decoded.data,
        metadata: attMeta
      };
    }

    throw new UploadValidationError("Attachment must include signed_blob_id or data_url");
  };

  const handleMcpEndpoint = async (request: Request): Promise<Response> => {
    const expectedApiKey = (
      config.mcp?.apiKey ??
      process.env.CONTEXT_DROP_MCP_API_KEY ??
      ""
    ).trim();
    const mcpEnabled =
      config.mcp?.enabled !== undefined
        ? Boolean(config.mcp.enabled)
        : process.env.CONTEXT_DROP_MCP_ENABLED === "true" || expectedApiKey.length > 0;

    if (!mcpEnabled) {
      return jsonResponse({ error: "Not Found" }, 404);
    }

    if (config.mcp?.authorize) {
      const ok = await config.mcp.authorize(request);
      if (!ok) {
        return jsonResponse({ error: "Unauthorized MCP request" }, 401);
      }
    } else {
      if (!expectedApiKey) {
        return jsonResponse({ error: "Unauthorized: MCP API key is not configured" }, 401);
      }
      const authHeader = request.headers.get("authorization") ?? "";
      const provided = authHeader.toLowerCase().startsWith("bearer ")
        ? authHeader.slice(7).trim()
        : "";
      if (!timingSafeCompareStrings(provided, expectedApiKey)) {
        return jsonResponse({ error: "Unauthorized: Invalid or missing Bearer token" }, 401);
      }
    }

    const rawBody = await request.text();
    let parsedPayload: unknown;
    try {
      parsedPayload = JSON.parse(rawBody);
    } catch (err) {
      return jsonResponse(
        {
          jsonrpc: "2.0",
          id: null,
          error: {
            code: -32700,
            message: `Parse error: ${(err as Error).message}`
          }
        },
        200
      );
    }

    const dispatcher = new ContextDropMcpDispatcher({
      storage: getStorage(),
      hostEnvironment: getEnvironment(),
      localOnly: true
    });

    const rpcResponse = await dispatcher.dispatch(parsedPayload);
    if (rpcResponse === null) {
      return new Response(null, { status: 202 });
    }
    return jsonResponse(rpcResponse, 200);
  };

  const handler = async (request: Request): Promise<Response> => {
    const url = new URL(request.url, "http://localhost");
    const parsedRoute = parseSubRoute(url.pathname);
    const method = request.method.toUpperCase();

    // Remote MCP endpoint has independent enablement & auth (matching Rails McpController)
    if (parsedRoute.kind === "static" && parsedRoute.name === "mcp" && method === "POST") {
      return handleMcpEndpoint(request);
    }

    const corsHeaders = buildCorsHeaders(request, config.allowedOrigins);

    if (method === "OPTIONS") {
      if (Object.keys(corsHeaders).length > 0) {
        return new Response(null, { status: 204, headers: corsHeaders });
      }
      const origin = request.headers.get("origin");
      if (origin && resolveRequestExpectedOrigins(request).has(origin.toLowerCase())) {
        return new Response(null, { status: 204 });
      }
      return new Response(null, { status: 403 });
    }

    if (!isEnabled()) {
      return jsonResponse({ error: "Not Found" }, 404, corsHeaders);
    }

    if (parsedRoute.kind === "static" && parsedRoute.name === "health" && method === "GET") {
      return jsonResponse(
        {
          status: "ok",
          environment: getEnvironment(),
          version: VERSION
        },
        200,
        corsHeaders
      );
    }

    if (
      parsedRoute.kind === "static" &&
      parsedRoute.name === "assets/context_drop.js" &&
      method === "GET"
    ) {
      const bundlePath = resolveWidgetBundleFilePath();
      if (!bundlePath) {
        return new Response("Not Found", { status: 404, headers: corsHeaders });
      }
      const jsContent = fs.readFileSync(bundlePath, "utf8");
      return new Response(jsContent, {
        status: 200,
        headers: {
          "Content-Type": "application/javascript; charset=utf-8",
          "Cache-Control": "public, max-age=3600",
          ...corsHeaders
        }
      });
    }

    if (parsedRoute.kind === "static" && parsedRoute.name === "config" && method === "GET") {
      const auth = await checkSubmissionAuth(request);
      if (!auth.ok) {
        return jsonResponse({ error: auth.error }, auth.status, corsHeaders);
      }
      return jsonResponse(buildPublicWidgetConfig(), 200, corsHeaders);
    }

    if (parsedRoute.kind === "static" && parsedRoute.name === "attachments" && method === "POST") {
      const originCheck = verifyMutationOrigin(request, config.allowedOrigins);
      if (!originCheck.ok) {
        return jsonResponse({ error: originCheck.error }, 403, corsHeaders);
      }

      const auth = await checkSubmissionAuth(request);
      if (!auth.ok) {
        return jsonResponse({ error: auth.error }, auth.status, corsHeaders);
      }

      if (!checkRateLimit(request)) {
        return jsonResponse(
          { error: "Rate limit exceeded. Please try again later." },
          429,
          corsHeaders
        );
      }

      try {
        const formData = await request.formData();
        const fileEntry = formData.get("file");
        if (!fileEntry || typeof (fileEntry as Blob).arrayBuffer !== "function") {
          throw new UploadValidationError("Missing file upload");
        }
        const blobObj = fileEntry as File;
        const ab = await blobObj.arrayBuffer();
        const validated = validateBinaryUpload(
          new Uint8Array(ab),
          typeof blobObj.name === "string" ? blobObj.name : "attachment.png",
          getUploadValidationOptions()
        );

        const saved = await getStorage().savePendingBlob(validated);
        return jsonResponse(
          {
            signed_blob_id: saved.signed_blob_id,
            filename: validated.filename,
            content_type: validated.content_type,
            byte_size: validated.byte_size,
            dimensions: validated.dimensions
          },
          201,
          corsHeaders
        );
      } catch (err) {
        if (err instanceof UploadValidationError) {
          return jsonResponse({ error: err.message }, err.status, corsHeaders);
        }
        return jsonResponse(
          { error: (err as Error).message || "Invalid attachment upload" },
          422,
          corsHeaders
        );
      }
    }

    if (parsedRoute.kind === "static" && parsedRoute.name === "feedback" && method === "GET") {
      const auth = await checkSubmissionAuth(request);
      if (!auth.ok) {
        return jsonResponse({ error: auth.error }, auth.status, corsHeaders);
      }

      const rawLimitParam = url.searchParams.get("limit");
      const parsedLimit = rawLimitParam ? Number(rawLimitParam) : 20;
      const limit = Math.max(
        1,
        Math.min(50, Number.isFinite(parsedLimit) ? Math.trunc(parsedLimit) : 20)
      );

      const secret = getOwnershipSecret();
      const rawTokens = combineRequestOwnershipTokens(request, url);
      const tokenIds = extractVerifiedOwnershipIds(rawTokens, secret);

      const ownRes = await getStorage().listOwnFeedbacks({
        submitter: auth.submitter,
        session_id: extractHashedSessionId(request),
        token_ids: tokenIds,
        limit
      });

      const feedbacks = ownRes.records.map((rec) => {
        const tok =
          findOwnershipTokenFor(rawTokens, rec.id, secret) ??
          generateOwnershipToken(rec.id, secret);
        return serializeOwnFeedback(rec, tok);
      });

      return jsonResponse(
        {
          total_count: ownRes.total,
          total: ownRes.total,
          feedbacks
        },
        200,
        corsHeaders
      );
    }

    if (parsedRoute.kind === "static" && parsedRoute.name === "feedback" && method === "POST") {
      const originCheck = verifyMutationOrigin(request, config.allowedOrigins);
      if (!originCheck.ok) {
        return jsonResponse({ error: originCheck.error }, 403, corsHeaders);
      }

      const auth = await checkSubmissionAuth(request);
      if (!auth.ok) {
        return jsonResponse({ error: auth.error }, auth.status, corsHeaders);
      }

      if (!checkRateLimit(request)) {
        return jsonResponse(
          { error: "Rate limit exceeded. Please try again later." },
          429,
          corsHeaders
        );
      }

      try {
        const rawJson = (await request.json().catch(() => ({}))) as Record<string, unknown>;
        const payload =
          rawJson["feedback"] && typeof rawJson["feedback"] === "object"
            ? asRecord(rawJson["feedback"])
            : asRecord(rawJson);

        const rawElements = Array.isArray(payload["element_references"])
          ? payload["element_references"]
          : [];
        const rawAttachments = Array.isArray(payload["attachments"]) ? payload["attachments"] : [];

        const maxAttachments = config.limits?.maxAttachments ?? 10;
        const maxElements = config.limits?.maxElementReferences ?? 10;

        if (rawAttachments.length > maxAttachments) {
          return jsonResponse(
            {
              error: `Attachments count (${rawAttachments.length}) exceeds maximum allowed (${maxAttachments})`
            },
            422,
            corsHeaders
          );
        }

        if (rawElements.length > maxElements) {
          return jsonResponse(
            {
              error: `Element references count (${rawElements.length}) exceeds maximum allowed (${maxElements})`
            },
            422,
            corsHeaders
          );
        }

        const sanitizedElements = rawElements.map((el) => sanitizeElementReference(el));
        const uploadOpts = getUploadValidationOptions();
        const storage = getStorage();

        const preparedAttachments: CreateAttachmentInput[] = [];
        for (const rawAtt of rawAttachments) {
          preparedAttachments.push(
            await parseNewAttachmentSpec(asRecord(rawAtt), storage, uploadOpts)
          );
        }

        const messageStr = String(payload["message"] ?? "").trim();
        const message = messageStr.length > 0 ? messageStr : null;
        const pageUrl = (
          String(payload["page_url"] ?? "").trim() ||
          request.headers.get("referer")?.trim() ||
          ""
        );

        if (!pageUrl) {
          return jsonResponse({ error: "Page url can't be blank" }, 422, corsHeaders);
        }

        if (!message && sanitizedElements.length === 0 && preparedAttachments.length === 0) {
          return jsonResponse(
            {
              error: "Feedback must include a message, an attachment, or a selected DOM element"
            },
            422,
            corsHeaders
          );
        }

        const hostEnv = getEnvironment();
        const sanitizedMeta = sanitizeGenericMetadata(payload["metadata"]);
        sanitizedMeta["environment"] = hostEnv;

        const userAgent =
          String(payload["user_agent"] ?? "").trim() ||
          request.headers.get("user-agent")?.trim() ||
          null;

        const existingSessionToken = extractRawSessionCookie(request);
        const rawSessionToken =
          existingSessionToken ?? crypto.randomBytes(16).toString("hex");
        const hashedSessionId = hashSessionCookieValue(rawSessionToken);

        const created = await storage.createFeedback({
          environment: hostEnv,
          message,
          page_url: pageUrl,
          user_agent: userAgent,
          session_id: hashedSessionId,
          submitter: auth.submitter,
          metadata: sanitizedMeta,
          element_references: sanitizedElements,
          attachments: preparedAttachments
        });

        if (config.onFeedbackCreated) {
          try {
            await config.onFeedbackCreated(created);
          } catch (cbErr) {
            console.error("[context-drop] onFeedbackCreated callback error:", cbErr);
          }
        }

        const ownershipToken = generateOwnershipToken(created.id, getOwnershipSecret());
        const responseHeaders: Record<string, string> = { ...corsHeaders };
        if (!existingSessionToken) {
          responseHeaders["Set-Cookie"] = buildSessionSetCookieHeader(
            rawSessionToken,
            url.protocol === "https:"
          );
        }

        return jsonResponse(
          {
            id: created.id,
            environment: created.environment,
            status: created.status,
            attachments_count: created.attachments.length,
            element_references_count: created.element_references.length,
            ownership_token: ownershipToken,
            feedback: serializeOwnFeedback(created, ownershipToken),
            created_at: created.created_at,
            updated_at: created.updated_at
          },
          201,
          responseHeaders
        );
      } catch (err) {
        if (err instanceof SensitiveElementError || err instanceof UploadValidationError) {
          return jsonResponse({ error: err.message }, err.status, corsHeaders);
        }
        return jsonResponse(
          { error: (err as Error).message || "Failed to process feedback" },
          422,
          corsHeaders
        );
      }
    }

    if (
      parsedRoute.kind === "feedback_item" &&
      (method === "PATCH" || method === "PUT")
    ) {
      const originCheck = verifyMutationOrigin(request, config.allowedOrigins);
      if (!originCheck.ok) {
        return jsonResponse({ error: originCheck.error }, 403, corsHeaders);
      }

      const auth = await checkSubmissionAuth(request);
      if (!auth.ok) {
        return jsonResponse({ error: auth.error }, auth.status, corsHeaders);
      }

      if (!checkRateLimit(request)) {
        return jsonResponse(
          { error: "Rate limit exceeded. Please try again later." },
          429,
          corsHeaders
        );
      }

      const storage = getStorage();
      const existing = await storage.getFeedback(parsedRoute.feedbackId);
      if (!existing || existing.deleted_at) {
        return jsonResponse({ error: "Feedback not found" }, 404, corsHeaders);
      }

      try {
        const rawJson = (await request.json().catch(() => ({}))) as Record<string, unknown>;
        const payload =
          rawJson["feedback"] && typeof rawJson["feedback"] === "object"
            ? asRecord(rawJson["feedback"])
            : asRecord(rawJson);

        const secret = getOwnershipSecret();
        const rawTokens = combineRequestOwnershipTokens(
          request,
          url,
          payload["ownership_token"] ?? rawJson["ownership_token"]
        );
        const tokenIds = extractVerifiedOwnershipIds(rawTokens, secret);

        if (
          !matchesOwnFeedback(existing, {
            submitter: auth.submitter,
            session_id: extractHashedSessionId(request),
            token_ids: tokenIds
          })
        ) {
          return jsonResponse({ error: "Forbidden" }, 403, corsHeaders);
        }

        const hasMessageKey = Object.prototype.hasOwnProperty.call(payload, "message");
        const hasMetadataKey = Object.prototype.hasOwnProperty.call(payload, "metadata");
        const hasElementsKey = Object.prototype.hasOwnProperty.call(payload, "element_references");
        const hasAttachmentsKey = Object.prototype.hasOwnProperty.call(payload, "attachments");

        const rawElements = hasElementsKey
          ? Array.isArray(payload["element_references"])
            ? payload["element_references"]
            : []
          : undefined;
        const rawAttachments = hasAttachmentsKey
          ? Array.isArray(payload["attachments"])
            ? payload["attachments"]
            : []
          : undefined;

        const maxAttachments = config.limits?.maxAttachments ?? 10;
        const maxElements = config.limits?.maxElementReferences ?? 10;

        if (rawAttachments && rawAttachments.length > maxAttachments) {
          return jsonResponse(
            {
              error: `Attachments count (${rawAttachments.length}) exceeds maximum allowed (${maxAttachments})`
            },
            422,
            corsHeaders
          );
        }

        if (rawElements && rawElements.length > maxElements) {
          return jsonResponse(
            {
              error: `Element references count (${rawElements.length}) exceeds maximum allowed (${maxElements})`
            },
            422,
            corsHeaders
          );
        }

        const sanitizedElements = rawElements
          ? rawElements.map((el) => sanitizeElementReference(el))
          : undefined;

        let preparedAttachmentSpecs: UpdateAttachmentSpec[] | undefined;
        if (rawAttachments) {
          const uploadOpts = getUploadValidationOptions();
          const existingAttIds = new Set(existing.attachments.map((a) => String(a.id)));
          preparedAttachmentSpecs = [];

          for (const rawAtt of rawAttachments) {
            const attObj = asRecord(rawAtt);
            const hasNewBinary = Boolean(
              String(attObj["signed_blob_id"] ?? "").trim() ||
                String(attObj["data_url"] ?? attObj["data"] ?? "").trim()
            );
            const existingIdRaw = String(
              attObj["existing_id"] ?? (!hasNewBinary ? attObj["id"] ?? "" : "")
            ).trim();

            if (existingIdRaw) {
              if (!existingAttIds.has(existingIdRaw)) {
                return jsonResponse(
                  { error: "Attachment does not belong to this feedback" },
                  422,
                  corsHeaders
                );
              }
              const hasCustomMeta =
                Object.prototype.hasOwnProperty.call(attObj, "metadata") &&
                typeof attObj["metadata"] === "object" &&
                attObj["metadata"] !== null;
              const sanitizedCustomMeta = hasCustomMeta
                ? sanitizeGenericMetadata(attObj["metadata"])
                : undefined;

              const hasExplicitLinkKey =
                Object.prototype.hasOwnProperty.call(attObj, "element_reference_ref") ||
                Object.prototype.hasOwnProperty.call(attObj, "element_attachment_ref") ||
                Object.prototype.hasOwnProperty.call(attObj, "client_ref");
              const linkedRef = hasExplicitLinkKey
                ? String(
                    attObj["element_reference_ref"] ??
                      attObj["element_attachment_ref"] ??
                      attObj["client_ref"] ??
                      ""
                  ).trim() || null
                : undefined;

              preparedAttachmentSpecs.push({
                kind: "retain",
                existing_id: existingIdRaw,
                element_client_ref: linkedRef,
                metadata: sanitizedCustomMeta,
                update_metadata: hasCustomMeta
              });
            } else {
              const createdSpec = await parseNewAttachmentSpec(attObj, storage, uploadOpts);
              preparedAttachmentSpecs.push({
                kind: "create",
                ...createdSpec
              });
            }
          }
        }

        const nextMessage = hasMessageKey
          ? String(payload["message"] ?? "").trim() || null
          : existing.message;
        const nextElementsCount = sanitizedElements
          ? sanitizedElements.length
          : existing.element_references.length;
        const nextAttachmentsCount = preparedAttachmentSpecs
          ? preparedAttachmentSpecs.length
          : existing.attachments.length;

        if (!nextMessage && nextElementsCount === 0 && nextAttachmentsCount === 0) {
          return jsonResponse(
            {
              error: "Feedback must include a message, an attachment, or a selected DOM element"
            },
            422,
            corsHeaders
          );
        }

        let nextMetadata: Record<string, unknown> | undefined;
        if (hasMetadataKey) {
          nextMetadata = sanitizeGenericMetadata(payload["metadata"]);
          nextMetadata["environment"] = existing.environment;
        }

        const updated = await storage.updateFeedback(existing.id, {
          ...(hasMessageKey ? { message: nextMessage } : {}),
          ...(nextMetadata !== undefined ? { metadata: nextMetadata } : {}),
          ...(sanitizedElements !== undefined ? { element_references: sanitizedElements } : {}),
          ...(preparedAttachmentSpecs !== undefined ? { attachments: preparedAttachmentSpecs } : {})
        });

        if (!updated) {
          return jsonResponse({ error: "Feedback not found" }, 404, corsHeaders);
        }

        if (config.onFeedbackUpdated) {
          try {
            await config.onFeedbackUpdated(updated);
          } catch (cbErr) {
            console.error("[context-drop] onFeedbackUpdated callback error:", cbErr);
          }
        }

        const ownershipToken =
          findOwnershipTokenFor(rawTokens, updated.id, secret) ??
          generateOwnershipToken(updated.id, secret);

        return jsonResponse(
          {
            id: updated.id,
            environment: updated.environment,
            status: updated.status,
            message: updated.message,
            attachments_count: updated.attachments.length,
            element_references_count: updated.element_references.length,
            ownership_token: ownershipToken,
            feedback: serializeOwnFeedback(updated, ownershipToken),
            created_at: updated.created_at,
            updated_at: updated.updated_at
          },
          200,
          corsHeaders
        );
      } catch (err) {
        if (err instanceof SensitiveElementError || err instanceof UploadValidationError) {
          return jsonResponse({ error: err.message }, err.status, corsHeaders);
        }
        return jsonResponse(
          { error: (err as Error).message || "Failed to update feedback" },
          422,
          corsHeaders
        );
      }
    }

    if (parsedRoute.kind === "feedback_item" && method === "DELETE") {
      const originCheck = verifyMutationOrigin(request, config.allowedOrigins);
      if (!originCheck.ok) {
        return jsonResponse({ error: originCheck.error }, 403, corsHeaders);
      }

      const auth = await checkSubmissionAuth(request);
      if (!auth.ok) {
        return jsonResponse({ error: auth.error }, auth.status, corsHeaders);
      }

      if (!checkRateLimit(request)) {
        return jsonResponse(
          { error: "Rate limit exceeded. Please try again later." },
          429,
          corsHeaders
        );
      }

      const storage = getStorage();
      const existing = await storage.getFeedback(parsedRoute.feedbackId);
      if (!existing || existing.deleted_at) {
        return jsonResponse({ error: "Feedback not found" }, 404, corsHeaders);
      }

      const rawJson = (await request.json().catch(() => ({}))) as Record<string, unknown>;
      const payload =
        rawJson["feedback"] && typeof rawJson["feedback"] === "object"
          ? asRecord(rawJson["feedback"])
          : asRecord(rawJson);

      const secret = getOwnershipSecret();
      const rawTokens = combineRequestOwnershipTokens(
        request,
        url,
        payload["ownership_token"] ?? rawJson["ownership_token"]
      );
      const tokenIds = extractVerifiedOwnershipIds(rawTokens, secret);

      if (
        !matchesOwnFeedback(existing, {
          submitter: auth.submitter,
          session_id: extractHashedSessionId(request),
          token_ids: tokenIds
        })
      ) {
        return jsonResponse({ error: "Forbidden" }, 403, corsHeaders);
      }

      const deleted = await storage.softDeleteFeedback(existing.id);
      if (!deleted) {
        return jsonResponse({ error: "Feedback not found" }, 404, corsHeaders);
      }

      if (config.onFeedbackDeleted) {
        try {
          await config.onFeedbackDeleted(deleted);
        } catch (cbErr) {
          console.error("[context-drop] onFeedbackDeleted callback error:", cbErr);
        }
      }

      return jsonResponse(
        {
          id: deleted.id,
          deleted: true,
          deleted_at: deleted.deleted_at ?? new Date().toISOString()
        },
        200,
        corsHeaders
      );
    }

    if (parsedRoute.kind === "feedback_attachment" && method === "GET") {
      const auth = await checkSubmissionAuth(request);
      if (!auth.ok) {
        return new Response("Forbidden", { status: auth.status, headers: corsHeaders });
      }

      const storage = getStorage();
      const existing = await storage.getFeedback(parsedRoute.feedbackId);
      if (!existing || existing.deleted_at) {
        return new Response("Not Found", { status: 404, headers: corsHeaders });
      }

      const secret = getOwnershipSecret();
      const rawTokens = combineRequestOwnershipTokens(request, url);
      const tokenIds = extractVerifiedOwnershipIds(rawTokens, secret);

      if (
        !matchesOwnFeedback(existing, {
          submitter: auth.submitter,
          session_id: extractHashedSessionId(request),
          token_ids: tokenIds
        })
      ) {
        return new Response("Forbidden", { status: 403, headers: corsHeaders });
      }

      const attMeta = existing.attachments.find(
        (a) => String(a.id) === String(parsedRoute.attachmentId)
      );
      if (!attMeta) {
        return new Response("Not Found", { status: 404, headers: corsHeaders });
      }

      const bytes = await storage.getAttachmentBytes(attMeta.id);
      if (!bytes) {
        return new Response("Not Found", { status: 404, headers: corsHeaders });
      }

      const bodyCopy = new Uint8Array(bytes.byteLength);
      bodyCopy.set(bytes);

      return new Response(bodyCopy, {
        status: 200,
        headers: {
          "Content-Type": attMeta.content_type || "image/png",
          "Cache-Control": "private, max-age=3600",
          "Content-Security-Policy": "default-src 'none'; sandbox",
          ...corsHeaders
        }
      });
    }

    return jsonResponse({ error: "Not Found" }, 404, corsHeaders);
  };

  return Object.assign(handler, {
    resetRateLimits: () => rateLimitStore.clear(),
    getStorage
  });
}

/**
 * Next.js App Router route handler factory (`app/api/context-drop/[[...path]]/route.ts`).
 *
 * @example
 * ```ts
 * import { createContextDropNextHandler } from "context-drop/next/server";
 * export const { GET, POST, PATCH, PUT, DELETE, OPTIONS } = createContextDropNextHandler();
 * ```
 */
export function createContextDropNextHandler(config: ContextDropServerConfig = {}) {
  const fetchHandler = createContextDropFetchHandler(config);

  return {
    GET: (request: Request) => fetchHandler(request),
    POST: (request: Request) => fetchHandler(request),
    PATCH: (request: Request) => fetchHandler(request),
    PUT: (request: Request) => fetchHandler(request),
    DELETE: (request: Request) => fetchHandler(request),
    OPTIONS: (request: Request) => fetchHandler(request),
    handler: fetchHandler
  };
}

export interface PagesApiRequestLike extends AsyncIterable<Uint8Array | string> {
  method?: string;
  url?: string;
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
}

export interface PagesApiResponseLike {
  statusCode: number;
  setHeader(name: string, value: string): unknown;
  end(chunk?: Uint8Array | string): unknown;
}

/**
 * Next.js Pages Router / Node HTTP handler factory (`pages/api/context-drop/[[...path]].ts`).
 *
 * Works both with `export const config = { api: { bodyParser: false } }` (required for
 * multipart `/attachments` uploads) and with pre-parsed JSON bodies.
 */
export function createContextDropPagesHandler(config: ContextDropServerConfig = {}) {
  const fetchHandler = createContextDropFetchHandler(config);

  return async function pagesApiHandler(
    req: PagesApiRequestLike,
    res: PagesApiResponseLike
  ): Promise<void> {
    const proto =
      (typeof req.headers["x-forwarded-proto"] === "string"
        ? req.headers["x-forwarded-proto"].split(",")[0]?.trim()
        : undefined) || "http";
    const host =
      (typeof req.headers["x-forwarded-host"] === "string"
        ? req.headers["x-forwarded-host"].split(",")[0]?.trim()
        : undefined) ||
      req.headers.host ||
      "localhost";
    const fullUrl = `${proto}://${host}${req.url || "/"}`;

    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) {
      if (Array.isArray(v)) {
        for (const item of v) headers.append(k, item);
      } else if (typeof v === "string") {
        headers.set(k, v);
      }
    }

    const method = (req.method || "GET").toUpperCase();
    let bodyBuffer: Buffer | undefined;

    if (method !== "GET" && method !== "HEAD" && method !== "OPTIONS") {
      if (req.body !== undefined && req.body !== null) {
        if (Buffer.isBuffer(req.body)) {
          bodyBuffer = req.body;
        } else if (typeof req.body === "string") {
          bodyBuffer = Buffer.from(req.body, "utf8");
        } else {
          bodyBuffer = Buffer.from(JSON.stringify(req.body), "utf8");
        }
      } else {
        const chunks: Buffer[] = [];
        for await (const chunk of req) {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        }
        bodyBuffer = Buffer.concat(chunks);
      }
    }

    const webRequest = new Request(fullUrl, {
      method,
      headers,
      body: bodyBuffer ? new Uint8Array(bodyBuffer) : undefined
    });

    const webResponse = await fetchHandler(webRequest);

    res.statusCode = webResponse.status;
    webResponse.headers.forEach((value, key) => {
      res.setHeader(key, value);
    });

    const responseBuffer = Buffer.from(await webResponse.arrayBuffer());
    res.end(responseBuffer);
  };
}
