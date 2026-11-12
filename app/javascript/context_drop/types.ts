export type WidgetPosition = "bottom_right" | "bottom_left" | "top_right" | "top_left";

export type WidgetSurfaceMode = "agent" | "feedback";

export type SelectionMode = "smart" | "verbose";

export interface BoundingRectSnapshot {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ViewportSnapshot {
  width: number;
  height: number;
}

export interface ElementReferenceSnapshot {
  client_ref: string;
  tag_name: string;
  selector: string;
  dom_path: string;
  text_content: string | null;
  attributes_snapshot: Record<string, string>;
  bounding_rect: BoundingRectSnapshot;
  viewport: ViewportSnapshot;
  metadata: Record<string, unknown>;
  captured_at: string;
}

export type ElementCandidateRelation = "target" | "overlap" | "ancestor" | "child";

export interface ElementCandidateInfo {
  element: Element;
  tagName: string;
  selector: string;
  domPath: string;
  textPreview: string | null;
  friendlyLabel?: string;
  componentKind?: string;
  rect: BoundingRectSnapshot;
  relation: ElementCandidateRelation;
  depth: number;
}

export interface SmartComponentDescription {
  element: Element;
  label: string;
  kind: string;
  name: string | null;
  promotedFromLeaf: boolean;
}

export interface PendingAttachmentItem {
  id: string;
  attachment_type: "image" | "screenshot";
  label: string;
  preview_url: string;
  blob?: Blob;
  signed_blob_id?: string;
  data_url?: string;
  filename: string;
  element_reference_ref?: string;
  metadata: Record<string, unknown>;
}

export interface SessionFeedbackEntry {
  id: number | string;
  message: string;
  createdAt: string;
  elements: ElementReferenceSnapshot[];
  attachments: Array<{
    id: string;
    label: string;
    preview_url: string;
    attachment_type: "image" | "screenshot";
  }>;
}

export interface ContextDropApiClientOptions {
  credentials?: RequestCredentials;
  headers?: Record<string, string>;
}

export interface WidgetConfig {
  enabled: boolean;
  environment?: string;
  position: WidgetPosition;
  placeholder: string;
  csrf_token?: string | null;
  agent?: {
    enabled: boolean;
  };
  features: {
    element_selection: boolean;
    selection_mode?: SelectionMode;
    screenshot_capture: boolean;
    element_capture_padding: number;
    smart_capture_padding?: number;
  };
  limits: {
    max_attachments: number;
    max_element_references: number;
    max_attachment_size: number;
    allowed_content_types: string[];
    max_image_dimensions: [number, number];
  };
  privacy: {
    excluded_selectors: string[];
  };
}

export interface FeedbackSubmissionPayload {
  message: string;
  page_url: string;
  user_agent: string;
  metadata: Record<string, unknown>;
  element_references: ElementReferenceSnapshot[];
  attachments: Array<{
    attachment_type: "image" | "screenshot";
    filename: string;
    signed_blob_id?: string;
    data_url?: string;
    element_reference_ref?: string;
    metadata: Record<string, unknown>;
  }>;
}

export interface FeedbackSubmissionResponse {
  id: number;
  environment?: string;
  status: string;
  attachments_count: number;
  element_references_count: number;
  created_at: string;
}

export interface AgentProviderInfo {
  id: string;
  label: string;
  configured: boolean;
  source: "vault" | "env" | "local_no_key" | null;
  env_var_hint: string;
  masked_key: string | null;
  model: string;
  default_model: string;
  models: string[];
  supports_base_url: boolean;
  base_url?: string | null;
}

export interface AgentEnvironmentInfo {
  name: string;
  type: string;
  host_env?: string;
  url?: string;
}

export interface AgentStatusResponse {
  enabled: boolean;
  environment: string;
  workspace_name: string;
  mcp_environments: AgentEnvironmentInfo[];
  active_provider: string;
  providers: AgentProviderInfo[];
}

export interface AgentKeysUpdatePayload {
  provider: string;
  api_key?: string;
  model?: string;
  base_url?: string;
  make_active?: boolean;
}

export interface AgentKeysUpdateResponse {
  active_provider: string;
  providers: AgentProviderInfo[];
}

export interface AgentToolTrace {
  name: string;
  summary: string;
  status: "ok" | "error";
}

export interface ProposedFileEdit {
  id: string;
  path: string;
  summary: string;
  is_new_file: boolean;
  diff: string;
  added_lines: number;
  removed_lines: number;
  status: "pending" | "applied" | "rejected" | "reverted";
  created_at: string;
}

export interface AgentChatTurnInput {
  role: "user" | "assistant";
  content: string;
}

export interface AgentChatRequestPayload {
  messages: AgentChatTurnInput[];
  page_url: string;
  element_references: ElementReferenceSnapshot[];
  attachments: Array<{
    attachment_type: "image" | "screenshot";
    filename: string;
    data_url?: string;
  }>;
  provider?: string;
  model?: string;
}

export interface AgentChatResponse {
  reply: string;
  provider: string;
  model: string;
  tool_calls: AgentToolTrace[];
  proposed_edits: ProposedFileEdit[];
}

export interface AgentChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  elements?: ElementReferenceSnapshot[];
  attachments?: Array<{
    id: string;
    label: string;
    preview_url: string;
    attachment_type: "image" | "screenshot";
  }>;
  toolCalls?: AgentToolTrace[];
  proposedEdits?: ProposedFileEdit[];
  provider?: string;
  model?: string;
}

export interface CrossEnvFeedbackItem {
  id: number | string;
  qualified_id?: string;
  environment: string;
  message: string;
  page_url: string;
  status: string;
  primary_selector?: string | null;
  element_references_count: number;
  attachments_count: number;
  created_at: string;
}

export interface CrossEnvFeedbackListResponse {
  environment_filter?: string;
  total_count: number;
  environments_queried?: string[];
  errors?: Array<{ environment: string; error: string }>;
  feedbacks: CrossEnvFeedbackItem[];
}
