import type { McpEventOccurrencePayload } from "../events/types.ts";

export const MAX_MCP_SSE_SUBSCRIBERS = 50;

const subscribers = new Set<(payload: McpEventOccurrencePayload) => void>();

export function subscribeMcpEventStream(
  listener: (payload: McpEventOccurrencePayload) => void
): (() => void) | null {
  if (subscribers.size >= MAX_MCP_SSE_SUBSCRIBERS) {
    return null;
  }
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
