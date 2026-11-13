import type {
  AgentChatRequestPayload,
  AgentChatResponse,
  AgentKeysUpdatePayload,
  AgentKeysUpdateResponse,
  AgentStatusResponse,
  ContextDropApiClientOptions,
  CrossEnvFeedbackListResponse,
  FeedbackDeleteResponse,
  FeedbackSubmissionPayload,
  FeedbackSubmissionResponse,
  FeedbackUpdatePayload,
  FeedbackUpdateResponse,
  OwnFeedbackListResponse,
  ProposedFileEdit,
  WidgetConfig
} from "./types.ts";

const OWNERSHIP_STORAGE_KEY = "context_drop_ownership_tokens";
const MAX_STORED_OWNERSHIP_TOKENS = 50;

function getBrowserLocalStorage(): Storage | null {
  try {
    if (typeof window !== "undefined" && "localStorage" in window) {
      const store = window.localStorage;
      if (store && typeof store.getItem === "function" && typeof store.setItem === "function") {
        return store;
      }
    }
  } catch {
    // Storage unavailable or restricted by browser privacy policy
  }
  return null;
}

export class ContextDropApiClient {
  private baseUrl: string;
  private credentials: RequestCredentials;
  private customHeaders: Record<string, string>;
  private cachedCsrfToken: string | null = null;
  private configFetched: boolean = false;
  private inFlightConfigPromise: Promise<WidgetConfig> | null = null;
  private memoryOwnershipTokens: Map<string, string> = new Map();

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

  private ownershipScopedKey(id: number | string): string {
    return `${this.baseUrl}::${String(id)}`;
  }

