import type {
  AgentChatRequestPayload,
  AgentChatResponse,
  AgentKeysUpdatePayload,
  AgentKeysUpdateResponse,
  AgentStatusResponse,
  ContextDropApiClientOptions,
  CrossEnvFeedbackListResponse,
  FeedbackSubmissionPayload,
  FeedbackSubmissionResponse,
  ProposedFileEdit,
  WidgetConfig
} from "./types.ts";

export class ContextDropApiClient {
  private baseUrl: string;
  private credentials: RequestCredentials;
  private customHeaders: Record<string, string>;
  private cachedCsrfToken: string | null = null;
  private configFetched: boolean = false;
  private inFlightConfigPromise: Promise<WidgetConfig> | null = null;

  constructor(baseUrl: string = "/context_drop", options: ContextDropApiClientOptions = {}) {
    this.baseUrl = baseUrl.replace(/\/+$/, "") || "/context_drop";
    this.credentials = options.credentials || "same-origin";
    this.customHeaders = options.headers ? { ...options.headers } : {};
  }

  public getBaseUrl(): string {
    return this.baseUrl;
  }

  public setCredentials(credentials: RequestCredentials): void {
    this.credentials = credentials;
  }

  public setHeaders(headers: Record<string, string>): void {
    this.customHeaders = { ...headers };
  }

  private isCrossOriginEndpoint(): boolean {
    if (!/^https?:\/\//i.test(this.baseUrl)) {
      return false;
    }
    if (typeof window === "undefined" || !window.location || !window.location.origin) {
      return true;
    }
    try {
      return new URL(this.baseUrl, window.location.origin).origin !== window.location.origin;
    } catch {
      return false;
    }
  }

  private mergeClientHeaders(base: Record<string, string>): Record<string, string> {
    const merged: Record<string, string> = {
      ...this.customHeaders,
      ...base
    };
    if (this.isCrossOriginEndpoint()) {
      merged["X-Context-Drop-Client"] = "1";
    }
    return merged;
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
          credentials: this.credentials,
          headers: this.mergeClientHeaders({
            Accept: "application/json"
          })
        });

        if (!response.ok) {
          throw new Error(`Failed to fetch ContextDrop config (${response.status})`);
        }

        const config = (await response.json()) as WidgetConfig;
        this.configFetched = true;
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
      if (this.configFetched) {
        return null;
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
        this.isCsrfError(response.status, errorMessage) ||
        (!csrfToken && !this.configFetched && response.status === 422);

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

  private buildJsonHeaders(csrfToken: string | null): Record<string, string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json"
    };
    if (csrfToken) {
      headers["X-CSRF-Token"] = csrfToken;
    }
    return this.mergeClientHeaders(headers);
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
        credentials: this.credentials,
        headers: this.mergeClientHeaders(headers),
        body: formData
      });
    };

    return this.executeWithCsrfRetry(makeRequest, "Upload failed");
  }

  public async submitFeedback(payload: FeedbackSubmissionPayload): Promise<FeedbackSubmissionResponse> {
    const makeRequest = async (csrfToken: string | null) =>
      fetch(`${this.baseUrl}/feedback`, {
        method: "POST",
        credentials: this.credentials,
        headers: this.buildJsonHeaders(csrfToken),
        body: JSON.stringify({ feedback: payload })
      });

    return this.executeWithCsrfRetry(makeRequest, "Submission failed");
  }

  public async fetchAgentStatus(): Promise<AgentStatusResponse> {
    const response = await fetch(`${this.baseUrl}/agent/status`, {
      method: "GET",
      credentials: this.credentials,
      headers: this.mergeClientHeaders({
        Accept: "application/json"
      })
    });

    if (!response.ok) {
      const errBody = await response.json().catch(() => ({}));
      throw new Error(
        (errBody as { error?: string }).error || `Failed to load agent status (${response.status})`
      );
    }

    return (await response.json()) as AgentStatusResponse;
  }

  public async saveAgentKeys(payload: AgentKeysUpdatePayload): Promise<AgentKeysUpdateResponse> {
    const makeRequest = async (csrfToken: string | null) =>
      fetch(`${this.baseUrl}/agent/keys`, {
        method: "POST",
        credentials: this.credentials,
        headers: this.buildJsonHeaders(csrfToken),
        body: JSON.stringify(payload)
      });

    return this.executeWithCsrfRetry(makeRequest, "Failed to save BYOK settings");
  }

  public async deleteAgentKeys(provider: string = "all"): Promise<AgentKeysUpdateResponse> {
    const makeRequest = async (csrfToken: string | null) =>
      fetch(`${this.baseUrl}/agent/keys?provider=${encodeURIComponent(provider)}`, {
        method: "DELETE",
        credentials: this.credentials,
        headers: this.buildJsonHeaders(csrfToken)
      });

    return this.executeWithCsrfRetry(makeRequest, "Failed to clear BYOK key");
  }

  public async fetchAgentFeedbacks(
    environment: string = "all",
    status: string = "new"
  ): Promise<CrossEnvFeedbackListResponse> {
    const qs = `environment=${encodeURIComponent(environment)}&status=${encodeURIComponent(status)}`;
    const response = await fetch(`${this.baseUrl}/agent/feedbacks?${qs}`, {
      method: "GET",
      credentials: this.credentials,
      headers: this.mergeClientHeaders({
        Accept: "application/json"
      })
    });

    if (!response.ok) {
      const errBody = await response.json().catch(() => ({}));
      throw new Error(
        (errBody as { error?: string }).error || `Failed to load feedbacks (${response.status})`
      );
    }

    return (await response.json()) as CrossEnvFeedbackListResponse;
  }

  public async sendAgentChat(payload: AgentChatRequestPayload): Promise<AgentChatResponse> {
    const makeRequest = async (csrfToken: string | null) =>
      fetch(`${this.baseUrl}/agent/chat`, {
        method: "POST",
        credentials: this.credentials,
        headers: this.buildJsonHeaders(csrfToken),
        body: JSON.stringify(payload)
      });

    return this.executeWithCsrfRetry(makeRequest, "Agent request failed");
  }

  public async applyEdit(editId: string): Promise<{ edit: ProposedFileEdit }> {
    const makeRequest = async (csrfToken: string | null) =>
      fetch(`${this.baseUrl}/agent/edits/${encodeURIComponent(editId)}/apply`, {
        method: "POST",
        credentials: this.credentials,
        headers: this.buildJsonHeaders(csrfToken)
      });

    return this.executeWithCsrfRetry(makeRequest, "Failed to apply file edit");
  }

  public async rejectEdit(editId: string): Promise<{ edit: ProposedFileEdit }> {
    const makeRequest = async (csrfToken: string | null) =>
      fetch(`${this.baseUrl}/agent/edits/${encodeURIComponent(editId)}/reject`, {
        method: "POST",
        credentials: this.credentials,
        headers: this.buildJsonHeaders(csrfToken)
      });

    return this.executeWithCsrfRetry(makeRequest, "Failed to reject file edit");
  }

  public async revertEdit(editId: string): Promise<{ edit: ProposedFileEdit }> {
    const makeRequest = async (csrfToken: string | null) =>
      fetch(`${this.baseUrl}/agent/edits/${encodeURIComponent(editId)}/revert`, {
        method: "POST",
        credentials: this.credentials,
        headers: this.buildJsonHeaders(csrfToken)
      });

    return this.executeWithCsrfRetry(makeRequest, "Failed to revert file edit");
  }
}
