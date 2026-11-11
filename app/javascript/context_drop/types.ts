export type WidgetPosition = "bottom_right" | "bottom_left" | "top_right" | "top_left";

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
  rect: BoundingRectSnapshot;
  relation: ElementCandidateRelation;
  depth: number;
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

export interface WidgetConfig {
  enabled: boolean;
  position: WidgetPosition;
  placeholder: string;
  csrf_token?: string | null;
  features: {
    element_selection: boolean;
    screenshot_capture: boolean;
    element_capture_padding: number;
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
  status: string;
  attachments_count: number;
  element_references_count: number;
  created_at: string;
}
