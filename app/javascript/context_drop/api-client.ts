import type {
  FeedbackSubmissionPayload,
  FeedbackSubmissionResponse,
  WidgetConfig
} from "./types.ts";

export class ContextDropApiClient {
  private baseUrl: string;
  private cachedCsrfToken: string | null = null;
  private inFlightConfigPromise: Promise<WidgetConfig> | null = null;

  constructor(baseUrl: string = "/context_drop") {
    this.baseUrl = baseUrl.replace(/\/+$/, "") || "/context_drop";
  }

  public getCsrfToken(): string | null {
    const metaToken = this.getMetaCsrfToken();
    if (metaToken) {
      return metaToken;
    }
    return this.cachedCsrfToken;
  }

  public setCsrfToken(token: string | null): void {
    this.cachedCsrfToken = token ? token.trim() : null;
  }

  private getMetaCsrfToken(): string | null {
    if (typeof document === "undefined") return null;
    const meta = document.querySelector('meta[name="csrf-token"]');
    const content = meta ? meta.getAttribute("content") : null;
    return content && content.trim().length > 0 ? content.trim() : null;
  }

  public async fetchConfig(): Promise<WidgetConfig> {
    if (this.inFlightConfigPromise) {
      return this.inFlightConfigPromise;
    }

    this.inFlightConfigPromise = (async () => {
      try {
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

        const config = (await response.json()) as WidgetConfig;
        if (config && typeof config.csrf_token === "string" && config.csrf_token.trim().length > 0) {
          this.cachedCsrfToken = config.csrf_token.trim();
          if (typeof document !== "undefined") {
            const meta = document.querySelector('meta[name="csrf-token"]');
            if (meta) {
              meta.setAttribute("content", this.cachedCsrfToken);
            }
          }
        }
        return config;
      } finally {
        this.inFlightConfigPromise = null;
      }
    })();

    return this.inFlightConfigPromise;
  }

  public async resolveCsrfToken(forceRefresh = false): Promise<string | null> {
    if (!forceRefresh) {
      const metaToken = this.getMetaCsrfToken();
      if (metaToken) {
        return metaToken;
      }
      if (this.cachedCsrfToken) {
        return this.cachedCsrfToken;
      }
    }

    try {
      const config = await this.fetchConfig();
      if (config && config.csrf_token) {
        return config.csrf_token.trim();
      }
    } catch {
      // Continue and fall back to current token or null
    }

    return this.cachedCsrfToken || this.getMetaCsrfToken();
  }

  private isCsrfError(status: number, message: string): boolean {
    if (status !== 422) return false;
    return /csrf|authenticity/i.test(message);
  }

  private async executeWithCsrfRetry<T>(
    requestFn: (csrfToken: string | null) => Promise<Response>,
    defaultErrorMessage: string
  ): Promise<T> {
    let csrfToken = await this.resolveCsrfToken(false);
    let response = await requestFn(csrfToken);

    if (response.ok) {
      return (await response.json()) as T;
    }

    if (response.status === 422) {
      const rawText = await response.text();
      let parsedError: string | null = null;
      try {
        const json = JSON.parse(rawText) as { error?: string };
        if (json && typeof json.error === "string") {
          parsedError = json.error;
        }
      } catch {
        // Not JSON
      }

      const errorMessage = parsedError || rawText || "";
      const shouldRetryCsrf =
        this.isCsrfError(response.status, errorMessage) || (!csrfToken && response.status === 422);

      if (shouldRetryCsrf) {
        csrfToken = await this.resolveCsrfToken(true);
        response = await requestFn(csrfToken);
        if (response.ok) {
          return (await response.json()) as T;
        }
        const retryErrBody = await response.json().catch(() => ({}));
        throw new Error(
          (retryErrBody as { error?: string }).error || `${defaultErrorMessage} (${response.status})`
        );
      }

      throw new Error(parsedError || errorMessage || `${defaultErrorMessage} (${response.status})`);
    }

    const errBody = await response.json().catch(() => ({}));
    throw new Error(
      (errBody as { error?: string }).error || `${defaultErrorMessage} (${response.status})`
    );
  }

  public async uploadAttachment(file: Blob, filename: string): Promise<{ signed_blob_id: string }> {
    const makeRequest = async (csrfToken: string | null) => {
      const formData = new FormData();
      formData.append("file", file, filename);

      const headers: Record<string, string> = {
        Accept: "application/json"
      };
      if (csrfToken) {
        headers["X-CSRF-Token"] = csrfToken;
      }

      return fetch(`${this.baseUrl}/attachments`, {
        method: "POST",
        credentials: "same-origin",
        headers,
        body: formData
      });
    };

    return this.executeWithCsrfRetry(makeRequest, "Upload failed");
  }

  public async submitFeedback(payload: FeedbackSubmissionPayload): Promise<FeedbackSubmissionResponse> {
    const makeRequest = async (csrfToken: string | null) => {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        Accept: "application/json"
      };
      if (csrfToken) {
        headers["X-CSRF-Token"] = csrfToken;
      }

      return fetch(`${this.baseUrl}/feedback`, {
        method: "POST",
        credentials: "same-origin",
        headers,
        body: JSON.stringify({ feedback: payload })
      });
    };

    return this.executeWithCsrfRetry(makeRequest, "Submission failed");
  }
}
