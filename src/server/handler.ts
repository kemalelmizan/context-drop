import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type {
  AssistantChatMode,
  SelectionMode,
  WidgetConfig,
  WidgetPosition
} from "../../app/javascript/context_drop/types.ts";
import {
  AssistantStateStore,
  isChangeSetVisible,
  serializeChangeSetForWidget
} from "../assistant/change-sets.ts";
import {
  renderConfirmationForFeedback,
  renderFeedbackGuidance
} from "../assistant/confirmations.ts";
import {
  isAssistantModelAllowed,
  resolveAssistantCredentials
} from "../assistant/llm-client.ts";
import {
  executeApprovedBuildChangeSet,
  refreshBuildChangeSetStatus,
  runAssistantOrchestratorTurn
} from "../assistant/orchestrator.ts";
import { AssistantToolRegistry } from "../assistant/tools.ts";
import { LocalEventStore } from "../events/local-event-store.ts";
import { mapLifecycleHook, publishFeedbackEvent } from "../events/publisher.ts";
import { FEEDBACK_EVENT_NAMES, type FeedbackEventName } from "../events/types.ts";
import { decryptSecrets, maskSecret, redactSecretsFromText } from "../notifications/secrets.ts";
import { ContextDropMcpDispatcher } from "../mcp/dispatcher.ts";
import { subscribeMcpEventStream } from "../mcp/event-stream-registry.ts";
import { resolveHostEnvironment } from "../mcp/environment-router.ts";
import { deliverOccurrenceToDestinations } from "../notifications/deliverer.ts";
import { LarkDeliveryError, validateLarkApiHost } from "../notifications/lark-client.ts";
import { WebhookDeliveryError, validateHttpsCallbackUrl } from "../notifications/webhook-client.ts";
import { isSafePageUrl, safeExternalHttpUrl } from "./ssrf-guard.ts";
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
const MAX_RATE_LIMIT_BUCKETS = 10_000;
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
  | { kind: "feedback_comments"; feedbackId: string }
  | { kind: "feedback_attachment"; feedbackId: string; attachmentId: string }
  | { kind: "mcp_events_stream" }
  | { kind: "integrations_destinations" }
  | { kind: "integrations_destination_item"; destinationId: string }
  | { kind: "integrations_destination_test"; destinationId: string }
  | { kind: "assistant_status" }
  | { kind: "assistant_turn" }
  | { kind: "assistant_change_set"; changeSetId: string }
  | { kind: "assistant_change_set_approve"; changeSetId: string }
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

