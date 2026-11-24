import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { StoredFeedbackRecord } from "../server/types.ts";
import { decryptSecrets, encryptSecrets } from "../notifications/secrets.ts";
import {
  FEEDBACK_EVENT_NAMES,
  type FeedbackEventData,
  type FeedbackEventName,
  type McpEventOccurrencePayload,
  type McpEventSubscriptionRecord,
  type NotificationDestinationRecord,
  type StoredEventOccurrence
} from "./types.ts";

interface EventsStateFile {
  nextOccurrenceId: number;
  nextDestinationId: number;
  occurrences: StoredEventOccurrence[];
  destinations: NotificationDestinationRecord[];
  subscriptions: McpEventSubscriptionRecord[];
}

function defaultState(): EventsStateFile {
  return {
    nextOccurrenceId: 1,
    nextDestinationId: 1,
    occurrences: [],
    destinations: [],
    subscriptions: []
  };
}

export interface LocalEventStoreOptions {
  dir?: string;
  ownershipSecret?: string;
}

export class LocalEventStore {
  readonly storageDir: string;
  readonly cryptoOptions: { secret?: string; storageDir: string };

  private statePath: string;
  private state: EventsStateFile | null = null;

  constructor(options: LocalEventStoreOptions = {}) {
    this.storageDir =
      options.dir ??
      process.env.CONTEXT_DROP_STORAGE_DIR ??
      path.join(process.cwd(), ".context-drop");
    this.cryptoOptions = { secret: options.ownershipSecret, storageDir: this.storageDir };
    this.statePath = path.join(this.storageDir, "events-state.json");
  }

  private load(): EventsStateFile {
    if (this.state) return this.state;
    if (fs.existsSync(this.statePath)) {
      try {
        const parsed = JSON.parse(fs.readFileSync(this.statePath, "utf8")) as EventsStateFile;
        this.state = {
          ...defaultState(),
          ...parsed,
          occurrences: Array.isArray(parsed.occurrences) ? parsed.occurrences : [],
          destinations: Array.isArray(parsed.destinations) ? parsed.destinations : [],
          subscriptions: Array.isArray(parsed.subscriptions) ? parsed.subscriptions : []
        };
        return this.state;
      } catch {
        // fall through
      }
    }
    this.state = defaultState();
    return this.state;
  }

  private persist(): void {
    const state = this.load();
    fs.mkdirSync(this.storageDir, { recursive: true });
    fs.writeFileSync(this.statePath, JSON.stringify(state, null, 2));
  }

  appendOccurrence(input: {
    event_id: string;
    name: FeedbackEventName;
    feedback_id: number | string | null;
    data: FeedbackEventData;
    occurred_at?: string;
  }): StoredEventOccurrence {
    const state = this.load();
    const row: StoredEventOccurrence = {
      id: state.nextOccurrenceId++,
      event_id: input.event_id,
      name: input.name,
      feedback_id: input.feedback_id,
      data: input.data,
      occurred_at: input.occurred_at ?? new Date().toISOString()
    };
    state.occurrences.push(row);
    if (state.occurrences.length > 5000) {
      state.occurrences = state.occurrences.slice(-4000);
    }
    this.persist();
    return row;
  }

  listOccurrences(filter: {
    name?: string;
    cursor?: string | null;
    environment?: string | null;
    limit?: number;
  }): { events: StoredEventOccurrence[]; cursor: string | null } {
    const state = this.load();
    const cursorNum = filter.cursor ? Number(filter.cursor) : 0;
    let rows = state.occurrences.filter((o) => o.id > (Number.isFinite(cursorNum) ? cursorNum : 0));
    if (filter.name) {
      rows = rows.filter((o) => o.name === filter.name);
    }
    if (filter.environment) {
      const env = filter.environment.toLowerCase();
      rows = rows.filter(
        (o) => String(o.data.environment ?? "").toLowerCase() === env
      );
    }
    const limit = Math.min(50, Math.max(1, filter.limit ?? 50));
    rows = rows.slice(0, limit);
    const cursor = rows.length > 0 ? this.cursorFor(rows[rows.length - 1]!) : filter.cursor ?? null;
    return { events: rows, cursor };
  }

  cursorFor(row: StoredEventOccurrence): string {
    return String(row.id);
  }

  toMcpPayload(row: StoredEventOccurrence): McpEventOccurrencePayload {
    return {
      eventId: row.event_id,
      name: row.name,
      timestamp: row.occurred_at,
      cursor: this.cursorFor(row),
      data: row.data
    };
  }

  listDestinations(): Promise<NotificationDestinationRecord[]> {
    return Promise.resolve([...this.load().destinations]);
  }

  getDestination(id: number): Promise<NotificationDestinationRecord | null> {
    const found = this.load().destinations.find((d) => d.id === id);
    return Promise.resolve(found ?? null);
  }

