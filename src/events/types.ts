export const FEEDBACK_EVENT_NAMES = [
  "feedback.created",
  "feedback.updated",
  "feedback.status_changed",
  "feedback.deleted"
] as const;

export type FeedbackEventName = (typeof FEEDBACK_EVENT_NAMES)[number];

export interface FeedbackEventData {
  event?: FeedbackEventName;
  feedback_id: number | string;
  environment: string;
  status: string;
  previous_status?: string | null;
  message?: string | null;
  page_url?: string;
  submitter_label?: string | null;
  element_references_count?: number;
  attachments_count?: number;
  created_at?: string;
  updated_at?: string;
  deleted_at?: string | null;
  dashboard_url?: string;
}

export interface StoredEventOccurrence {
  id: number;
  event_id: string;
  name: FeedbackEventName;
  feedback_id: number | string | null;
  data: FeedbackEventData;
  occurred_at: string;
}

export interface McpEventOccurrencePayload {
  eventId: string;
  name: FeedbackEventName;
  timestamp: string;
  cursor: string;
  data: FeedbackEventData;
}

export type NotificationDestinationType = "lark" | "webhook";

export interface NotificationDestinationRecord {
  id: number;
  name: string;
  enabled: boolean;
  destination_type: NotificationDestinationType;
  event_types: FeedbackEventName[];
  settings: Record<string, string>;
  secrets_ciphertext: Record<string, unknown> | null;
  last_delivery_status?: string | null;
  last_delivery_error?: string | null;
  last_delivered_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface McpEventSubscriptionRecord {
  subscription_id: string;
  event_name: FeedbackEventName;
  arguments: Record<string, unknown>;
  callback_url: string;
  signing_secret: string;
  delivery_mode: "webhook";
  expires_at: string;
  last_cursor?: string | null;
  created_at: string;
  updated_at: string;
}