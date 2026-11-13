import type {
  BoundingRectSnapshot,
  SelectionMode,
  ViewportSnapshot,
  WidgetPosition
} from "../../app/javascript/context_drop/types.ts";

export const VERSION = "0.2.0";

export type FeedbackStatus = "new" | "reviewed" | "resolved" | "dismissed";

export const FEEDBACK_STATUSES: readonly FeedbackStatus[] = [
  "new",
  "reviewed",
  "resolved",
  "dismissed"
] as const;

export interface SubmitterIdentity {
  type?: string | null;
  id?: string | number | null;
  label?: string | null;
}

export interface StoredElementReference {
  id: number | string;
  feedback_id: number | string;
  client_ref: string | null;
  tag_name: string;
  selector: string;
  dom_path: string | null;
  text_content: string | null;
  attributes_snapshot: Record<string, string>;
  bounding_rect: Partial<BoundingRectSnapshot>;
  viewport: Partial<ViewportSnapshot>;
  metadata: Record<string, unknown>;
  captured_at: string;
}

export interface StoredAttachment {
  id: number | string;
  feedback_id: number | string;
  element_reference_id: number | string | null;
  attachment_type: "image" | "screenshot";
  filename: string | null;
  content_type: string | null;
  byte_size: number | null;
  blob_key?: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface StoredFeedbackRecord {
  id: number | string;
  environment: string;
  status: FeedbackStatus;
  message: string | null;
  page_url: string;
  user_agent: string | null;
  session_id: string | null;
  submitter: SubmitterIdentity;
  metadata: Record<string, unknown>;
  element_references: StoredElementReference[];
  attachments: StoredAttachment[];
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
}

export interface FeedbackSummaryItem {
  id: number | string;
  qualified_id?: string;
  environment: string;
  status: FeedbackStatus;
  message: string | null;
  page_url: string;
  submitter: string;
  attachments_count: number;
  element_references_count: number;
  element_selectors: string[];
  created_at: string;
  deleted?: boolean;
  deleted_at?: string | null;
}

export interface FeedbackQueryFilter {
  environment?: string | null;
  status?: FeedbackStatus | null;
  page_url?: string | null;
  query?: string | null;
  limit?: number;
  offset?: number;
  include_deleted?: boolean;
}

export interface ValidatedUpload {
  data: Uint8Array;
  filename: string;
  content_type: string;
  byte_size: number;
  dimensions: [number, number] | null;
}

export interface SanitizedElementInput {
  client_ref: string | null;
  tag_name: string;
  selector: string;
  dom_path: string | null;
  text_content: string | null;
  attributes_snapshot: Record<string, string>;
  bounding_rect: Partial<BoundingRectSnapshot>;
  viewport: Partial<ViewportSnapshot>;
  metadata: Record<string, unknown>;
  captured_at: string;
}

export interface CreateAttachmentInput {
  attachment_type: "image" | "screenshot";
  element_client_ref?: string | null;
  filename: string | null;
  content_type: string | null;
  byte_size: number | null;
  data: Uint8Array | null;
  metadata: Record<string, unknown>;
}

export interface RetainedAttachmentInput {
  existing_id: string | number;
  element_client_ref?: string | null;
  metadata?: Record<string, unknown>;
  update_metadata?: boolean;
}

export type UpdateAttachmentSpec =
  | ({ kind: "retain" } & RetainedAttachmentInput)
  | ({ kind: "create" } & CreateAttachmentInput);

export interface CreateFeedbackRecordInput {
  environment: string;
  message: string | null;
  page_url: string;
  user_agent: string | null;
  session_id: string | null;
  submitter: SubmitterIdentity;
  metadata: Record<string, unknown>;
  element_references: SanitizedElementInput[];
  attachments: CreateAttachmentInput[];
}

export interface UpdateFeedbackRecordInput {
  message?: string | null;
  metadata?: Record<string, unknown>;
  element_references?: SanitizedElementInput[];
  attachments?: UpdateAttachmentSpec[];
}

export interface OwnFeedbackLookupQuery {
  submitter?: SubmitterIdentity | null;
  session_id?: string | null;
  token_ids?: Array<string | number>;
  limit?: number;
}

export interface BlobStorageAdapter {
  putBlob(input: {
    key: string;
    data: Uint8Array;
    contentType: string;
    filename: string;
  }): Promise<{ key: string }>;
  getBlob(key: string): Promise<Uint8Array | null>;
  deleteBlob?(key: string): Promise<void>;
}

export interface StorageAdapter {
  savePendingBlob(blob: ValidatedUpload): Promise<{ signed_blob_id: string }>;
  consumePendingBlob(signedBlobId: string): Promise<ValidatedUpload | null>;
  createFeedback(input: CreateFeedbackRecordInput): Promise<StoredFeedbackRecord>;
  listFeedbacks(filter: FeedbackQueryFilter): Promise<{
    total: number;
    records: FeedbackSummaryItem[];
  }>;
  listOwnFeedbacks(query: OwnFeedbackLookupQuery): Promise<{
    total: number;
    records: StoredFeedbackRecord[];
  }>;
  getFeedback(id: string | number): Promise<StoredFeedbackRecord | null>;
  updateFeedback(
    id: string | number,
    input: UpdateFeedbackRecordInput
  ): Promise<StoredFeedbackRecord | null>;
  softDeleteFeedback(id: string | number): Promise<StoredFeedbackRecord | null>;
  getAttachment(attachmentId: string | number): Promise<{
    attachment: StoredAttachment;
    element_selector: string | null;
    data: Uint8Array | null;
  } | null>;
  getAttachmentBytes(attachmentId: string | number): Promise<Uint8Array | null>;
  updateFeedbackStatus(
    id: string | number,
    status: FeedbackStatus
  ): Promise<{ previous_status: FeedbackStatus; feedback: StoredFeedbackRecord } | null>;
  getOwnershipSecret?(): Buffer;
}

export interface RemoteMcpEnvironmentConfig {
  url: string;
  apiKey?: string;
  headers?: Record<string, string>;
  allowInsecureHttp?: boolean;
}

export interface ContextDropServerConfig {
  enabled?: boolean;
  environment?: string;
  position?: WidgetPosition;
  placeholder?: string;
  selectionMode?: "auto" | SelectionMode;
  allowAnonymous?: boolean;
  allowedOrigins?: Array<string | RegExp>;
  ownershipSecret?: string;
  storage?: StorageAdapter;
  storageDir?: string;
  features?: {
    elementSelection?: boolean;
    screenshotCapture?: boolean;
    elementCapturePadding?: number;
    smartCapturePadding?: number;
  };
  limits?: {
    maxAttachments?: number;
    maxElementReferences?: number;
    maxAttachmentSize?: number;
    allowedContentTypes?: string[];
    maxImageDimensions?: [number, number];
  };
  privacy?: {
    excludedSelectors?: string[];
  };
  rateLimit?:
    | {
        maxRequests: number;
        periodSeconds: number;
      }
    | false;
  resolveSubmitter?: (request: Request) => Promise<SubmitterIdentity | null> | SubmitterIdentity | null;
  authorizeSubmission?: (
    request: Request,
    submitter: SubmitterIdentity | null
  ) => Promise<boolean> | boolean;
  onFeedbackCreated?: (feedback: StoredFeedbackRecord) => Promise<void> | void;
  onFeedbackUpdated?: (feedback: StoredFeedbackRecord) => Promise<void> | void;
  onFeedbackDeleted?: (feedback: StoredFeedbackRecord) => Promise<void> | void;
  mcp?: {
    enabled?: boolean;
    apiKey?: string;
    authorize?: (request: Request) => Promise<boolean> | boolean;
    environments?: Record<string, RemoteMcpEnvironmentConfig>;
  };
}
