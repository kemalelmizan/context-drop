import {
  FEEDBACK_STATUSES,
  VERSION,
  type FeedbackStatus,
  type FeedbackSummaryItem,
  type RemoteMcpEnvironmentConfig,
  type StorageAdapter,
  type StoredFeedbackRecord
} from "../server/types.ts";
import { formatSubmitterLabel } from "../server/storage/memory.ts";
import { EnvironmentRouter, type EnvVarMap } from "./environment-router.ts";
import {
  RemoteMcpClient,
  RemoteMcpError,
  type McpContentBlock,
  type McpToolResult,
  type RemoteMcpTransport
} from "./remote-client.ts";

export const MCP_PROTOCOL_VERSION = "2025-03-26";
const MAX_INLINE_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB

export interface ContextDropMcpOptions {
  storage: StorageAdapter;
  hostEnvironment?: string;
  environments?: Record<string, RemoteMcpEnvironmentConfig>;
  localOnly?: boolean;
  envVars?: EnvVarMap;
  remoteTransport?: RemoteMcpTransport;
}

export interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: string | number | null;
  result?: unknown;
  error?: {
    code: number;
    message: string;
  };
}

const TOOL_DEFINITIONS = [
  {
    name: "list_environments",
    description:
      "List the active host environment and all federated remote ContextDrop environments connected through this unified MCP server.",
    inputSchema: {
      type: "object",
      properties: {
        ping_remotes: {
          type: "boolean",
          description:
            "When true, performs a lightweight JSON-RPC ping against each configured remote environment to verify connectivity."
        }
      }
    }
  },
  {
    name: "list_feedbacks",
    description:
      "List and search ContextDrop feedback submissions across all connected environments (or filtered to a specific environment, status, page_url, or query).",
    inputSchema: {
      type: "object",
      properties: {
        environment: {
          type: "string",
          description:
            "Target environment ('all', 'local', 'development', 'staging', 'production', etc.). Defaults to 'all' across local and configured remote environments."
        },
        status: {
          type: "string",
          enum: [...FEEDBACK_STATUSES],
          description: "Filter feedback by workflow status."
        },
        page_url: {
          type: "string",
          description: "Filter feedback by originating page URL substring (e.g. '/checkout')."
        },
        query: {
          type: "string",
          description:
            "Free-text search matching feedback message or attached DOM element selectors, paths, or text."
        },
        limit: {
          type: "integer",
          description: "Maximum records to return (default 20, max 100)."
        },
        offset: {
          type: "integer",
          description: "Pagination offset (default 0)."
        }
      }
    }
  },
  {
    name: "get_feedback",
    description:
      "Retrieve a complete ContextDrop feedback record, all DOM ElementReference snapshots, and screenshots/images as multimodal MCP image blocks across local or remote environments.",
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: {
        id: {
          type: ["integer", "string"],
          description:
            "The ID of the ContextDrop feedback record, or a qualified '<environment>:<id>' string (e.g. 'staging:42')."
        },
        environment: {
          type: "string",
          description:
            "Optional environment name ('local', 'development', 'staging', 'production', etc.). Defaults to the local host environment unless specified or prefixed on `id`."
        },
        include_images: {
          type: "boolean",
          description:
            "When true (default), includes attached screenshots and images as base64 MCP image content blocks."
        }
      }
    }
  },
  {
    name: "get_feedback_attachment",
    description:
      "Retrieve a specific ContextDrop attachment record and its binary image/screenshot as an MCP image content block from local or remote environments.",
    inputSchema: {
      type: "object",
      required: ["attachment_id"],
      properties: {
        attachment_id: {
          type: ["integer", "string"],
          description:
            "The ID of the ContextDrop attachment record, or a qualified '<environment>:<attachment_id>' string (e.g. 'staging:201')."
        },
        environment: {
          type: "string",
          description: "Optional environment name ('local', 'staging', 'production', etc.)."
        }
      }
    }
  },
  {
    name: "update_feedback_status",
    description:
      "Transition a ContextDrop feedback record's status ('new', 'reviewed', 'resolved', 'dismissed') in local or remote environments.",
    inputSchema: {
      type: "object",
      required: ["id", "status"],
      properties: {
        id: {
          type: ["integer", "string"],
          description:
            "The ID of the ContextDrop feedback record, or a qualified '<environment>:<id>' string (e.g. 'staging:42')."
        },
        environment: {
          type: "string",
          description: "Optional environment name ('local', 'staging', 'production', etc.)."
        },
        status: {
          type: "string",
          enum: [...FEEDBACK_STATUSES],
          description: "Target workflow status."
        }
      }
    }
  }
] as const;