  private readStoredTokenMap(): Record<string, string> {
    const store = getBrowserLocalStorage();
    if (!store) {
      const out: Record<string, string> = {};
      for (const [k, v] of this.memoryOwnershipTokens.entries()) {
        out[k] = v;
      }
      return out;
    }

    try {
      const raw = store.getItem(OWNERSHIP_STORAGE_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw) as unknown;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return {};
      }
      const clean: Record<string, string> = {};
      for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
        if (typeof v === "string" && v.trim().length > 0) {
          clean[k] = v.trim();
        }
      }
      return clean;
    } catch {
      return {};
    }
  }

  private writeStoredTokenMap(map: Record<string, string>): void {
    const entries = Object.entries(map);
    const trimmedEntries =
      entries.length > MAX_STORED_OWNERSHIP_TOKENS
        ? entries.slice(entries.length - MAX_STORED_OWNERSHIP_TOKENS)
        : entries;

    this.memoryOwnershipTokens.clear();
    const bounded: Record<string, string> = {};
    for (const [k, v] of trimmedEntries) {
      bounded[k] = v;
      this.memoryOwnershipTokens.set(k, v);
    }

    const store = getBrowserLocalStorage();
    if (store) {
      try {
        store.setItem(OWNERSHIP_STORAGE_KEY, JSON.stringify(bounded));
      } catch {
        // Non-fatal if storage quota exceeded
      }
    }
  }

  public getOwnershipToken(id: number | string): string | null {
    const map = this.readStoredTokenMap();
    const scoped = map[this.ownershipScopedKey(id)];
    if (scoped) return scoped;
    const plain = map[String(id)];
    return plain || null;
  }

  public setOwnershipToken(id: number | string, token: string): void {
    const trimmed = typeof token === "string" ? token.trim() : "";
    if (!trimmed) return;
    const map = this.readStoredTokenMap();
    const key = this.ownershipScopedKey(id);
    delete map[key];
    map[key] = trimmed;
    this.writeStoredTokenMap(map);
  }

  public removeOwnershipToken(id: number | string): void {
    const map = this.readStoredTokenMap();
    const scopedKey = this.ownershipScopedKey(id);
    const plainKey = String(id);
    if (!(scopedKey in map) && !(plainKey in map)) return;
    delete map[scopedKey];
    delete map[plainKey];
    this.writeStoredTokenMap(map);
  }

  public getAllOwnershipTokens(): string[] {
    const map = this.readStoredTokenMap();
    const prefix = `${this.baseUrl}::`;
    const tokens: string[] = [];
    for (const [k, v] of Object.entries(map)) {
      if ((k.startsWith(prefix) || !k.includes("::")) && v && !tokens.includes(v)) {
        tokens.push(v);
      }
    }
    return tokens;
  }

  public buildAttachmentPreviewUrl(
    feedbackId: number | string,
    attachmentId: number | string,
    ownershipToken?: string | null
  ): string {
    const token = ownershipToken || this.getOwnershipToken(feedbackId);
    const base = `${this.baseUrl}/feedback/${encodeURIComponent(String(feedbackId))}/attachments/${encodeURIComponent(String(attachmentId))}`;
    return token ? `${base}?ownership_token=${encodeURIComponent(token)}` : base;
  }

  public async submitFeedback(payload: FeedbackSubmissionPayload): Promise<FeedbackSubmissionResponse> {
    const makeRequest = async (csrfToken: string | null) =>
      fetch(`${this.baseUrl}/feedback`, {
        method: "POST",
        credentials: this.credentials,
        headers: this.buildJsonHeaders(csrfToken),
        body: JSON.stringify({ feedback: payload })
      });

    const response = await this.executeWithCsrfRetry<FeedbackSubmissionResponse>(
      makeRequest,
      "Submission failed"
    );

    const token = response?.ownership_token || response?.feedback?.ownership_token;
    if (response?.id !== undefined && token) {
      this.setOwnershipToken(response.id, token);
    }
    return response;
  }

  public async fetchOwnFeedbacks(limit: number = 30): Promise<OwnFeedbackListResponse> {
    const headers: Record<string, string> = {
      Accept: "application/json"
    };
    const tokens = this.getAllOwnershipTokens();
    if (tokens.length > 0) {
      headers["X-Context-Drop-Ownership-Tokens"] = tokens.join(",");
    }

    const qs = limit > 0 ? `?limit=${encodeURIComponent(String(limit))}` : "";
    const response = await fetch(`${this.baseUrl}/feedback${qs}`, {
      method: "GET",
      credentials: this.credentials,
      headers: this.mergeClientHeaders(headers)
    });

    if (!response.ok) {
      const errBody = await response.json().catch(() => ({}));
      throw new Error(
        (errBody as { error?: string }).error || `Failed to load own feedbacks (${response.status})`
      );
    }

    const parsed = (await response.json().catch(() => ({}))) as Partial<OwnFeedbackListResponse>;
    const feedbacks = Array.isArray(parsed?.feedbacks) ? parsed.feedbacks : [];
    for (const item of feedbacks) {
      if (item && item.id !== undefined && typeof item.ownership_token === "string") {
        this.setOwnershipToken(item.id, item.ownership_token);
      }
    }

    return {
      total_count: typeof parsed?.total_count === "number" ? parsed.total_count : feedbacks.length,
      feedbacks
    };
  }

  public async updateFeedback(
    id: number | string,
    payload: FeedbackUpdatePayload,
    ownershipToken?: string | null
  ): Promise<FeedbackUpdateResponse> {
    const resolvedToken = ownershipToken || this.getOwnershipToken(id);
    const makeRequest = async (csrfToken: string | null) => {
      const headers = this.buildJsonHeaders(csrfToken);
      if (resolvedToken) {
        headers["X-Context-Drop-Ownership-Token"] = resolvedToken;
      }
      const bodyPayload: Record<string, unknown> = { feedback: payload };
      if (resolvedToken) {
        bodyPayload.ownership_token = resolvedToken;
      }
      return fetch(`${this.baseUrl}/feedback/${encodeURIComponent(String(id))}`, {
        method: "PATCH",
        credentials: this.credentials,
        headers,
        body: JSON.stringify(bodyPayload)
      });
    };

    const response = await this.executeWithCsrfRetry<FeedbackUpdateResponse>(
      makeRequest,
      "Update failed"
    );

    const nextToken = response?.ownership_token || response?.feedback?.ownership_token;
    if (response?.id !== undefined && nextToken) {
      this.setOwnershipToken(response.id, nextToken);
    }
    return response;
  }

  public async deleteFeedback(
    id: number | string,
    ownershipToken?: string | null
  ): Promise<FeedbackDeleteResponse> {
    const resolvedToken = ownershipToken || this.getOwnershipToken(id);
    const makeRequest = async (csrfToken: string | null) => {
      const headers = this.buildJsonHeaders(csrfToken);
      if (resolvedToken) {
        headers["X-Context-Drop-Ownership-Token"] = resolvedToken;
      }
      return fetch(`${this.baseUrl}/feedback/${encodeURIComponent(String(id))}`, {
        method: "DELETE",
        credentials: this.credentials,
        headers
      });
    };

    const response = await this.executeWithCsrfRetry<FeedbackDeleteResponse>(
      makeRequest,
      "Delete failed"
    );

    this.removeOwnershipToken(id);
    return response;
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
