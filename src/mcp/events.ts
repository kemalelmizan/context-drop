import crypto from "node:crypto";
import {
  FEEDBACK_EVENT_NAMES,
  type FeedbackEventName,
  type McpEventSubscriptionRecord
} from "../events/types.ts";
import type { LocalEventStore } from "../events/local-event-store.ts";
import { validateHttpsCallbackUrl } from "../notifications/webhook-client.ts";

export const MCP_EVENTS_EXTENSION_ID = "io.modelcontextprotocol/events";
export const MCP_EVENTS_POLL_MS = 3000;
const SUBSCRIPTION_TTL_HOURS_DEFAULT = 24;

const environmentFilterSchema = {
  type: "object",
  properties: {
    environment: {
      type: "string",
      description: "Optional ContextDrop environment filter (e.g. staging, production)."
    }
  },
  additionalProperties: false
} as const;

const feedbackPayloadSchema = {
  type: "object",
  properties: {
    feedback_id: { type: ["integer", "string"] },
    environment: { type: "string" },
    status: { type: "string" },
    previous_status: { type: ["string", "null"] },
    message: { type: "string" },
    page_url: { type: "string" },
    dashboard_url: { type: "string" }
  },
  required: ["feedback_id", "environment", "status", "page_url"]
} as const;

function eventTypeEntry(name: FeedbackEventName, description: string) {
  return {
    name,
    description,
    inputSchema: environmentFilterSchema,
    payloadSchema: feedbackPayloadSchema,
    delivery: ["poll", "push", "webhook"]
  };
}

export function listMcpEventTypes() {
  return [
    eventTypeEntry("feedback.created", "A new ContextDrop feedback submission was persisted."),
    eventTypeEntry(
      "feedback.updated",
      "Feedback content or attachments were updated without a status transition."
    ),
    eventTypeEntry("feedback.status_changed", "Feedback status changed (triage workflow)."),
    eventTypeEntry("feedback.deleted", "Feedback was soft-deleted.")
  ];
}

export function mcpEventsCapability() {
  return { listChanged: false };
}

export function eventsList() {
  return { events: listMcpEventTypes() };
}

export function eventsPoll(
  store: LocalEventStore,
  params: Record<string, unknown>
): {
  events: ReturnType<LocalEventStore["toMcpPayload"]>[];
  cursor: string | null;
  nextPollMs: number;
  truncated: boolean;
} {
  const name = String(params["name"] ?? "").trim();
  const args = (params["arguments"] as Record<string, unknown>) ?? {};
  const env = String(args["environment"] ?? "").trim() || null;
  const cursor = params["cursor"] != null ? String(params["cursor"]) : null;
  const { events, cursor: nextCursor } = store.listOccurrences({
    name: name || undefined,
    cursor,
    environment: env,
    limit: 50
  });
  return {
    events: events.map((row) => store.toMcpPayload(row)),
    cursor: nextCursor,
    nextPollMs: MCP_EVENTS_POLL_MS,
    truncated: false
  };
}

export function eventsSubscribe(
  store: LocalEventStore,
  params: Record<string, unknown>
): {
  subscriptionId: string;
  expiresAt: string;
  signingSecret: string;
} {
  const name = String(params["name"] ?? "").trim() as FeedbackEventName;
  if (!(FEEDBACK_EVENT_NAMES as readonly string[]).includes(name)) {
    throw new Error(`Unknown event name: ${name}`);
  }
  const callbackUrl = String(params["callbackUrl"] ?? "").trim();
  if (!callbackUrl) throw new Error("callbackUrl is required");
  validateHttpsCallbackUrl(callbackUrl);
  const args = (params["arguments"] as Record<string, unknown>) ?? {};
  const ttlHours = Math.min(
    168,
    Math.max(1, Number(params["ttlHours"] ?? SUBSCRIPTION_TTL_HOURS_DEFAULT))
  );
  const signingSecret = crypto.randomBytes(32).toString("hex");
  const sub: McpEventSubscriptionRecord = store.createSubscription({
    event_name: name,
    arguments: args,
    callback_url: callbackUrl,
    signing_secret: signingSecret,
    ttlHours
  });
  return {
    subscriptionId: sub.subscription_id,
    expiresAt: sub.expires_at,
    signingSecret
  };
}

export function eventsUnsubscribe(
  store: LocalEventStore,
  params: Record<string, unknown>
): { removed: boolean } {
  const subId = String(params["subscriptionId"] ?? "").trim();
  return { removed: store.removeSubscription(subId) };
}