const PROMPT_DEFINITIONS = [
  {
    name: "investigate_feedback",
    description:
      "Generate a structured investigation brief for a ContextDrop feedback record (local or remote), including its originating environment, URL, DOM element selectors/paths, and visual screenshots.",
    arguments: [
      {
        name: "feedback_id",
        description:
          "ID of the ContextDrop feedback record to investigate, or '<environment>:<id>' (e.g. 'staging:42').",
        required: true
      },
      {
        name: "environment",
        description: "Optional environment name ('local', 'staging', 'production', etc.).",
        required: false
      }
    ]
  }
] as const;

const RESOURCES = [
  {
    uri: "contextdrop://environments",
    name: "Connected ContextDrop Environments",
    description: "Host environment and all federated remote ContextDrop environments.",
    mimeType: "application/json"
  },
  {
    uri: "contextdrop://feedbacks/new",
    name: "Unresolved New Feedbacks (All Connected Environments)",
    description:
      "List of unresolved ContextDrop feedback records currently in 'new' status across local and federated environments.",
    mimeType: "application/json"
  }
] as const;

const RESOURCE_TEMPLATES = [
  {
    uriTemplate: "contextdrop://feedbacks/{id}",
    name: "Feedback Record by ID",
    description:
      "Full ContextDrop feedback submission, DOM element snapshots, and attachment metadata for a local ID or '<env>:<id>'.",
    mimeType: "application/json"
  },
  {
    uriTemplate: "contextdrop://{environment}/feedbacks/new",
    name: "Unresolved New Feedbacks by Environment",
    description:
      "Unresolved 'new' feedback records scoped to a specific environment ('local', 'staging', 'production', 'all').",
    mimeType: "application/json"
  },
  {
    uriTemplate: "contextdrop://{environment}/feedbacks/{id}",
    name: "Feedback Record by Environment and ID",
    description: "Full ContextDrop feedback submission for a specific environment and ID.",
    mimeType: "application/json"
  }
] as const;

function asRecord(val: unknown): Record<string, unknown> {
  if (val && typeof val === "object" && !Array.isArray(val)) {
    return val as Record<string, unknown>;
  }
  return {};
}

function successJsonTool(payload: unknown): McpToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
    isError: false
  };
}

function errorTool(message: string): McpToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify({ error: message }) }],
    isError: true
  };
}

function serializeFullFeedback(record: StoredFeedbackRecord, router: EnvironmentRouter) {
  const envName = record.environment || router.hostEnvironment;
  return {
    id: record.id,
    qualified_id: router.qualifyId(envName, record.id),
    environment: envName,
    status: record.status,
    message: record.message,
    page_url: record.page_url,
    user_agent: record.user_agent,
    submitter: {
      type: record.submitter?.type ?? null,
      id: record.submitter?.id ?? null,
      label: formatSubmitterLabel(record.submitter)
    },
    metadata: record.metadata ?? {},
    created_at: record.created_at,
    updated_at: record.updated_at,
    element_references: record.element_references.map((el) => ({
      id: el.id,
      client_ref: el.client_ref,
      tag_name: el.tag_name,
      selector: el.selector,
      dom_path: el.dom_path,
      text_content: el.text_content,
      attributes_snapshot: el.attributes_snapshot ?? {},
      bounding_rect: el.bounding_rect ?? {},
      viewport: el.viewport ?? {},
      metadata: el.metadata ?? {},
      captured_at: el.captured_at
    })),
    attachments: record.attachments.map((att) => ({
      id: att.id,
      qualified_id: router.qualifyId(envName, att.id),
      attachment_type: att.attachment_type,
      element_reference_id: att.element_reference_id,
      metadata: att.metadata ?? {},
      filename: att.filename,
      content_type: att.content_type,
      byte_size: att.byte_size,
      created_at: att.created_at
    }))
  };
}

export class ContextDropMcpDispatcher {
  private readonly storage: StorageAdapter;
  private readonly router: EnvironmentRouter;
  private readonly remoteClient: RemoteMcpClient;