  createDestination(
    input: Omit<
      NotificationDestinationRecord,
      "id" | "created_at" | "updated_at" | "secrets_ciphertext"
    > & { secrets?: Record<string, string> }
  ): NotificationDestinationRecord {
    const state = this.load();
    const now = new Date().toISOString();
    const secrets_ciphertext = input.secrets
      ? encryptSecrets(input.secrets, this.cryptoOptions)
      : null;
    const row: NotificationDestinationRecord = {
      id: state.nextDestinationId++,
      name: input.name,
      enabled: input.enabled,
      destination_type: input.destination_type,
      event_types: input.event_types.filter((e) =>
        (FEEDBACK_EVENT_NAMES as readonly string[]).includes(e)
      ) as FeedbackEventName[],
      settings: input.settings,
      secrets_ciphertext,
      last_delivery_status: null,
      last_delivery_error: null,
      last_delivered_at: null,
      created_at: now,
      updated_at: now
    };
    state.destinations.push(row);
    this.persist();
    return row;
  }

  updateDestination(
    id: number,
    patch: Partial<NotificationDestinationRecord> & { secrets?: Record<string, string> }
  ): NotificationDestinationRecord | null {
    const state = this.load();
    const idx = state.destinations.findIndex((d) => d.id === id);
    if (idx < 0) return null;
    const current = state.destinations[idx]!;
    if (patch.secrets) {
      const merged = {
        ...decryptSecrets(current.secrets_ciphertext, this.cryptoOptions),
        ...patch.secrets
      };
      current.secrets_ciphertext = encryptSecrets(merged, this.cryptoOptions);
    }
    const { secrets: _s, ...rest } = patch;
    Object.assign(current, rest, { updated_at: new Date().toISOString() });
    state.destinations[idx] = current;
    this.persist();
    return current;
  }

  deleteDestination(id: number): boolean {
    const state = this.load();
    const before = state.destinations.length;
    state.destinations = state.destinations.filter((d) => d.id !== id);
    const removed = state.destinations.length < before;
    if (removed) this.persist();
    return removed;
  }

  recordDestinationDelivery(id: number, status: string, error: string | null): Promise<void> {
    const state = this.load();
    const dest = state.destinations.find((d) => d.id === id);
    if (!dest) return Promise.resolve();
    dest.last_delivery_status = status;
    dest.last_delivery_error = error;
    dest.last_delivered_at = new Date().toISOString();
    dest.updated_at = dest.last_delivered_at;
    this.persist();
    return Promise.resolve();
  }

  createSubscription(input: {
    event_name: FeedbackEventName;
    arguments: Record<string, unknown>;
    callback_url: string;
    signing_secret: string;
    ttlHours: number;
  }): McpEventSubscriptionRecord {
    const state = this.load();
    const now = new Date();
    const expires = new Date(now.getTime() + input.ttlHours * 3600_000);
    const row: McpEventSubscriptionRecord = {
      subscription_id: crypto.randomUUID(),
      event_name: input.event_name,
      arguments: input.arguments,
      callback_url: input.callback_url,
      signing_secret: input.signing_secret,
      delivery_mode: "webhook",
      expires_at: expires.toISOString(),
      last_cursor: null,
      created_at: now.toISOString(),
      updated_at: now.toISOString()
    };
    state.subscriptions.push(row);
    this.persist();
    return row;
  }

  removeSubscription(subscriptionId: string): boolean {
    const state = this.load();
    const before = state.subscriptions.length;
    state.subscriptions = state.subscriptions.filter((s) => s.subscription_id !== subscriptionId);
    const removed = state.subscriptions.length < before;
    if (removed) this.persist();
    return removed;
  }

  listActiveSubscriptions(): Promise<McpEventSubscriptionRecord[]> {
    const now = Date.now();
    const state = this.load();
    return Promise.resolve(
      state.subscriptions.filter((s) => Date.parse(s.expires_at) > now)
    );
  }

  updateSubscriptionCursor(subscriptionId: string, cursor: string): Promise<void> {
    const state = this.load();
    const sub = state.subscriptions.find((s) => s.subscription_id === subscriptionId);
    if (!sub) return Promise.resolve();
    sub.last_cursor = cursor;
    sub.updated_at = new Date().toISOString();
    this.persist();
    return Promise.resolve();
  }

  listMcpSubscriptions(limit = 20): McpEventSubscriptionRecord[] {
    const now = Date.now();
    return this.load()
      .subscriptions.filter((s) => Date.parse(s.expires_at) > now)
      .sort((a, b) => Date.parse(a.expires_at) - Date.parse(b.expires_at))
      .slice(0, limit);
  }
}

export function buildFeedbackEventData(
  eventName: FeedbackEventName,
  feedback: StoredFeedbackRecord,
  ctx: { previous_status?: string | null; dashboard_url?: string } = {}
): FeedbackEventData {
  return {
    event: eventName,
    feedback_id: feedback.id,
    environment: feedback.environment,
    status: feedback.status,
    previous_status: ctx.previous_status ?? null,
    message: feedback.message,
    page_url: feedback.page_url,
    submitter_label: formatSubmitter(feedback),
    element_references_count: feedback.element_references?.length ?? 0,
    attachments_count: feedback.attachments?.length ?? 0,
    created_at: feedback.created_at,
    updated_at: feedback.updated_at,
    deleted_at: feedback.deleted_at ?? null,
    dashboard_url: ctx.dashboard_url
  };
}

function formatSubmitter(feedback: StoredFeedbackRecord): string {
  const s = feedback.submitter;
  if (!s) return "Anonymous";
  if (s.label && String(s.label).trim()) return String(s.label).trim();
  if (s.type && s.id != null) return `${s.type}#${s.id}`;
  return "Anonymous";
}