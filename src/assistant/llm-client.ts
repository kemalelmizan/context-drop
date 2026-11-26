import crypto from "node:crypto";
import type { AssistantToolDefinition } from "./tools.ts";
import { isDisallowedHostname, isLoopbackHost } from "../server/ssrf-guard.ts";

export type AssistantLlmProviderId = "anthropic" | "gemini" | "openai" | "custom";

export interface AssistantLlmCredentials {
  provider: AssistantLlmProviderId;
  apiKey: string;
  model: string;
  baseUrl?: string;
}

export interface AssistantConversationTurn {
  role: "user" | "assistant" | "tool_results";
  content?: string;
  images?: Array<{ mime_type: string; data: string }>;
  raw_assistant?: unknown;
  results?: Array<{ id: string; name: string; output: string; is_error: boolean }>;
}

export interface AssistantLlmStepResult {
  text: string;
  tool_calls: Array<{ id: string; name: string; arguments: Record<string, unknown> }>;
  raw_assistant?: unknown;
}

export type AssistantLlmTransport = (input: {
  credentials: AssistantLlmCredentials;
  system_prompt: string;
  conversation: AssistantConversationTurn[];
  tools: AssistantToolDefinition[];
  read_timeout_ms: number;
}) => Promise<AssistantLlmStepResult>;

export interface AssistantLlmConfig {
  provider?: AssistantLlmProviderId;
  apiKey?: string;
  baseUrl?: string;
  allowSharedEnv?: boolean;
  models?: { ask?: string; build?: string };
  allowedModels?: string[] | { ask?: string[]; build?: string[]; all?: string[] };
  allowClientModelOverride?: boolean;
  timeoutsMs?: { ask?: number; build?: number };
  maxIterations?: { ask?: number; build?: number };
  maxMessages?: number;
  maxMessageLength?: number;
  maxTotalMessageChars?: number;
  transport?: AssistantLlmTransport;
}

const DEFAULT_PROVIDER_MODELS: Record<AssistantLlmProviderId, string> = {
  anthropic: "claude-sonnet-4-20250514",
  gemini: "gemini-2.5-pro",
  openai: "gpt-4.1",
  custom: "anthropic/claude-sonnet-4"
};

export function validateCustomLlmBaseUrl(urlStr: string, isProduction = false): URL {
  let uri: URL;
  try {
    uri = new URL(urlStr.trim());
  } catch (err) {
    throw new Error(`Malformed LLM base URL: ${(err as Error).message}`);
  }
  if ((uri.protocol !== "http:" && uri.protocol !== "https:") || !uri.hostname) {
    throw new Error(`Invalid LLM base URL: ${urlStr}`);
  }
  if (uri.username || uri.password) {
    throw new Error("Custom LLM base URL must not include credentials");
  }
  const loopback = !isProduction && isLoopbackHost(uri.hostname);
  if (uri.protocol === "http:" && !loopback) {
    throw new Error("Custom LLM base URL must use https:// (http:// is only permitted for non-production localhost)");
  }
  if (!loopback && isDisallowedHostname(uri.hostname)) {
    throw new Error("Blocked disallowed private/metadata host in custom LLM base URL");
  }
  return uri;
}

export function isAssistantModelAllowed(
  mode: "ask" | "build",
  modelName: string,
  allowedModels?: AssistantLlmConfig["allowedModels"]
): boolean {
  if (!allowedModels) return true;
  const candidate = modelName.trim();
  if (!candidate) return false;
  const list = Array.isArray(allowedModels)
    ? allowedModels
    : allowedModels[mode] ?? allowedModels.all;
  if (!list) return true;
  return list.map((m) => m.trim()).filter(Boolean).includes(candidate);
}