  constructor(options: ContextDropMcpOptions) {
    this.storage = options.storage;
    this.router = new EnvironmentRouter({
      hostEnvironment: options.hostEnvironment,
      environments: options.environments,
      localOnly: options.localOnly,
      envVars: options.envVars
    });
    this.remoteClient = new RemoteMcpClient({
      transport: options.remoteTransport
    });
  }

  public async dispatch(
    rawMessage: unknown
  ): Promise<JsonRpcResponse | JsonRpcResponse[] | null> {
    if (Array.isArray(rawMessage)) {
      const results: JsonRpcResponse[] = [];
      for (const item of rawMessage) {
        const res = await this.dispatchSingle(item);
        if (res) results.push(res);
      }
      return results.length > 0 ? results : null;
    }
    return this.dispatchSingle(rawMessage);
  }

  private async dispatchSingle(msg: unknown): Promise<JsonRpcResponse | null> {
    if (!msg || typeof msg !== "object" || Array.isArray(msg)) {
      return this.jsonrpcError(null, -32600, "Invalid Request: expected JSON object");
    }

    const req = msg as Record<string, unknown>;
    const hasId = Object.prototype.hasOwnProperty.call(req, "id");
    const id = (req["id"] as string | number | null) ?? null;
    const method = String(req["method"] ?? "");
    const params = asRecord(req["params"]);

    if (method.startsWith("notifications/") || (!hasId && id === null)) {
      return null;
    }

    try {
      switch (method) {
        case "initialize": {
          const clientVersion = String(params["protocolVersion"] ?? "").trim();
          const negotiatedVersion = clientVersion || MCP_PROTOCOL_VERSION;
          return this.jsonrpcResult(id, {
            protocolVersion: negotiatedVersion,
            capabilities: {
              tools: { listChanged: false },
              resources: { subscribe: false, listChanged: false },
              prompts: { listChanged: false }
            },
            serverInfo: {
              name: "context_drop",
              version: VERSION,
              environment: this.router.hostEnvironment,
              connectedEnvironments: this.router.getAvailableEnvironments().map((e) => e.name)
            }
          });
        }
        case "ping":
          return this.jsonrpcResult(id, {});
        case "tools/list":
          return this.jsonrpcResult(id, { tools: TOOL_DEFINITIONS });
        case "tools/call":
          return await this.handleToolCall(id, params);
        case "resources/list":
          return this.jsonrpcResult(id, { resources: RESOURCES });
        case "resources/templates/list":
          return this.jsonrpcResult(id, { resourceTemplates: RESOURCE_TEMPLATES });
        case "resources/read":
          return await this.handleResourceRead(id, params);
        case "prompts/list":
          return this.jsonrpcResult(id, { prompts: PROMPT_DEFINITIONS });
        case "prompts/get":
          return await this.handlePromptGet(id, params);
        default:
          return this.jsonrpcError(id, -32601, `Method not found: ${method}`);
      }
    } catch (err) {
      return this.jsonrpcError(id, -32603, `Internal error: ${(err as Error).message}`);
    }
  }

  private async handleToolCall(
    id: string | number | null,
    params: Record<string, unknown>
  ): Promise<JsonRpcResponse> {
    const toolName = String(params["name"] ?? "");
    const args = asRecord(params["arguments"]);

    switch (toolName) {
      case "list_environments":
        return this.jsonrpcResult(id, await this.toolListEnvironments(args));
      case "list_feedbacks":
        return this.jsonrpcResult(id, await this.toolListFeedbacks(args));
      case "get_feedback":
        return this.jsonrpcResult(id, await this.toolGetFeedback(args));
      case "get_feedback_attachment":
        return this.jsonrpcResult(id, await this.toolGetFeedbackAttachment(args));
      case "update_feedback_status":
        return this.jsonrpcResult(id, await this.toolUpdateFeedbackStatus(args));
      default:
        return this.jsonrpcError(id, -32602, `Unknown tool: ${toolName}`);
    }
  }

  private async toolListEnvironments(args: Record<string, unknown>): Promise<McpToolResult> {
    const pingRemotes = Boolean(args["ping_remotes"]);
    const environments = this.router.getAvailableEnvironments().map((e) => ({ ...e }));

    if (pingRemotes) {
      const remotes = this.router.getRemoteEnvironments();
      await Promise.all(
        environments.map(async (entry) => {
          if (entry.mode !== "remote_http") return;
          const cfg = remotes[entry.name];
          if (!cfg) return;
          try {
            await this.remoteClient.callRpc(entry.name, cfg, "ping", {});
            entry.reachable = true;
          } catch (err) {
            entry.reachable = false;
            entry.error = (err as Error).message;
          }
        })
      );
    }

    return successJsonTool({
      host_environment: this.router.hostEnvironment,
      federation_enabled: !this.router.localOnly,
      environments
    });
  }

