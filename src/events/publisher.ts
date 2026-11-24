import crypto from "node:crypto";
import { broadcastMcpEvent } from "../mcp/event-stream-registry.ts";
import {
  deliverOccurrenceToDestinations,
  deliverOccurrenceToMcpSubscriptions
} from "../notifications/deliverer.ts";
import {
  buildFeedbackEventData,
  type LocalEventStore
} from "./local-event-store.ts";
import type { FeedbackEventName } from "./types.ts";
import type { StoredFeedbackRecord } from "../server/types.ts";

export async function publishFeedbackEvent(
  store: LocalEventStore,
  eventName: FeedbackEventName,
  feedback: StoredFeedbackRecord,
  ctx: { previous_status?: string | null; dashboard_url?: string } = {}
): Promise<void> {
  try {
    const data = buildFeedbackEventData(eventName, feedback, ctx);
    const occurrence = store.appendOccurrence({
      event_id: `${eventName}:${feedback.id}:${crypto.randomUUID()}`,
      name: eventName,
      feedback_id: feedback.id,
      data
    });
    await deliverOccurrenceToDestinations(store, occurrence);
    await deliverOccurrenceToMcpSubscriptions(store, occurrence);
    broadcastMcpEvent(store.toMcpPayload(occurrence));
  } catch (err) {
    console.error(`[context-drop] publishFeedbackEvent(${eventName}):`, err);
  }
}

export function mapLifecycleHook(
  hook: "created" | "updated" | "deleted",
  feedback: StoredFeedbackRecord,
  previousStatus?: string | null
): FeedbackEventName {
  if (hook === "created") return "feedback.created";
  if (hook === "deleted") return "feedback.deleted";
  if (previousStatus && previousStatus !== feedback.status) {
    return "feedback.status_changed";
  }
  return "feedback.updated";
}