export function resolveAssistantCredentials(
  mode: "ask" | "build",
  llmCfg: AssistantLlmConfig | undefined,
  options: {
    providerOverride?: string | null;
    modelOverride?: string | null;
    env?: NodeJS.ProcessEnv;
    isProduction?: boolean;
  } = {}
): AssistantLlmCredentials | null {
  const env = options.env ?? process.env;
  const allowShared = llmCfg?.allowSharedEnv !== false;

  const lookupEnv = (assistantKeys: string[], sharedKeys: string[]): string => {
    for (const k of assistantKeys) {
      const v = (env[k] ?? "").trim();
      if (v) return v;
    }
    if (!allowShared) return "";
    for (const k of sharedKeys) {
      const v = (env[k] ?? "").trim();
      if (v) return v;
    }
    return "";
  };

  const candidates: Array<{ id: AssistantLlmProviderId; key: string; baseUrl?: string }> = [
    {
      id: "anthropic",
      key:
        ((llmCfg?.provider ?? "anthropic") === "anthropic" ? llmCfg?.apiKey?.trim() : "") ||
        lookupEnv(["CONTEXT_DROP_ASSISTANT_ANTHROPIC_API_KEY"], ["ANTHROPIC_API_KEY"])
    },
    {
      id: "gemini",
      key:
        (llmCfg?.provider === "gemini" ? llmCfg.apiKey?.trim() : "") ||
        lookupEnv(
          ["CONTEXT_DROP_ASSISTANT_GEMINI_API_KEY", "CONTEXT_DROP_ASSISTANT_GOOGLE_API_KEY"],
          ["GEMINI_API_KEY", "GOOGLE_API_KEY"]
        )
    },
    {
      id: "openai",
      key:
        (llmCfg?.provider === "openai" ? llmCfg.apiKey?.trim() : "") ||
        lookupEnv(["CONTEXT_DROP_ASSISTANT_OPENAI_API_KEY"], ["OPENAI_API_KEY"])
    },
    {
      id: "custom",
      key:
        (llmCfg?.provider === "custom" ? llmCfg.apiKey?.trim() : "") ||
        lookupEnv(["CONTEXT_DROP_ASSISTANT_LLM_API_KEY"], ["CONTEXT_DROP_LLM_API_KEY", "OPENROUTER_API_KEY"]),
      baseUrl:
        llmCfg?.baseUrl?.trim() ||
        (env["CONTEXT_DROP_ASSISTANT_LLM_BASE_URL"] ?? "").trim() ||
        (allowShared ? (env["CONTEXT_DROP_LLM_BASE_URL"] ?? "").trim() : "") ||
        "https://openrouter.ai/api/v1"
    }
  ];

  const requestedProv = (options.providerOverride || llmCfg?.provider || "").trim().toLowerCase() as
    | AssistantLlmProviderId
    | "";

  const chosen = requestedProv
    ? candidates.find((c) => c.id === requestedProv)
    : candidates.find((c) => Boolean(c.key));
  if (!chosen) return null;

  const canUseKeylessLocal =
    chosen.id === "custom" &&
    !options.isProduction &&
    Boolean(chosen.baseUrl) &&
    (() => {
      try {
        return isLoopbackHost(new URL(chosen.baseUrl!).hostname);
      } catch {
        return false;
      }
    })();

  if (!chosen.key && !canUseKeylessLocal && !llmCfg?.transport) {
    return null;
  }
  if (!chosen.key && !canUseKeylessLocal && llmCfg?.transport && !llmCfg?.apiKey) {
    return null;
  }

  const configuredModeModel = llmCfg?.models?.[mode]?.trim();
  const model =
    (options.modelOverride ?? "").trim() ||
    configuredModeModel ||
    DEFAULT_PROVIDER_MODELS[chosen.id];

  return {
    provider: chosen.id,
    apiKey: chosen.key,
    model,
    baseUrl: chosen.baseUrl
  };
}