  private async toolListFeedbacks(args: Record<string, unknown>): Promise<McpToolResult> {
    const statusRaw = String(args["status"] ?? "").trim();
    if (statusRaw && !FEEDBACK_STATUSES.includes(statusRaw as FeedbackStatus)) {
      return errorTool(
        `Invalid status '${statusRaw}'. Must be one of: ${FEEDBACK_STATUSES.join(", ")}`
      );
    }
    const status = (statusRaw || null) as FeedbackStatus | null;

    const rawLimit = args["limit"] !== undefined ? Number(args["limit"]) : 20;
    const limit = Math.max(1, Math.min(100, Number.isFinite(rawLimit) ? Math.trunc(rawLimit) : 20));
    const rawOffset = args["offset"] !== undefined ? Number(args["offset"]) : 0;
    const offset = Math.max(0, Number.isFinite(rawOffset) ? Math.trunc(rawOffset) : 0);

    const pageUrl = String(args["page_url"] ?? "").trim() || null;
    const query = String(args["query"] ?? "").trim() || null;
    const requestedEnv = (String(args["environment"] ?? "").trim().toLowerCase()) || "all";

    const remotes = this.router.getRemoteEnvironments();
    const hostEnv = this.router.hostEnvironment;

    if (requestedEnv === "all") {
      const fetchWindow = Math.max(1, Math.min(100, offset + limit));
      const localRes = await this.storage.listFeedbacks({
        status,
        page_url: pageUrl,
        query,
        limit: fetchWindow,
        offset: 0
      });

      const remoteEntries = Object.entries(remotes);
      if (remoteEntries.length === 0) {
        return successJsonTool({
          environment: hostEnv,
          total: localRes.total,
          limit,
          offset,
          feedbacks: localRes.records.slice(offset, offset + limit)
        });
      }

      const warnings: Array<{ environment: string; error: string }> = [];
      const remoteLists = await Promise.all(
        remoteEntries.map(async ([envName, cfg]) => {
          try {
            return await this.fetchRemoteList(envName, cfg, {
              status,
              page_url: pageUrl,
              query,
              limit: fetchWindow,
              offset: 0
            });
          } catch (err) {
            warnings.push({ environment: envName, error: (err as Error).message });
            return null;
          }
        })
      );

      const combined: FeedbackSummaryItem[] = [...localRes.records];
      let totalCount = localRes.total;

      for (const r of remoteLists) {
        if (!r) continue;
        combined.push(...r.records);
        totalCount += r.total;
      }

      combined.sort((a, b) => {
        const dt = (Date.parse(b.created_at) || 0) - (Date.parse(a.created_at) || 0);
        return dt !== 0 ? dt : Number(b.id) - Number(a.id);
      });

      const payload: Record<string, unknown> = {
        environment: "all",
        connected_environments: [hostEnv, ...Object.keys(remotes)],
        total: totalCount,
        limit,
        offset,
        feedbacks: combined.slice(offset, offset + limit)
      };
      if (warnings.length > 0) {
        payload["warnings"] = warnings;
      }
      return successJsonTool(payload);
    }

    if (requestedEnv === "local" || requestedEnv === hostEnv) {
      const localRes = await this.storage.listFeedbacks({
        environment: requestedEnv === "local" ? null : hostEnv,
        status,
        page_url: pageUrl,
        query,
        limit,
        offset
      });
      return successJsonTool({
        environment: hostEnv,
        total: localRes.total,
        limit,
        offset,
        feedbacks: localRes.records
      });
    }

    const remoteCfg = remotes[requestedEnv];
    if (remoteCfg) {
      try {
        const remoteRes = await this.fetchRemoteList(requestedEnv, remoteCfg, {
          status,
          page_url: pageUrl,
          query,
          limit,
          offset
        });
        return successJsonTool({
          environment: requestedEnv,
          total: remoteRes.total,
          limit,
          offset,
          feedbacks: remoteRes.records
        });
      } catch (err) {
        return errorTool((err as Error).message);
      }
    }

    // Shared DB fallback
    const fallbackRes = await this.storage.listFeedbacks({
      environment: requestedEnv,
      status,
      page_url: pageUrl,
      query,
      limit,
      offset
    });
    if (fallbackRes.total > 0) {
      return successJsonTool({
        environment: requestedEnv,
        total: fallbackRes.total,
        limit,
        offset,
        feedbacks: fallbackRes.records
      });
    }

    const known = Array.from(new Set([hostEnv, "local", "all", ...Object.keys(remotes)]));
    return errorTool(
      `Unknown environment '${requestedEnv}'. Available environments: ${known.join(", ")}`
    );
  }