function resolveClientIp(
  request: Request,
  trustProxy?: ContextDropServerConfig["trustProxy"]
): string {
  if (typeof trustProxy === "function") {
    const resolved = trustProxy(request)?.trim();
    return resolved || "direct";
  }
  if (trustProxy === true) {
    const xff = request.headers.get("x-forwarded-for");
    if (xff) {
      const hops = xff
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const rightmost = hops[hops.length - 1];
      if (rightmost) return rightmost;
    }
    const realIp = request.headers.get("x-real-ip")?.trim();
    if (realIp) return realIp;
  }
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

  const fbCommentsMatch = /\/feedback\/([^/]+)\/comments$/.exec(clean);
  if (fbCommentsMatch) {
    return {
      kind: "feedback_comments",
      feedbackId: decodeURIComponent(fbCommentsMatch[1]!)
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
  if (clean.endsWith("/mcp/events/stream")) return { kind: "mcp_events_stream" };
  if (clean.endsWith("/mcp")) return { kind: "static", name: "mcp" };

  if (/\/integrations\/destinations\/[^/]+\/test$/.test(clean)) {
    const testMatch = /\/integrations\/destinations\/([^/]+)\/test$/.exec(clean);
    if (testMatch) {
      return {
        kind: "integrations_destination_test",
        destinationId: decodeURIComponent(testMatch[1]!)
      };
    }
  }
  if (/\/integrations\/destinations\/[^/]+$/.test(clean)) {
    const itemMatch = /\/integrations\/destinations\/([^/]+)$/.exec(clean);
    if (itemMatch) {
      return {
        kind: "integrations_destination_item",
        destinationId: decodeURIComponent(itemMatch[1]!)
      };
    }
  }
  if (clean.endsWith("/integrations/destinations")) {
    return { kind: "integrations_destinations" };
  }

  if (clean.endsWith("/assistant/status")) {
    return { kind: "assistant_status" };
  }
  if (clean.endsWith("/assistant/turn")) {
    return { kind: "assistant_turn" };
  }
  const csApproveMatch = /\/assistant\/change_sets\/([^/]+)\/approve$/.exec(clean);
  if (csApproveMatch) {
    return {
      kind: "assistant_change_set_approve",
      changeSetId: decodeURIComponent(csApproveMatch[1]!)
    };
  }
  const csItemMatch = /\/assistant\/change_sets\/([^/]+)$/.exec(clean);
  if (csItemMatch) {
    return {
      kind: "assistant_change_set",
      changeSetId: decodeURIComponent(csItemMatch[1]!)
    };
  }

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

function serializeOwnFeedback(
  record: StoredFeedbackRecord,
  ownershipToken: string,
  options?: { exposeAgentComments?: boolean }
) {
  const elById = new Map<string, StoredFeedbackRecord["element_references"][number]>();
  for (const el of record.element_references) {
    elById.set(String(el.id), el);
  }
  const visibleComments = (record.comments ?? []).filter((c) => {
    if (c.author_type !== "Agent") return true;
    return Boolean(options?.exposeAgentComments);
  });

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
    }),
    comments_count: visibleComments.length,
    comments: visibleComments.map((comment) => ({
      id: comment.id,
      feedback_id: comment.feedback_id,
      author_label: comment.author_label,
      author_type: comment.author_type ?? null,
      body: comment.body,
      attachments: (comment.attachments ?? []).map((att) => ({
        id: att.id,
        attachment_type: att.attachment_type,
        element_reference_id: null,
        element_reference_ref: null,
        filename: att.filename,
        content_type: att.content_type,
        byte_size: att.byte_size,
        metadata: att.metadata ?? {},
        created_at: att.created_at
      })),
      created_at: comment.created_at,
      updated_at: comment.updated_at
    }))
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
  getAssistantStateStore: () => AssistantStateStore;
}

export function createContextDropFetchHandler(
  config: ContextDropServerConfig = {}
): ContextDropFetchHandler {
  const rateLimitStore = new Map<string, RateLimitBucket>();
  const assistantRateLimitStore = new Map<string, RateLimitBucket>();
  const assistantRegistry = new AssistantToolRegistry({
    askTools: config.assistant?.askTools,
    buildTools: config.assistant?.buildTools,
    allowCodeToolsInAsk: config.assistant?.allowCodeToolsInAsk
  });
  const assistantStateStore = new AssistantStateStore({
    dir: config.storageDir ?? null
  });

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

  const isLocalWebhookHttpAllowed = (): boolean => {
    const env = getEnvironment();
    if (env === "production") return false;
    return env === "development" && config.notifications?.allowInsecureWebhooks === true;
  };

  const validateDestinationSettings = (
    destinationType: string,
    enabled: boolean,
    settings: Record<string, string>
  ): string | null => {
    if (destinationType === "lark") {
      const apiHost = (settings["api_host"] ?? "").trim();
      if (apiHost) {
        try {
          validateLarkApiHost(apiHost, {
            allowedHosts: config.notifications?.larkAllowedHosts,
            allowLocalHttp: isLocalWebhookHttpAllowed()
          });
        } catch (err) {
          return err instanceof LarkDeliveryError ? err.message : "Invalid Lark API host";
        }
      }
      if (enabled && !(settings["receive_id"] ?? "").trim()) {
        return "Lark destination requires receive_id";
      }
      return null;
    }
    if (destinationType !== "webhook") return null;
    const url = (settings["url"] ?? "").trim();
    if (!url) {
      return enabled ? "Webhook destination requires an HTTPS url" : null;
    }
    try {
      validateHttpsCallbackUrl(url, { allowLocalHttp: isLocalWebhookHttpAllowed() });
      return null;
    } catch (err) {
      if (err instanceof WebhookDeliveryError) {
        return err.message;
      }
      return "Invalid webhook URL";
    }
  };

  let sharedEventStore: LocalEventStore | null = null;
  const notificationsEnabled = (): boolean => config.notifications?.enabled !== false;

  const getEventStore = (): LocalEventStore | null => {
    if (!notificationsEnabled()) return null;
    if (!sharedEventStore) {
      sharedEventStore = new LocalEventStore({
        dir: config.storageDir,
        ownershipSecret:
          config.ownershipSecret?.trim() ||
          process.env.CONTEXT_DROP_SECRET_KEY?.trim() ||
          process.env.CONTEXT_DROP_SECRET?.trim()
      });
    }
    return sharedEventStore;
  };

  const integrationDashboardPath = (feedbackId: string | number): string => {
    const base = (config.integrations as { dashboardPathPrefix?: string } | undefined)
      ?.dashboardPathPrefix;
    const relPath = base
      ? `${base.replace(/\/$/, "")}/${feedbackId}`
      : `/integrations/feedback/${feedbackId}`;
    const canonicalOrigin = safeExternalHttpUrl(config.publicBaseUrl);
    if (canonicalOrigin) {
      return `${canonicalOrigin.replace(/\/+$/, "")}${relPath.startsWith("/") ? "" : "/"}${relPath}`;
    }
    return relPath;
  };

  const emitFeedbackLifecycleEvent = async (
    hook: "created" | "updated" | "deleted",
    feedback: StoredFeedbackRecord,
    previousStatus?: string | null
  ): Promise<void> => {
    const store = getEventStore();
    if (!store) return;
    const eventName = mapLifecycleHook(hook, feedback, previousStatus);
    await publishFeedbackEvent(store, eventName, feedback, {
      previous_status: previousStatus ?? null,
      dashboard_url: integrationDashboardPath(feedback.id)
    });
  };

  const authorizeIntegrations = async (request: Request): Promise<boolean> => {
    if (config.integrations?.authorize) {
      return Boolean(await config.integrations.authorize(request));
    }
    const expected = (
      process.env.CONTEXT_DROP_INTEGRATIONS_API_KEY ??
      config.mcp?.apiKey ??
      process.env.CONTEXT_DROP_MCP_API_KEY ??
      ""
    ).trim();
    if (!expected) return false;
    const authHeader = request.headers.get("authorization") ?? "";
    const provided = authHeader.toLowerCase().startsWith("bearer ")
      ? authHeader.slice(7).trim()
      : "";
    return timingSafeCompareStrings(provided, expected);
  };

  const serializeDestinationPublic = (
    dest: import("../events/types.ts").NotificationDestinationRecord | null
  ) => {
    if (!dest) return null;
    const store = getEventStore();
    const secrets = store
      ? decryptSecrets(dest.secrets_ciphertext, store.cryptoOptions)
      : {};
    return {
      id: dest.id,
      name: dest.name,
      enabled: dest.enabled,
      destination_type: dest.destination_type,
      event_types: dest.event_types,
      settings: dest.settings,
      masked_secrets: {
        app_id: maskSecret(secrets["app_id"]),
        app_secret: maskSecret(secrets["app_secret"]),
        signing_secret: maskSecret(secrets["signing_secret"])
      },
      last_delivery_status: dest.last_delivery_status ?? null,
      last_delivery_error: dest.last_delivery_error ?? null,
      last_delivered_at: dest.last_delivered_at ?? null,
      created_at: dest.created_at,
      updated_at: dest.updated_at
    };
  };

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

  const isAssistantEnabled = (): boolean => {
    if (config.assistant?.enabled !== undefined) return Boolean(config.assistant.enabled);
    return (process.env.CONTEXT_DROP_ASSISTANT_ENABLED ?? "").trim().toLowerCase() === "true";
  };

  const getResolvedAssistantModes = (envName: string): AssistantChatMode[] => {
    const map = config.assistant?.modesByEnvironment;
    if (map) {
      const explicit = map[envName] ?? map[envName.toLowerCase()];
      if (Array.isArray(explicit)) {
        const valid: AssistantChatMode[] = [];
        for (const m of explicit) {
          const norm = String(m).trim().toLowerCase() as AssistantChatMode;
          if ((norm === "ask" || norm === "build" || norm === "feedback") && !valid.includes(norm)) {
            valid.push(norm);
          }
        }
        return valid;
      }
    }
    return envName === "production" ? ["ask", "feedback"] : ["ask", "build", "feedback"];
  };

  const isAssistantLlmConfigured = (envName: string): boolean => {
    if (!isAssistantEnabled()) return false;
    return (
      resolveAssistantCredentials("ask", config.assistant?.llm, {
        isProduction: envName === "production"
      }) !== null
    );
  };

  const isAnonymousChangeSetsAllowed = (envName: string): boolean => {
    if (config.assistant?.allowAnonymousChangeSets !== undefined) {
      return Boolean(config.assistant.allowAnonymousChangeSets);
    }
    if (envName === "production") return false;
    return envName === "development" || envName === "test";
  };

  const checkAssistantModeAuthorized = async (
    request: Request,
    mode: AssistantChatMode,
    submitter: SubmitterIdentity | null
  ): Promise<boolean> => {
    if (config.assistant?.authorizeMode) {
      return Boolean(await config.assistant.authorizeMode(request, mode, submitter));
    }
    if (mode === "build") {
      const envName = getEnvironment();
      if (envName === "development") return true;
      const roleType = (submitter?.type ?? "").trim().toLowerCase();
      return roleType === "admin" || roleType === "staff";
    }
    return true;
  };

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
        excluded_selectors: excluded,
        persist_ownership_tokens: config.privacy?.persistOwnershipTokens !== false
      },
      assistant: {
        enabled: isAssistantEnabled(),
        modes: getResolvedAssistantModes(envName),
        llm_configured: isAssistantLlmConfigured(envName),
        build: {
          enabled: isAssistantEnabled() && getResolvedAssistantModes(envName).includes("build")
        }
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

  const checkRateLimitInStore = (
    request: Request,
    store: Map<string, RateLimitBucket>,
    limitConfig: ContextDropServerConfig["rateLimit"]
  ): boolean => {
    if (limitConfig === false) return true;
    const maxRequests = limitConfig?.maxRequests ?? 20;
    const periodSeconds = limitConfig?.periodSeconds ?? 3600;
    if (maxRequests <= 0 || periodSeconds <= 0) return true;

    const nowMs = Date.now();
    for (const [k, v] of store.entries()) {
      if (v.expiresAtMs <= nowMs) {
        store.delete(k);
      }
    }

    const ip = resolveClientIp(request, config.trustProxy);
    const windowBucket = Math.floor(nowMs / (periodSeconds * 1000));
    const key = `${ip}:${windowBucket}`;
    const existing = store.get(key);

    if (!existing) {
      while (store.size >= MAX_RATE_LIMIT_BUCKETS) {
        const oldestKey = store.keys().next().value;
        if (oldestKey === undefined) break;
        store.delete(oldestKey);
      }
      store.set(key, {
        count: 1,
        expiresAtMs: (windowBucket + 1) * periodSeconds * 1000
      });
      return true;
    }

    existing.count += 1;
    return existing.count <= maxRequests;
  };

  const checkRateLimit = (request: Request): boolean =>
    checkRateLimitInStore(request, rateLimitStore, config.rateLimit);

  const checkAssistantRateLimit = (request: Request): boolean =>
    checkRateLimitInStore(
      request,
      assistantRateLimitStore,
      config.assistant?.rateLimit !== undefined ? config.assistant.rateLimit : config.rateLimit
    );

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
      localOnly: true,
      eventStore: getEventStore(),
      eventStoreDir: config.storageDir ?? process.env.CONTEXT_DROP_STORAGE_DIR,
      eventStoreOwnershipSecret:
        config.ownershipSecret?.trim() ||
        process.env.CONTEXT_DROP_SECRET_KEY?.trim() ||
        process.env.CONTEXT_DROP_SECRET?.trim()
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

    if (parsedRoute.kind === "mcp_events_stream" && method === "GET") {
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
        return new Response("Not Found", { status: 404 });
      }
      const authHeader = request.headers.get("authorization") ?? "";
      const provided = authHeader.toLowerCase().startsWith("bearer ")
        ? authHeader.slice(7).trim()
        : "";
      if (!expectedApiKey || !timingSafeCompareStrings(provided, expectedApiKey)) {
        return new Response("Unauthorized", { status: 401 });
      }

      const store = getEventStore();
      if (!store) {
        return new Response("Service Unavailable", { status: 503 });
      }

      const encoder = new TextEncoder();
      const bufferedEvents: import("../events/types.ts").McpEventOccurrencePayload[] = [];
      let streamCtrl: ReadableStreamDefaultController<Uint8Array> | null = null;
      const unsubscribe = subscribeMcpEventStream((payload) => {
        if (streamCtrl) {
          streamCtrl.enqueue(
            encoder.encode(`event: mcp-event\ndata: ${JSON.stringify(payload)}\n\n`)
          );
        } else if (bufferedEvents.length < 100) {
          bufferedEvents.push(payload);
        }
      });
      if (!unsubscribe) {
        return new Response("Too Many Requests", { status: 429 });
      }
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          streamCtrl = controller;
          controller.enqueue(encoder.encode("event: ready\ndata: {}\n\n"));
          for (const ev of bufferedEvents.splice(0)) {
            controller.enqueue(
              encoder.encode(`event: mcp-event\ndata: ${JSON.stringify(ev)}\n\n`)
            );
          }
        },
        cancel() {
          streamCtrl = null;
          unsubscribe();
        }
      });
      return new Response(stream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
          "X-Accel-Buffering": "no"
        }
      });
    }

    if (
      parsedRoute.kind === "integrations_destinations" ||
      parsedRoute.kind === "integrations_destination_item" ||
      parsedRoute.kind === "integrations_destination_test"
    ) {
      if (!(await authorizeIntegrations(request))) {
        return jsonResponse({ error: "Forbidden" }, 403);
      }
      const store = getEventStore();
      if (!store) {
        return jsonResponse({ error: "Notifications are disabled" }, 503);
      }

      if (parsedRoute.kind === "integrations_destinations" && method === "GET") {
        const list = await store.listDestinations();
        return jsonResponse({
          destinations: list.map((d) => serializeDestinationPublic(d))
        });
      }

      if (parsedRoute.kind === "integrations_destinations" && method === "POST") {
        const body = JSON.parse(await request.text()) as Record<string, unknown>;
        const destinationType = String(body["destination_type"] ?? "webhook") as "lark" | "webhook";
        const enabled = body["enabled"] !== false;
        const settings = Object.fromEntries(
          Object.entries(asRecord(body["settings"])).map(([k, v]) => [k, String(v)])
        );
        const validationErr = validateDestinationSettings(destinationType, enabled, settings);
        if (validationErr) {
          return jsonResponse({ error: validationErr }, 422);
        }
        const secrets = Object.fromEntries(
          Object.entries(asRecord(body["secrets"])).map(([k, v]) => [k, String(v)])
        );
        const dest = store.createDestination({
          name: String(body["name"] ?? "").trim(),
          enabled,
          destination_type: destinationType,
          event_types: (Array.isArray(body["event_types"])
            ? body["event_types"]
            : ["feedback.created"]
          )
            .map(String)
            .filter((ev) => (FEEDBACK_EVENT_NAMES as readonly string[]).includes(ev)) as FeedbackEventName[],
          settings,
          secrets
        });
        return jsonResponse({ destination: serializeDestinationPublic(dest) }, 201);
      }

      if (parsedRoute.kind === "integrations_destination_item") {
        const id = Number(parsedRoute.destinationId);
        if (method === "GET") {
          const dest = await store.getDestination(id);
          if (!dest) return jsonResponse({ error: "Not found" }, 404);
          return jsonResponse({ destination: serializeDestinationPublic(dest) });
        }
        if (method === "PATCH" || method === "PUT") {
          const existingDest = await store.getDestination(id);
          if (!existingDest) return jsonResponse({ error: "Not found" }, 404);
          const body = JSON.parse(await request.text()) as Record<string, unknown>;
          const nextType =
            body["destination_type"] !== undefined
              ? (String(body["destination_type"]) as "lark" | "webhook")
              : existingDest.destination_type;
          const nextEnabled =
            body["enabled"] !== undefined ? Boolean(body["enabled"]) : existingDest.enabled;
          const nextSettings = body["settings"]
            ? Object.fromEntries(
                Object.entries(asRecord(body["settings"])).map(([k, v]) => [k, String(v)])
              )
            : existingDest.settings;
          const validationErr = validateDestinationSettings(
            nextType,
            nextEnabled,
            nextSettings
          );
          if (validationErr) {
            return jsonResponse({ error: validationErr }, 422);
          }
          const patchSecrets = asRecord(body["secrets"]) as Record<string, string>;
          const updated = store.updateDestination(id, {
            ...(body["name"] !== undefined ? { name: String(body["name"]) } : {}),
            ...(body["enabled"] !== undefined ? { enabled: Boolean(body["enabled"]) } : {}),
            ...(body["destination_type"] !== undefined
              ? { destination_type: String(body["destination_type"]) as "lark" | "webhook" }
              : {}),
            ...(Array.isArray(body["event_types"])
              ? { event_types: body["event_types"].map(String) as FeedbackEventName[] }
              : {}),
            ...(body["settings"]
              ? {
                  settings: nextSettings
                }
              : {}),
            ...(Object.keys(patchSecrets).length > 0 ? { secrets: patchSecrets } : {})
          });
          if (!updated) return jsonResponse({ error: "Not found" }, 404);
          return jsonResponse({ destination: serializeDestinationPublic(updated) });
        }
        if (method === "DELETE") {
          if (!store.deleteDestination(id)) return jsonResponse({ error: "Not found" }, 404);
          return jsonResponse({ deleted: true });
        }
      }

      if (parsedRoute.kind === "integrations_destination_test" && method === "POST") {
        const id = Number(parsedRoute.destinationId);
        const dest = await store.getDestination(id);
        if (!dest) return jsonResponse({ error: "Not found" }, 404);
        const name = (dest.event_types[0] ?? "feedback.created") as FeedbackEventName;
        const occurrence = store.appendOccurrence({
          event_id: `test:${crypto.randomUUID()}`,
          name,
          feedback_id: null,
          data: {
            feedback_id: 0,
            environment: getEnvironment(),
            status: "new",
            message: "Test notification from ContextDrop integrations API.",
            page_url: "/"
          }
        });
        await deliverOccurrenceToDestinations(store, occurrence, {
          allowLocalHttp: isLocalWebhookHttpAllowed(),
          larkAllowedHosts: config.notifications?.larkAllowedHosts
        });
        const fresh = (await store.getDestination(id))!;
        return jsonResponse({
          status: fresh.last_delivery_status,
          error: fresh.last_delivery_error ?? null
        });
      }

      return jsonResponse({ error: "Method not allowed" }, 405);
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
        return serializeOwnFeedback(rec, tok, {
          exposeAgentComments: config.privacy?.exposeAgentCommentsToSubmitter === true
        });
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
        if (!isSafePageUrl(pageUrl)) {
          return jsonResponse(
            { error: "Page url must be a valid http(s) URL or relative path" },
            422,
            corsHeaders
          );
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
            console.error(
              "[context-drop] onFeedbackCreated callback error:",
              redactSecretsFromText((cbErr as Error)?.message ?? String(cbErr), [
                config.mcp?.apiKey,
                config.ownershipSecret
              ])
            );
          }
        }
        await emitFeedbackLifecycleEvent("created", created);

        const ownershipToken = generateOwnershipToken(created.id, getOwnershipSecret());
        const confirmation = renderConfirmationForFeedback(created, {
          smart: getResolvedSelectionMode(hostEnv) === "smart",
          customTemplates: config.assistant?.feedbackConfirmations
        });
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
            confirmation_message: confirmation.message,
            confirmation_metadata: confirmation.metadata,
            feedback: serializeOwnFeedback(created, ownershipToken, {
              exposeAgentComments: config.privacy?.exposeAgentCommentsToSubmitter === true
            }),
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
      const previousStatus = existing.status;

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
        const hasStatusKey = Object.prototype.hasOwnProperty.call(payload, "status");
        const requestedStatus = hasStatusKey ? String(payload["status"] ?? "").trim() : undefined;

        if (hasStatusKey && requestedStatus !== "reviewed" && requestedStatus !== "dismissed") {
          return jsonResponse(
            { error: `Invalid status '${requestedStatus}'` },
            422,
            corsHeaders
          );
        }

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
          ...(hasStatusKey ? { status: requestedStatus as "reviewed" | "dismissed" } : {}),
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
            console.error(
              "[context-drop] onFeedbackUpdated callback error:",
              redactSecretsFromText((cbErr as Error)?.message ?? String(cbErr), [
                config.mcp?.apiKey,
                config.ownershipSecret
              ])
            );
          }
        }
        await emitFeedbackLifecycleEvent("updated", updated, previousStatus);

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
            feedback: serializeOwnFeedback(updated, ownershipToken, {
              exposeAgentComments: config.privacy?.exposeAgentCommentsToSubmitter === true
            }),
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

    if (parsedRoute.kind === "feedback_comments" && method === "POST") {
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
      const commentPreviousStatus = existing.status;

      try {
        const rawJson = (await request.json().catch(() => ({}))) as Record<string, unknown>;
        const payload =
          rawJson["comment"] && typeof rawJson["comment"] === "object"
            ? asRecord(rawJson["comment"])
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

        const rawAttachments = Array.isArray(payload["attachments"]) ? payload["attachments"] : [];
        const maxAttachments = config.limits?.maxAttachments ?? 10;
        if (rawAttachments.length > maxAttachments) {
          return jsonResponse(
            {
              error: `Attachments count (${rawAttachments.length}) exceeds maximum allowed (${maxAttachments})`
            },
            422,
            corsHeaders
          );
        }

        const uploadOpts = getUploadValidationOptions();
        const preparedAttachments = await Promise.all(
          rawAttachments.map((rawAtt) => parseNewAttachmentSpec(rawAtt, storage, uploadOpts))
        );

        const bodyText = String(payload["body"] ?? "").trim() || null;
        if (!bodyText && preparedAttachments.length === 0) {
          return jsonResponse(
            { error: "Comment must include text or an image attachment" },
            422,
            corsHeaders
          );
        }

        if (!storage.addComment) {
          return jsonResponse(
            { error: "Storage adapter does not support comments" },
            501,
            corsHeaders
          );
        }

        const authorLabel =
          auth.submitter?.label ||
          (auth.submitter?.type && auth.submitter?.id !== undefined && auth.submitter?.id !== null
            ? `${auth.submitter.type}#${auth.submitter.id}`
            : "You");

        const result = await storage.addComment(existing.id, {
          author_type: auth.submitter?.type ?? "User",
          author_label: authorLabel,
          body: bodyText,
          attachments: preparedAttachments,
          status: "updated"
        });

        if (!result) {
          return jsonResponse({ error: "Feedback not found" }, 404, corsHeaders);
        }

        if (config.onFeedbackUpdated) {
          try {
            await config.onFeedbackUpdated(result.feedback);
          } catch (cbErr) {
            console.error(
              "[context-drop] onFeedbackUpdated callback error:",
              redactSecretsFromText((cbErr as Error)?.message ?? String(cbErr), [
                config.mcp?.apiKey,
                config.ownershipSecret
              ])
            );
          }
        }
        await emitFeedbackLifecycleEvent("updated", result.feedback, commentPreviousStatus);

        const ownershipToken =
          findOwnershipTokenFor(rawTokens, result.feedback.id, secret) ??
          generateOwnershipToken(result.feedback.id, secret);

        return jsonResponse(
          {
            id: result.comment.id,
            feedback_id: result.feedback.id,
            status: result.feedback.status,
            comment: result.comment,
            feedback: serializeOwnFeedback(result.feedback, ownershipToken, {
              exposeAgentComments: config.privacy?.exposeAgentCommentsToSubmitter === true
            }),
            created_at: result.comment.created_at
          },
          201,
          corsHeaders
        );
      } catch (err) {
        if (err instanceof SensitiveElementError || err instanceof UploadValidationError) {
          return jsonResponse({ error: err.message }, err.status, corsHeaders);
        }
        return jsonResponse(
          { error: (err as Error).message || "Failed to add comment" },
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
          console.error(
            "[context-drop] onFeedbackDeleted callback error:",
            redactSecretsFromText((cbErr as Error)?.message ?? String(cbErr), [
              config.mcp?.apiKey,
              config.ownershipSecret
            ])
          );
        }
      }
      await emitFeedbackLifecycleEvent("deleted", deleted);

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

      const allFeedbackAttachments = [
        ...existing.attachments,
        ...(existing.comments ?? []).flatMap((c) => c.attachments ?? [])
      ];
      const attMeta = allFeedbackAttachments.find(
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
          "X-Content-Type-Options": "nosniff",
          "Referrer-Policy": "no-referrer",
          ...corsHeaders
        }
      });
    }

    if (
      parsedRoute.kind === "assistant_status" ||
      parsedRoute.kind === "assistant_turn" ||
      parsedRoute.kind === "assistant_change_set" ||
      parsedRoute.kind === "assistant_change_set_approve"
    ) {
      if (!isAssistantEnabled()) {
        return jsonResponse({ error: "Assistant is disabled" }, 404, corsHeaders);
      }

      const envName = getEnvironment();
      const modes = getResolvedAssistantModes(envName);
      const buildEnabled = modes.includes("build");

      if (parsedRoute.kind === "assistant_status" && method === "GET") {
        return jsonResponse(
          {
            enabled: true,
            modes,
            llm_configured: isAssistantLlmConfigured(envName),
            build_enabled: buildEnabled
          },
          200,
          corsHeaders
        );
      }

      if (parsedRoute.kind === "assistant_change_set" && method === "GET") {
        const auth = await checkSubmissionAuth(request);
        if (!auth.ok) {
          return jsonResponse({ error: auth.error }, auth.status, corsHeaders);
        }
        const record = assistantStateStore.getChangeSet(parsedRoute.changeSetId);
        if (!record) {
          return jsonResponse({ error: "Change set not found" }, 404, corsHeaders);
        }
        if (
          !isChangeSetVisible(record, {
            submitter: auth.submitter,
            sessionId: extractHashedSessionId(request),
            allowAnonymousChangeSets: isAnonymousChangeSetsAllowed(envName)
          })
        ) {
          return jsonResponse({ error: "Forbidden" }, 403, corsHeaders);
        }
        const refreshed = buildEnabled
          ? await refreshBuildChangeSetStatus(record, assistantRegistry, assistantStateStore)
          : record;
        return jsonResponse(
          { change_set: serializeChangeSetForWidget(refreshed) },
          200,
          corsHeaders
        );
      }

      if (parsedRoute.kind === "assistant_change_set_approve" && method === "POST") {
        const originCheck = verifyMutationOrigin(request, config.allowedOrigins);
        if (!originCheck.ok) {
          return jsonResponse({ error: originCheck.error }, 403, corsHeaders);
        }
        const auth = await checkSubmissionAuth(request);
        if (!auth.ok) {
          return jsonResponse({ error: auth.error }, auth.status, corsHeaders);
        }
        if (!checkAssistantRateLimit(request)) {
          return jsonResponse(
            { error: "Rate limit exceeded. Please try again later." },
            429,
            corsHeaders
          );
        }
        if (!buildEnabled) {
          return jsonResponse({ error: "Build mode is not enabled" }, 403, corsHeaders);
        }
        if (!(await checkAssistantModeAuthorized(request, "build", auth.submitter))) {
          return jsonResponse({ error: "Forbidden" }, 403, corsHeaders);
        }

        const record = assistantStateStore.getChangeSet(parsedRoute.changeSetId);
        if (!record) {
          return jsonResponse({ error: "Change set not found" }, 404, corsHeaders);
        }
        if (
          !isChangeSetVisible(record, {
            submitter: auth.submitter,
            sessionId: extractHashedSessionId(request),
            allowAnonymousChangeSets: isAnonymousChangeSetsAllowed(envName)
          })
        ) {
          return jsonResponse({ error: "Forbidden" }, 403, corsHeaders);
        }
        if (record.status !== "draft") {
          return jsonResponse({ error: "Change set is not in draft status" }, 422, corsHeaders);
        }

        const rawBody = (await request.json().catch(() => ({}))) as Record<string, unknown>;
        const rawApproval = String(rawBody["approval_token"] ?? "").trim();
        if (!rawApproval) {
          return jsonResponse({ error: "approval_token is required" }, 422, corsHeaders);
        }

        try {
          const approved = assistantStateStore.approveChangeSet(
            record.id,
            rawApproval,
            getOwnershipSecret()
          );
          const execRes = await executeApprovedBuildChangeSet({
            record: approved,
            buildTarget: config.assistant?.buildTarget,
            registry: assistantRegistry,
            stateStore: assistantStateStore
          });
          if (execRes.is_error) {
            return jsonResponse(
              { error: execRes.error || "Build execution failed", details: execRes },
              422,
              corsHeaders
            );
          }
          return jsonResponse(execRes, 200, corsHeaders);
        } catch (err) {
          return jsonResponse(
            { error: (err as Error).message || "Approval failed" },
            422,
            corsHeaders
          );
        }
      }

      if (parsedRoute.kind === "assistant_turn" && method === "POST") {
        const originCheck = verifyMutationOrigin(request, config.allowedOrigins);
        if (!originCheck.ok) {
          return jsonResponse({ error: originCheck.error }, 403, corsHeaders);
        }
        const auth = await checkSubmissionAuth(request);
        if (!auth.ok) {
          return jsonResponse({ error: auth.error }, auth.status, corsHeaders);
        }
        if (!checkAssistantRateLimit(request)) {
          return jsonResponse(
            { error: "Rate limit exceeded. Please try again later." },
            429,
            corsHeaders
          );
        }

        const rawBody = (await request.json().catch(() => ({}))) as Record<string, unknown>;
        const mode = String(rawBody["mode"] ?? "")
          .trim()
          .toLowerCase() as AssistantChatMode;
        if (!modes.includes(mode)) {
          return jsonResponse(
            { error: `Assistant mode '${mode}' is not enabled for this environment` },
            403,
            corsHeaders
          );
        }
        if (!(await checkAssistantModeAuthorized(request, mode, auth.submitter))) {
          return jsonResponse(
            { error: `Forbidden for assistant mode '${mode}'` },
            403,
            corsHeaders
          );
        }

        const existingSessionToken = extractRawSessionCookie(request);
        const rawSessionToken = existingSessionToken ?? crypto.randomBytes(16).toString("hex");
        const hashedSessionId = hashSessionCookieValue(rawSessionToken);
        const responseHeaders: Record<string, string> = { ...corsHeaders };
        if (!existingSessionToken) {
          responseHeaders["Set-Cookie"] = buildSessionSetCookieHeader(
            rawSessionToken,
            url.protocol === "https:"
          );
        }

        if (mode === "feedback") {
          const fbIdRaw = rawBody["feedback_id"];
          if (fbIdRaw !== undefined && fbIdRaw !== null && String(fbIdRaw).trim() !== "") {
            const storage = getStorage();
            const feedback = await storage.getFeedback(String(fbIdRaw).trim());
            if (!feedback || feedback.deleted_at) {
              return jsonResponse({ error: "Feedback not found" }, 422, responseHeaders);
            }
            const secret = getOwnershipSecret();
            const rawTokens = combineRequestOwnershipTokens(
              request,
              url,
              rawBody["ownership_token"]
            );
            const hasExplicitTokenOrSubmitter =
              (auth.submitter.id !== undefined && auth.submitter.id !== null) ||
              Boolean(auth.submitter.label) ||
              Boolean(findOwnershipTokenFor(rawTokens, feedback.id, secret));
            if (
              !hasExplicitTokenOrSubmitter ||
              !matchesOwnFeedback(feedback, {
                submitter: auth.submitter,
                session_id: null,
                token_ids: extractVerifiedOwnershipIds(rawTokens, secret)
              })
            ) {
              return jsonResponse({ error: "Forbidden" }, 403, responseHeaders);
            }

            const conf = renderConfirmationForFeedback(feedback, {
              smart: getResolvedSelectionMode(envName) === "smart",
              customTemplates: config.assistant?.feedbackConfirmations
            });
            assistantStateStore.appendTurnAudit({
              mode: "feedback",
              session_id: hashedSessionId,
              submitter: auth.submitter,
              tool_names: [],
              duration_ms: 0
            });
            return jsonResponse(
              {
                reply: conf.message,
                mode: "feedback",
                tool_calls: [],
                feedback_confirmation: conf
              },
              200,
              responseHeaders
            );
          }

          const guidance = renderFeedbackGuidance(config.assistant?.feedbackGuidance);
          return jsonResponse(
            {
              reply: guidance.message,
              mode: "feedback",
              tool_calls: [],
              feedback_confirmation: guidance
            },
            200,
            responseHeaders
          );
        }

        const llmCfg = config.assistant?.llm;
        const allowClientOverride = Boolean(llmCfg?.allowClientModelOverride);
        const requestedProvider = allowClientOverride
          ? String(rawBody["provider"] ?? "").trim() || null
          : null;
        const requestedModel = allowClientOverride
          ? String(rawBody["model"] ?? "").trim() || null
          : null;
        if (
          requestedModel &&
          !isAssistantModelAllowed(mode, requestedModel, llmCfg?.allowedModels)
        ) {
          return jsonResponse(
            { error: `Model '${requestedModel}' is not permitted for assistant mode '${mode}'` },
            422,
            responseHeaders
          );
        }

        const creds = resolveAssistantCredentials(mode, llmCfg, {
          providerOverride: requestedProvider,
          modelOverride: requestedModel,
          isProduction: envName === "production"
        });
        if (!creds) {
          return jsonResponse(
            { error: "Assistant LLM is not configured (org BYOK required for Ask and Build)" },
            422,
            responseHeaders
          );
        }
        if (!isAssistantModelAllowed(mode, creds.model, llmCfg?.allowedModels)) {
          return jsonResponse(
            { error: `Model '${creds.model}' is not permitted for assistant mode '${mode}'` },
            422,
            responseHeaders
          );
        }

        const rawElements = Array.isArray(rawBody["element_references"])
          ? rawBody["element_references"]
          : [];
        const rawAttachments = Array.isArray(rawBody["attachments"])
          ? rawBody["attachments"]
          : [];
        const rawMessagesCheck = Array.isArray(rawBody["messages"]) ? rawBody["messages"] : [];
        const maxMessages = llmCfg?.maxMessages ?? 24;
        const maxAttachments = config.limits?.maxAttachments ?? 10;
        const maxElements = config.limits?.maxElementReferences ?? 10;

        if (maxMessages > 0 && rawMessagesCheck.length > maxMessages) {
          return jsonResponse(
            {
              error: `Message count (${rawMessagesCheck.length}) exceeds maximum allowed (${maxMessages})`
            },
            422,
            responseHeaders
          );
        }

        if (rawAttachments.length > maxAttachments) {
          return jsonResponse(
            {
              error: `Attachments count (${rawAttachments.length}) exceeds maximum allowed (${maxAttachments})`
            },
            422,
            responseHeaders
          );
        }
        if (rawElements.length > maxElements) {
          return jsonResponse(
            {
              error: `Element references count (${rawElements.length}) exceeds maximum allowed (${maxElements})`
            },
            422,
            responseHeaders
          );
        }

        let activeChangeSet = null;
        const changeSetIdRaw = rawBody["change_set_id"];
        if (
          changeSetIdRaw !== undefined &&
          changeSetIdRaw !== null &&
          String(changeSetIdRaw).trim() !== ""
        ) {
          activeChangeSet = assistantStateStore.getChangeSet(String(changeSetIdRaw).trim());
          if (!activeChangeSet) {
            return jsonResponse({ error: "Change set not found" }, 404, responseHeaders);
          }
          if (
            !isChangeSetVisible(activeChangeSet, {
              submitter: auth.submitter,
              sessionId: hashedSessionId,
              allowAnonymousChangeSets: isAnonymousChangeSetsAllowed(envName)
            })
          ) {
            return jsonResponse({ error: "Forbidden" }, 403, responseHeaders);
          }
        }

        try {
          const sanitizedElements = rawElements.map((el) => sanitizeElementReference(el));
          const uploadOpts = getUploadValidationOptions();
          const storage = getStorage();
          const images: Array<{ mime_type: string; data: string }> = [];
          const maxInlineBytes = 4 * 1024 * 1024;

          for (const rawAtt of rawAttachments) {
            const parsedAtt = await parseNewAttachmentSpec(asRecord(rawAtt), storage, uploadOpts);
            if (parsedAtt.data && parsedAtt.data.byteLength > maxInlineBytes) {
              throw new UploadValidationError("Inline attachment exceeds 4 MB vision limit");
            }
            if (parsedAtt.data && parsedAtt.content_type) {
              images.push({
                mime_type: parsedAtt.content_type,
                data: Buffer.from(parsedAtt.data).toString("base64")
              });
            }
          }

          const rawMessages = Array.isArray(rawBody["messages"]) ? rawBody["messages"] : [];
          const messages = rawMessages.map((m) => {
            const rec = asRecord(m);
            return {
              role: String(rec["role"] ?? ""),
              content: String(rec["content"] ?? "")
            };
          });
          const pageUrl =
            String(rawBody["page_url"] ?? "").trim() ||
            request.headers.get("referer")?.trim() ||
            "/";

          const readTimeoutMs =
            mode === "ask"
              ? (llmCfg?.timeoutsMs?.ask ?? 45_000)
              : (llmCfg?.timeoutsMs?.build ?? 90_000);
          const maxIterations = Math.max(
            1,
            Math.min(
              25,
              mode === "ask"
                ? (llmCfg?.maxIterations?.ask ?? 4)
                : (llmCfg?.maxIterations?.build ?? 8)
            )
          );

          const turnResult = await runAssistantOrchestratorTurn({
            mode,
            environment: envName,
            smartSelectionMode: getResolvedSelectionMode(envName) === "smart",
            messages,
            pageUrl,
            elements: sanitizedElements,
            images,
            activeChangeSet,
            submitter: auth.submitter,
            sessionId: hashedSessionId,
            allowAnonymousChangeSets: isAnonymousChangeSetsAllowed(envName),
            ownershipSecret: getOwnershipSecret(),
            credentials: creds,
            readTimeoutMs,
            maxIterations,
            maxMessages: llmCfg?.maxMessages,
            maxMessageLength: llmCfg?.maxMessageLength,
            maxTotalMessageChars: llmCfg?.maxTotalMessageChars,
            buildTarget: config.assistant?.buildTarget,
            registry: assistantRegistry,
            stateStore: assistantStateStore,
            transport: llmCfg?.transport
          });

          return jsonResponse(turnResult, 200, responseHeaders);
        } catch (err) {
          if (err instanceof SensitiveElementError || err instanceof UploadValidationError) {
            return jsonResponse({ error: err.message }, err.status, responseHeaders);
          }
          const maybeStatus = (err as Error & { status?: number }).status;
          return jsonResponse(
            { error: (err as Error).message || "Assistant request failed" },
            maybeStatus === 403 ? 403 : 422,
            responseHeaders
          );
        }
      }

      return jsonResponse({ error: "Method not allowed" }, 405, corsHeaders);
    }

    return jsonResponse({ error: "Not Found" }, 404, corsHeaders);
  };

  return Object.assign(handler, {
    resetRateLimits: () => {
      rateLimitStore.clear();
      assistantRateLimitStore.clear();
    },
    getStorage,
    getAssistantStateStore: () => assistantStateStore
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
