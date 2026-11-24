import type { McpEventOccurrencePayload } from "../events/types.ts";

const subscribers = new Set<(payload: McpEventOccurrencePayload) => void>();

export function subscribeMcpEventStream(
  listener: (payload: McpEventOccurrencePayload) => void
): () => void {
  subscribers.add(listener);
  return () => {
    subscribers.delete(listener);
  };
}

export function broadcastMcpEvent(payload: McpEventOccurrencePayload): void {
  for (const listener of subscribers) {
    try {
      listener(payload);
    } catch {
      // ignore
    }
  }
}