  private async fetchRemoteList(
    envName: string,
    cfg: ReturnType<EnvironmentRouter["getRemoteEnvironments"]>[string],
    filter: {
      status: FeedbackStatus | null;
      page_url: string | null;
      query: string | null;
      limit: number;
      offset: number;
    }
  ): Promise<{ total: number; records: FeedbackSummaryItem[] }> {
    const remoteArgs: Record<string, unknown> = {
      limit: filter.limit,
      offset: filter.offset
    };
    if (filter.status) remoteArgs["status"] = filter.status;
    if (filter.page_url) remoteArgs["page_url"] = filter.page_url;
    if (filter.query) remoteArgs["query"] = filter.query;

    const toolRes = await this.remoteClient.callTool(envName, cfg, "list_feedbacks", remoteArgs);
    const textBlock = toolRes.content.find((b) => b.type === "text");
    const parsed = textBlock?.text ? (JSON.parse(textBlock.text) as Record<string, unknown>) : {};

    if (toolRes.isError) {
      throw new RemoteMcpError(
        String(parsed["error"] ?? `Remote list_feedbacks failed on '${envName}'`)
      );
    }

    const items = Array.isArray(parsed["feedbacks"]) ? parsed["feedbacks"] : [];
    const records: FeedbackSummaryItem[] = items.map((raw) => {
      const rec = asRecord(raw);
      const id = (rec["id"] as number | string) ?? "";
      return {
        ...(rec as unknown as FeedbackSummaryItem),
        id,
        environment: envName,
        qualified_id: this.router.qualifyId(envName, id)
      };
    });

    return {
      total: Number(parsed["total"] ?? records.length),
      records
    };
  }

  private async toolGetFeedback(args: Record<string, unknown>): Promise<McpToolResult> {
    const rawId = args["id"] ?? args["feedback_id"];
    if (rawId === undefined || rawId === null || String(rawId).trim() === "") {
      return errorTool("Missing required parameter: id");
    }

    const includeImages =
      args["include_images"] !== undefined ? Boolean(args["include_images"]) : true;
    const [targetEnv, feedbackId] = this.router.parseTarget(
      rawId as string | number,
      args["environment"] as string | undefined
    );

    if (!this.router.isLocalTarget(targetEnv)) {
      const remoteCfg = this.router.getRemoteConfig(targetEnv);
      if (!remoteCfg || !targetEnv) {
        return errorTool(`Unknown remote environment '${targetEnv}'`);
      }
      return this.fetchRemoteFeedback(targetEnv, remoteCfg, feedbackId, includeImages);
    }

    const feedback = await this.storage.getFeedback(feedbackId);
    if (!feedback) {
      return errorTool(`Feedback #${feedbackId} not found`);
    }

    const payload = serializeFullFeedback(feedback, this.router);
    const contentBlocks: McpContentBlock[] = [
      {
        type: "text",
        text: JSON.stringify(payload, null, 2)
      }
    ];

    if (includeImages) {
      for (const att of feedback.attachments) {
        if ((att.byte_size ?? 0) > MAX_INLINE_IMAGE_BYTES) continue;
        const bytes = await this.storage.getAttachmentBytes(att.id);
        if (bytes && bytes.byteLength > 0 && bytes.byteLength <= MAX_INLINE_IMAGE_BYTES) {
          contentBlocks.push({
            type: "image",
            data: Buffer.from(bytes).toString("base64"),
            mimeType: att.content_type || "image/png"
          });
        }
      }
    }

    return {
      content: contentBlocks,
      isError: false
    };
  }

