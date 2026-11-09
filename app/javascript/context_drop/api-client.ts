import type {
  FeedbackSubmissionPayload,
  FeedbackSubmissionResponse,
  WidgetConfig
} from "./types.ts";

export class ContextDropApiClient {
  private baseUrl: string;

  constructor(baseUrl: string = "/context_drop") {
    this.baseUrl = baseUrl.replace(/\/+$/, "") || "/context_drop";
  }

  public getCsrfToken(): string | null {
    if (typeof document === "undefined") return null;
    const meta = document.querySelector('meta[name="csrf-token"]');
    return meta ? meta.getAttribute("content") : null;
  }

  public async fetchConfig(): Promise<WidgetConfig> {
    const response = await fetch(`${this.baseUrl}/config`, {
      method: "GET",
      credentials: "same-origin",
      headers: {
        Accept: "application/json"
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch ContextDrop config (${response.status})`);
    }

    return (await response.json()) as WidgetConfig;
  }

  public async uploadAttachment(file: Blob, filename: string): Promise<{ signed_blob_id: string }> {
    const formData = new FormData();
    formData.append("file", file, filename);

    const headers: Record<string, string> = {
      Accept: "application/json"
    };
    const csrf = this.getCsrfToken();
    if (csrf) {
      headers["X-CSRF-Token"] = csrf;
    }

    const response = await fetch(`${this.baseUrl}/attachments`, {
      method: "POST",
      credentials: "same-origin",
      headers,
      body: formData
    });

    if (!response.ok) {
      const errBody = await response.json().catch(() => ({}));
      throw new Error((errBody as { error?: string }).error || `Upload failed (${response.status})`);
    }

    return (await response.json()) as { signed_blob_id: string };
  }

  public async submitFeedback(payload: FeedbackSubmissionPayload): Promise<FeedbackSubmissionResponse> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json"
    };
    const csrf = this.getCsrfToken();
    if (csrf) {
      headers["X-CSRF-Token"] = csrf;
    }

    const response = await fetch(`${this.baseUrl}/feedback`, {
      method: "POST",
      credentials: "same-origin",
      headers,
      body: JSON.stringify({ feedback: payload })
    });

    if (!response.ok) {
      const errBody = await response.json().catch(() => ({}));
      throw new Error((errBody as { error?: string }).error || `Submission failed (${response.status})`);
    }

    return (await response.json()) as FeedbackSubmissionResponse;
  }
}
