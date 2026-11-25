export const ASK_FORBIDDEN_PREFIXES: readonly string[] = [
  "git_",
  "change_set_",
  "pull_request_",
  "repo_",
  "deploy_",
  "run_shell"
];

export const BUILD_READ_TOOL_SPECS: ReadonlyArray<{ name: string; description: string }> = [
  { name: "build_context_resolve", description: "Resolve routes and allowed file globs for page URL and pins." },
  { name: "repo_read_file", description: "Read an allowlisted repository file." },
  { name: "repo_search", description: "Search repository code within allowlisted directories." },
  { name: "build_status_get", description: "Fetch CI and preview status for a ChangeSet." }
];

export const BUILD_WRITE_TOOL_SPECS: ReadonlyArray<{ name: string; description: string }> = [
  { name: "git_create_branch", description: "Create a feature branch from default base branch." },
  { name: "git_apply_patches", description: "Commit staged ChangeSet patches to the feature branch." },
  { name: "git_push_branch", description: "Push feature branch to remote repository." },
  { name: "pull_request_open", description: "Open a pull request for the pushed feature branch." },
  { name: "change_set_abandon", description: "Close pull request and abandon feature branch." }
];

export const NULL_BUILD_ADAPTER_MESSAGE =
  "Host Build pack not configured. Register buildTools on createContextDropNextHandler / createContextDropFetchHandler to enable git/CI integration.";

export interface AssistantToolDefinition {
  name: string;
  description: string;
  parameters?: Record<string, unknown>;
}

export type AssistantToolHandler = (
  args: Record<string, unknown>
) => Promise<unknown> | unknown;

export interface RegisteredAssistantTool {
  name: string;
  description: string;
  parameters?: Record<string, unknown>;
  write?: boolean;
  execute: AssistantToolHandler;
}

export class AssistantToolConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AssistantToolConfigError";
  }
}

export function validateAskToolName(name: string, allowCodeToolsInAsk = false): void {
  const clean = name.trim();
  if (!clean) {
    throw new AssistantToolConfigError("Ask tool name cannot be empty");
  }
  for (const prefix of ASK_FORBIDDEN_PREFIXES) {
    if (allowCodeToolsInAsk && prefix === "repo_") continue;
    if (clean.startsWith(prefix)) {
      throw new AssistantToolConfigError(
        `Ask tool '${clean}' is forbidden (matches '${prefix}')`
      );
    }
  }
}

export const PROPOSE_CHANGE_SET_DEFINITION: AssistantToolDefinition = {
  name: "propose_change_set",
  description: "Stage a ChangeSet with file patches for user approval (does not write to git).",
  parameters: {
    type: "object",
    required: ["summary", "patches"],
    properties: {
      summary: { type: "string" },
      patches: {
        type: "array",
        items: {
          type: "object",
          required: ["path", "old_string", "new_string"],
          properties: {
            path: { type: "string" },
            old_string: { type: "string" },
            new_string: { type: "string" }
          }
        }
      }
    }
  }
};

export class AssistantToolRegistry {
  private readonly askEntries: RegisteredAssistantTool[] = [];
  private readonly buildEntries: RegisteredAssistantTool[] = [];

  constructor(options: {
    askTools?: RegisteredAssistantTool[];
    buildTools?: RegisteredAssistantTool[];
    allowCodeToolsInAsk?: boolean;
  } = {}) {
    for (const tool of options.askTools ?? []) {
      validateAskToolName(tool.name, Boolean(options.allowCodeToolsInAsk));
      this.askEntries.push({ ...tool, write: false });
    }

    if (options.buildTools && options.buildTools.length > 0) {
      for (const tool of options.buildTools) {
        this.buildEntries.push({ ...tool, write: Boolean(tool.write) });
      }
    } else {
      for (const spec of BUILD_READ_TOOL_SPECS) {
        this.buildEntries.push({
          name: spec.name,
          description: spec.description,
          parameters: { type: "object", properties: {} },
          write: false,
          execute: () => ({ error: NULL_BUILD_ADAPTER_MESSAGE })
        });
      }
      for (const spec of BUILD_WRITE_TOOL_SPECS) {
        this.buildEntries.push({
          name: spec.name,
          description: spec.description,
          parameters: { type: "object", properties: {} },
          write: true,
          execute: () => ({ error: NULL_BUILD_ADAPTER_MESSAGE })
        });
      }
    }
  }

  public toolsForMode(mode: "ask" | "build", allowWrite = false): AssistantToolDefinition[] {
    if (mode === "ask") {
      return this.askEntries.map((t) => ({
        name: t.name,
        description: t.description,
        parameters: t.parameters ?? { type: "object", properties: {} }
      }));
    }

    const defs: AssistantToolDefinition[] = [PROPOSE_CHANGE_SET_DEFINITION];
    for (const entry of this.buildEntries) {
      if (entry.write && !allowWrite) continue;
      defs.push({
        name: entry.name,
        description: entry.description,
        parameters: entry.parameters ?? { type: "object", properties: {} }
      });
    }
    return defs;
  }

  public async callTool(
    mode: "ask" | "build",
    name: string,
    args: Record<string, unknown>,
    allowWrite = false
  ): Promise<{ data?: unknown; error?: string; is_error: boolean }> {
    const list = mode === "ask" ? this.askEntries : this.buildEntries;
    const entry = list.find((e) => e.name === name && (allowWrite || !e.write));
    if (!entry) {
      throw new AssistantToolConfigError(`Tool not allowed: ${name}`);
    }
    try {
      const res = await entry.execute(args);
      if (res && typeof res === "object" && !Array.isArray(res)) {
        const rec = res as Record<string, unknown>;
        if (rec["is_error"] === true || typeof rec["error"] === "string") {
          return {
            error: String(rec["error"] ?? "Tool execution error"),
            data: res,
            is_error: true
          };
        }
      }
      return { data: res, is_error: false };
    } catch (err) {
      return { error: (err as Error).message || "Tool execution failed", is_error: true };
    }
  }
}