  private async fetchRemoteFeedback(
    envName: string,
    remoteCfg: NonNullable<ReturnType<EnvironmentRouter["getRemoteConfig"]>>,
    feedbackId: string,
    includeImages: boolean
  ): Promise<McpToolResult> {
    try {
      const res = await this.remoteClient.callTool(envName, remoteCfg, "get_feedback", {
        id: feedbackId,
        include_images: includeImages
      });
      if (res.isError) return res;

      const updatedBlocks = res.content.map((block) => {
        if (block.type === "text" && typeof block.text === "string") {
          try {
            const parsed = JSON.parse(block.text) as Record<string, unknown>;
            parsed["environment"] = envName;
            parsed["qualified_id"] = this.router.qualifyId(
              envName,
              (parsed["id"] as string | number) ?? feedbackId
            );
            return { ...block, text: JSON.stringify(parsed, null, 2) };
          } catch {
            return block;
          }
        }
        return block;
      });

      return { content: updatedBlocks, isError: false };
    } catch (err) {
      return errorTool((err as Error).message);
    }
  }

  private async toolGetFeedbackAttachment(args: Record<string, unknown>): Promise<McpToolResult> {
    const rawAttId = args["attachment_id"] ?? args["id"];
    if (rawAttId === undefined || rawAttId === null || String(rawAttId).trim() === "") {
      return errorTool("Missing required parameter: attachment_id");
    }

    const [targetEnv, attId] = this.router.parseTarget(
      rawAttId as string | number,
      args["environment"] as string | undefined
    );

    if (!this.router.isLocalTarget(targetEnv)) {
      const remoteCfg = this.router.getRemoteConfig(targetEnv);
      if (!remoteCfg || !targetEnv) {
        return errorTool(`Unknown remote environment '${targetEnv}'`);
      }
      try {
        return await this.remoteClient.callTool(targetEnv, remoteCfg, "get_feedback_attachment", {
          attachment_id: attId
        });
      } catch (err) {
        return errorTool((err as Error).message);
      }
    }

    const found = await this.storage.getAttachment(attId);
    if (!found) {
      return errorTool(`Attachment #${attId} not found`);
    }

    const envName = this.router.hostEnvironment;
    const { attachment, element_selector, data } = found;
    const metaPayload = {
      id: attachment.id,
      qualified_id: this.router.qualifyId(envName, attachment.id),
      environment: envName,
      feedback_id: attachment.feedback_id,
      element_reference_id: attachment.element_reference_id,
      element_selector,
      attachment_type: attachment.attachment_type,
      metadata: attachment.metadata ?? {},
      filename: attachment.filename,
      content_type: attachment.content_type,
      byte_size: attachment.byte_size
    };

    const blocks: McpContentBlock[] = [{ type: "text", text: JSON.stringify(metaPayload, null, 2) }];
    if (data && data.byteLength > 0) {
      blocks.push({
        type: "image",
        data: Buffer.from(data).toString("base64"),
        mimeType: attachment.content_type || "image/png"
      });
    }

    return {
      content: blocks,
      isError: false
    };
  }

  private async toolUpdateFeedbackStatus(args: Record<string, unknown>): Promise<McpToolResult> {
    const rawId = args["id"] ?? args["feedback_id"];
    const nextStatus = String(args["status"] ?? "").trim();

    if (rawId === undefined || rawId === null || String(rawId).trim() === "") {
      return errorTool("Missing required parameter: id");
    }
    if (!FEEDBACK_STATUSES.includes(nextStatus as FeedbackStatus)) {
      return errorTool(
        `Invalid status '${nextStatus}'. Must be one of: ${FEEDBACK_STATUSES.join(", ")}`
      );
    }

    const [targetEnv, feedbackId] = this.router.parseTarget(
      rawId as string | number,
      args["environment"] as string | undefined
    );

    if (!this.router.isLocalTarget(targetEnv)) {
      const remoteCfg = this.router.getRemoteConfig(targetEnv);
      if (!remoteCfg || !targetEnv) {
        return errorTool(`Unknown remote environment '${targetEnv}'`);
      }
      try {
        const res = await this.remoteClient.callTool(
          targetEnv,
          remoteCfg,
          "update_feedback_status",
          {
            id: feedbackId,
            status: nextStatus
          }
        );
        if (res.isError) return res;

        const updatedBlocks = res.content.map((block) => {
          if (block.type === "text" && typeof block.text === "string") {
            try {
              const parsed = JSON.parse(block.text) as Record<string, unknown>;
              parsed["environment"] = targetEnv;
              parsed["qualified_id"] = this.router.qualifyId(
                targetEnv,
                (parsed["id"] as string | number) ?? feedbackId
              );
              return { ...block, text: JSON.stringify(parsed, null, 2) };
            } catch {
              return block;
            }
          }
          return block;
        });

        return { content: updatedBlocks, isError: false };
      } catch (err) {
        return errorTool((err as Error).message);
      }
    }

    const updated = await this.storage.updateFeedbackStatus(
      feedbackId,
      nextStatus as FeedbackStatus
    );
    if (!updated) {
      return errorTool(`Feedback #${feedbackId} not found`);
    }

    const envName = updated.feedback.environment || this.router.hostEnvironment;
    return successJsonTool({
      id: updated.feedback.id,
      qualified_id: this.router.qualifyId(envName, updated.feedback.id),
      environment: envName,
      previous_status: updated.previous_status,
      status: updated.feedback.status,
      page_url: updated.feedback.page_url,
      updated_at: updated.feedback.updated_at
    });
  }