export async function completeAssistantLlmStep(input: {
  credentials: AssistantLlmCredentials;
  system_prompt: string;
  conversation: AssistantConversationTurn[];
  tools: AssistantToolDefinition[];
  read_timeout_ms: number;
  is_production?: boolean;
  transport?: AssistantLlmTransport;
}): Promise<AssistantLlmStepResult> {
  if (input.transport) {
    return input.transport(input);
  }

  const { credentials, system_prompt, conversation, tools, read_timeout_ms } = input;
  if (credentials.provider === "anthropic") {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(read_timeout_ms),
      headers: {
        "Content-Type": "application/json",
        "x-api-key": credentials.apiKey,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: credentials.model,
        max_tokens: 4096,
        system: system_prompt,
        tools: tools.map((t) => ({
          name: t.name,
          description: t.description,
          input_schema: t.parameters ?? { type: "object", properties: {} }
        })),
        messages: conversation.map((turn) => {
          if (turn.role === "user") {
            const blocks: Array<Record<string, unknown>> = [];
            for (const img of turn.images ?? []) {
              blocks.push({
                type: "image",
                source: { type: "base64", media_type: img.mime_type, data: img.data }
              });
            }
            blocks.push({ type: "text", text: turn.content ?? "" });
            return { role: "user", content: blocks };
          }
          if (turn.role === "assistant") {
            return Array.isArray(turn.raw_assistant) && turn.raw_assistant.length > 0
              ? { role: "assistant", content: turn.raw_assistant }
              : { role: "assistant", content: turn.content ?? "" };
          }
          return {
            role: "user",
            content: (turn.results ?? []).map((r) => ({
              type: "tool_result",
              tool_use_id: r.id,
              content: r.output,
              is_error: r.is_error
            }))
          };
        })
      })
    });
    if (!res.ok) {
      throw new Error(`Anthropic API error (HTTP ${res.status})`);
    }
    const parsed = (await res.json()) as { content?: Array<Record<string, unknown>> };
    const blocks = Array.isArray(parsed.content) ? parsed.content : [];
    const texts: string[] = [];
    const calls: AssistantLlmStepResult["tool_calls"] = [];
    for (const blk of blocks) {
      if (blk["type"] === "text") texts.push(String(blk["text"] ?? ""));
      if (blk["type"] === "tool_use") {
        calls.push({
          id: String(blk["id"] ?? ""),
          name: String(blk["name"] ?? ""),
          arguments:
            blk["input"] && typeof blk["input"] === "object" && !Array.isArray(blk["input"])
              ? (blk["input"] as Record<string, unknown>)
              : {}
        });
      }
    }
    return { text: texts.join("\n").trim(), tool_calls: calls, raw_assistant: blocks };
  }

  if (credentials.provider === "gemini") {
    const modelSlug = encodeURIComponent(credentials.model.replace(/^models\//, ""));
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${modelSlug}:generateContent`,
      {
        method: "POST",
        redirect: "error",
        signal: AbortSignal.timeout(read_timeout_ms),
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": credentials.apiKey
        },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system_prompt }] },
          contents: conversation.map((turn) => {
            if (turn.role === "user") {
              const parts: Array<Record<string, unknown>> = [];
              for (const img of turn.images ?? []) {
                parts.push({ inlineData: { mimeType: img.mime_type, data: img.data } });
              }
              parts.push({ text: turn.content ?? "" });
              return { role: "user", parts };
            }
            if (turn.role === "assistant") {
              return Array.isArray(turn.raw_assistant) && turn.raw_assistant.length > 0
                ? { role: "model", parts: turn.raw_assistant }
                : { role: "model", parts: [{ text: turn.content ?? "" }] };
            }
            return {
              role: "user",
              parts: (turn.results ?? []).map((r) => ({
                functionResponse: {
                  name: r.name,
                  response: { result: r.output, is_error: r.is_error }
                }
              }))
            };
          }),
          tools: [
            {
              functionDeclarations: tools.map((t) => ({
                name: t.name,
                description: t.description,
                parameters: t.parameters ?? { type: "object", properties: {} }
              }))
            }
          ]
        })
      }
    );
    if (!res.ok) {
      throw new Error(`Gemini API error (HTTP ${res.status})`);
    }
    const parsed = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<Record<string, unknown>> } }>;
    };
    const parts = parsed.candidates?.[0]?.content?.parts ?? [];
    const texts: string[] = [];
    const calls: AssistantLlmStepResult["tool_calls"] = [];
    for (const part of parts) {
      if (typeof part["text"] === "string" && !part["thought"]) texts.push(part["text"]);
      if (part["functionCall"] && typeof part["functionCall"] === "object") {
        const fc = part["functionCall"] as Record<string, unknown>;
        calls.push({
          id: `gem_${crypto.randomBytes(5).toString("hex")}`,
          name: String(fc["name"] ?? ""),
          arguments:
            fc["args"] && typeof fc["args"] === "object" && !Array.isArray(fc["args"])
              ? (fc["args"] as Record<string, unknown>)
              : {}
        });
      }
    }
    return { text: texts.join("\n").trim(), tool_calls: calls, raw_assistant: parts };
  }

  const base =
    credentials.provider === "openai"
      ? "https://api.openai.com/v1"
      : (credentials.baseUrl ?? "https://openrouter.ai/api/v1").replace(/\/+$/, "");
  const uri = validateCustomLlmBaseUrl(`${base}/chat/completions`, Boolean(input.is_production));
  const messages: Array<Record<string, unknown>> = [{ role: "system", content: system_prompt }];
  for (const turn of conversation) {
    if (turn.role === "user") {
      if (turn.images && turn.images.length > 0) {
        messages.push({
          role: "user",
          content: [
            { type: "text", text: turn.content ?? "" },
            ...turn.images.map((img) => ({
              type: "image_url",
              image_url: { url: `data:${img.mime_type};base64,${img.data}` }
            }))
          ]
        });
      } else {
        messages.push({ role: "user", content: turn.content ?? "" });
      }
    } else if (turn.role === "assistant") {
      messages.push(
        turn.raw_assistant && typeof turn.raw_assistant === "object"
          ? (turn.raw_assistant as Record<string, unknown>)
          : { role: "assistant", content: turn.content ?? "" }
      );
    } else {
      for (const r of turn.results ?? []) {
        messages.push({ role: "tool", tool_call_id: r.id, content: r.output });
      }
    }
  }

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (credentials.apiKey) headers["Authorization"] = `Bearer ${credentials.apiKey}`;
  const res = await fetch(uri.toString(), {
    method: "POST",
    redirect: "error",
    signal: AbortSignal.timeout(read_timeout_ms),
    headers,
    body: JSON.stringify({
      model: credentials.model,
      messages,
      tools: tools.map((t) => ({
        type: "function",
        function: {
          name: t.name,
          description: t.description,
          parameters: t.parameters ?? { type: "object", properties: {} }
        }
      }))
    })
  });
  if (!res.ok) {
    throw new Error(`LLM API error (HTTP ${res.status})`);
  }
  const parsed = (await res.json()) as {
    choices?: Array<{ message?: Record<string, unknown> }>;
  };
  const msg = parsed.choices?.[0]?.message ?? {};
  const rawCalls = Array.isArray(msg["tool_calls"])
    ? (msg["tool_calls"] as Array<Record<string, unknown>>)
    : [];
  const calls = rawCalls.map((tc) => {
    const fn = (tc["function"] as Record<string, unknown> | undefined) ?? {};
    let args: Record<string, unknown> = {};
    try {
      const parsedArgs = JSON.parse(String(fn["arguments"] ?? "{}"));
      if (parsedArgs && typeof parsedArgs === "object" && !Array.isArray(parsedArgs)) {
        args = parsedArgs as Record<string, unknown>;
      }
    } catch {
      args = {};
    }
    return {
      id: String(tc["id"] ?? ""),
      name: String(fn["name"] ?? ""),
      arguments: args
    };
  });

  return {
    text: String(msg["content"] ?? "").trim(),
    tool_calls: calls,
    raw_assistant: msg
  };
}