  private async handleResourceRead(
    id: string | number | null,
    params: Record<string, unknown>
  ): Promise<JsonRpcResponse> {
    const uri = String(params["uri"] ?? "").trim();

    if (uri === "contextdrop://environments") {
      return this.jsonrpcResult(id, {
        contents: [
          {
            uri,
            mimeType: "application/json",
            text: JSON.stringify(
              {
                host_environment: this.router.hostEnvironment,
                environments: this.router.getAvailableEnvironments()
              },
              null,
              2
            )
          }
        ]
      });
    }

    if (uri === "contextdrop://feedbacks/new") {
      const res = await this.toolListFeedbacks({ status: "new", limit: 50, environment: "all" });
      return this.jsonrpcResult(id, {
        contents: [{ uri, mimeType: "application/json", text: res.content[0]?.text ?? "{}" }]
      });
    }

    const envNewMatch = /^contextdrop:\/\/([a-z0-9_-]+)\/feedbacks\/new$/i.exec(uri);
    if (envNewMatch) {
      const envName = envNewMatch[1].toLowerCase();
      const res = await this.toolListFeedbacks({ status: "new", limit: 50, environment: envName });
      if (res.isError) {
        return this.jsonrpcError(id, -32602, this.extractToolErrorMessage(res));
      }
      return this.jsonrpcResult(id, {
        contents: [{ uri, mimeType: "application/json", text: res.content[0]?.text ?? "{}" }]
      });
    }

    const fbByIdMatch = /^contextdrop:\/\/feedbacks\/([a-z0-9_:-]+)$/i.exec(uri);
    if (fbByIdMatch) {
      const rawId = fbByIdMatch[1];
      const res = await this.toolGetFeedback({ id: rawId, include_images: false });
      if (res.isError) {
        return this.jsonrpcError(id, -32602, this.extractToolErrorMessage(res));
      }
      return this.jsonrpcResult(id, {
        contents: [{ uri, mimeType: "application/json", text: res.content[0]?.text ?? "{}" }]
      });
    }

    const envFbMatch = /^contextdrop:\/\/([a-z0-9_-]+)\/feedbacks\/([a-z0-9_-]+)$/i.exec(uri);
    if (envFbMatch) {
      const envName = envFbMatch[1].toLowerCase();
      const fbId = envFbMatch[2];
      const res = await this.toolGetFeedback({
        id: fbId,
        environment: envName,
        include_images: false
      });
      if (res.isError) {
        return this.jsonrpcError(id, -32602, this.extractToolErrorMessage(res));
      }
      return this.jsonrpcResult(id, {
        contents: [{ uri, mimeType: "application/json", text: res.content[0]?.text ?? "{}" }]
      });
    }

    return this.jsonrpcError(id, -32602, `Unknown resource URI: ${uri}`);
  }

  private async handlePromptGet(
    id: string | number | null,
    params: Record<string, unknown>
  ): Promise<JsonRpcResponse> {
    const promptName = String(params["name"] ?? "");
    if (promptName !== "investigate_feedback") {
      return this.jsonrpcError(id, -32602, `Unknown prompt: ${promptName}`);
    }

    const args = asRecord(params["arguments"]);
    const rawId = args["feedback_id"] ?? args["id"];
    if (rawId === undefined || rawId === null || String(rawId).trim() === "") {
      return this.jsonrpcError(id, -32602, "Missing required argument: feedback_id");
    }

    const res = await this.toolGetFeedback({
      id: rawId as string | number,
      environment: args["environment"] as string | undefined,
      include_images: true
    });
    if (res.isError) {
      return this.jsonrpcError(id, -32602, this.extractToolErrorMessage(res));
    }

    const textBlock = res.content.find((b) => b.type === "text");
    const fb = textBlock?.text ? (JSON.parse(textBlock.text) as Record<string, unknown>) : {};
    const envName = String(fb["environment"] ?? this.router.hostEnvironment);
    const qualified = String(
      fb["qualified_id"] ?? this.router.qualifyId(envName, String(fb["id"] ?? rawId))
    );
    const els = Array.isArray(fb["element_references"])
      ? (fb["element_references"] as Array<Record<string, unknown>>)
      : [];

    const elementLines =
      els.length > 0
        ? els
            .map(
              (el, idx) =>
                `${idx + 1}. \`<${el["tag_name"]}>\` — Selector: \`${el["selector"]}\`\n` +
                `   - DOM Path: \`${el["dom_path"] ?? "N/A"}\`\n` +
                `   - Visible Text: ${JSON.stringify(el["text_content"] ?? null)}\n` +
                `   - Bounding Box: \`${JSON.stringify(el["bounding_rect"] ?? {})}\`\n` +
                `   - Attributes: \`${JSON.stringify(el["attributes_snapshot"] ?? {})}\``
            )
            .join("\n")
        : "None selected.";

    const selectorsList = els.map((e) => String(e["selector"] ?? "")).filter(Boolean).join(", ");
    const pageUrl = String(fb["page_url"] ?? "");
    const submitterObj = asRecord(fb["submitter"]);

    const instructions = [
      `Investigate and resolve ContextDrop Feedback #${fb["id"] ?? rawId} (\`${qualified}\`, environment: \`${envName}\`, status: ${fb["status"]}).`,
      "",
      "## Reported Feedback",
      `- **Environment:** \`${envName}\``,
      `- **Message:** ${fb["message"] || "(No text message provided)"}`,
      `- **Originating Page URL:** \`${pageUrl}\``,
      `- **Submitter:** ${submitterObj["label"] || "Anonymous"}`,
      `- **Submitted At:** ${fb["created_at"]}`,
      `- **Viewport / Metadata:** \`${JSON.stringify(fb["metadata"] ?? {})}\``,
      "",
      "## Attached DOM Element References",
      elementLines,
      "",
      "## Recommended Investigation Steps",
      `1. Locate the page route corresponding to \`${pageUrl}\` (in Next.js \`app/**/page.tsx\` / \`pages/**\`, React router, or Rails \`config/routes.rb\` & \`app/views/\`).`,
      `2. Search components and templates for the attached DOM selectors (\`${selectorsList || "N/A"}\`) and data-testid / class / text landmarks.`,
      `3. Inspect any attached screenshots (\`get_feedback\` with \`id: "${qualified}"\`) to verify the visual layout or behavior issue.`,
      `4. Implement and verify the fix locally, then call \`update_feedback_status\` (\`id: "${qualified}"\`, \`status: "resolved"\`) once complete.`
    ].join("\n");

    const imageBlocks = res.content.filter((b) => b.type === "image");
    const messageContent: McpContentBlock[] = [{ type: "text", text: instructions }, ...imageBlocks];

    return this.jsonrpcResult(id, {
      description: `Investigation brief for ContextDrop Feedback ${qualified} on ${pageUrl}`,
      messages: [
        {
          role: "user",
          content: messageContent.length === 1 ? messageContent[0] : messageContent
        }
      ]
    });
  }

  private extractToolErrorMessage(res: McpToolResult): string {
    const raw = res.content[0]?.text ?? "";
    try {
      const parsed = JSON.parse(raw) as { error?: string };
      return parsed.error || raw;
    } catch {
      return raw;
    }
  }

  private jsonrpcResult(id: string | number | null, result: unknown): JsonRpcResponse {
    return {
      jsonrpc: "2.0",
      id,
      result
    };
  }

  private jsonrpcError(
    id: string | number | null,
    code: number,
    message: string
  ): JsonRpcResponse {
    return {
      jsonrpc: "2.0",
      id,
      error: {
        code,
        message
      }
    };
  }
}
