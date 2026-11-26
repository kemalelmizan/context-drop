import type { NormalizedRemoteEnvConfig } from "./environment-router.ts";
import { redactSecretsFromText } from "../notifications/secrets.ts";
import {
  assertResolvedPublicHost,
  isDisallowedHostname
} from "../server/ssrf-guard.ts";

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
const DEFAULT_TIMEOUT_MS = 12_000;

function isDisallowedPrivateHost(host: string): boolean {
  return isDisallowedHostname(host);
}

export interface McpContentBlock {
  type: string;
  text?: string;
  data?: string;
  mimeType?: string;
  [key: string]: unknown;
}

export interface McpToolResult {
  content: McpContentBlock[];
  isError: boolean;
}

export type RemoteMcpTransport = (
  envName: string,
  envConfig: NormalizedRemoteEnvConfig,
  method: string,
  params: Record<string, unknown>
) => Promise<unknown>;

export class RemoteMcpError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RemoteMcpError";
  }
}

export function validateRemoteMcpUrl(
  envName: string,
  urlStr: string,
  allowInsecureHttp = false
): URL {
  let parsed: URL;
  try {
    parsed = new URL(urlStr);
  } catch (err) {
    throw new RemoteMcpError(
      `Malformed MCP URL for environment '${envName}': ${redactSecretsFromText((err as Error).message)}`
    );
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new RemoteMcpError(
      `Invalid MCP URL for environment '${envName}': ${redactSecretsFromText(urlStr)}`
    );
  }

  const isProd =
    (process.env.CONTEXT_DROP_ENV ?? process.env.NODE_ENV ?? "").trim().toLowerCase() ===
    "production";
  const effectiveInsecure = !isProd && Boolean(allowInsecureHttp);
  const cleanHost = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  const isLoopback = LOOPBACK_HOSTS.has(parsed.hostname.toLowerCase()) || LOOPBACK_HOSTS.has(cleanHost);
  if (parsed.protocol === "http:" && (!isLoopback || isProd) && !effectiveInsecure) {
    throw new RemoteMcpError(
      `Insecure HTTP MCP URL refused for remote environment '${envName}' (use https://)`
    );
  }
  if (!isLoopback && !effectiveInsecure && isDisallowedPrivateHost(cleanHost)) {
    throw new RemoteMcpError(
      `Blocked disallowed private/metadata MCP URL host for environment '${envName}'`
    );
  }

  return parsed;
}

export class RemoteMcpClient {
  private readonly transport?: RemoteMcpTransport;

  constructor(options: { transport?: RemoteMcpTransport } = {}) {
    this.transport = options.transport;
  }

  public async callRpc(
    envName: string,
    envConfig: NormalizedRemoteEnvConfig,
    method: string,
    params: Record<string, unknown> = {}
  ): Promise<unknown> {
    if (this.transport) {
      return this.transport(envName, envConfig, method, params);
    }

    const parsedUrl = validateRemoteMcpUrl(envName, envConfig.url, envConfig.allowInsecureHttp);
    const isProd =
      (process.env.CONTEXT_DROP_ENV ?? process.env.NODE_ENV ?? "").trim().toLowerCase() ===
      "production";
    const allowLocal =
      !isProd &&
      (LOOPBACK_HOSTS.has(parsedUrl.hostname.toLowerCase()) || Boolean(envConfig.allowInsecureHttp));
    try {
      await assertResolvedPublicHost(parsedUrl.hostname, { allowLoopback: allowLocal });
    } catch (err) {
      throw new RemoteMcpError(
        `Blocked SSRF / disallowed remote MCP target '${envName}': ${(err as Error).message}`
      );
    }

    const payload = {
      jsonrpc: "2.0",
      id: `fed_${envName}_${Date.now()}`,
      method,
      params
    };

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
      "X-Context-Drop-Federated": "1",
      ...envConfig.headers
    };

    if (envConfig.apiKey) {
      headers["Authorization"] = `Bearer ${envConfig.apiKey}`;
    }

    let response: Response;
    try {
      response = await fetch(parsedUrl.toString(), {
        method: "POST",
        redirect: "error",
        headers,
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS)
      });
    } catch (err) {
      throw new RemoteMcpError(
        `Failed to reach remote environment '${envName}': ${redactSecretsFromText((err as Error).message, [envConfig.apiKey])}`
      );
    }

    if (!response.ok) {
      throw new RemoteMcpError(
        `Remote environment '${envName}' returned HTTP ${response.status}`
      );
    }

    let json: Record<string, unknown>;
    try {
      json = (await response.json()) as Record<string, unknown>;
    } catch (err) {
      throw new RemoteMcpError(
        `Invalid JSON from remote environment '${envName}': ${redactSecretsFromText((err as Error).message, [envConfig.apiKey])}`
      );
    }

    if (json && typeof json["error"] === "object" && json["error"] !== null) {
      const errObj = json["error"] as Record<string, unknown>;
      throw new RemoteMcpError(
        `Remote environment '${envName}' error: ${redactSecretsFromText(String(errObj["message"] ?? "Unknown error"), [envConfig.apiKey])}`
      );
    }

    return json ? json["result"] : null;
  }

  public async callTool(
    envName: string,
    envConfig: NormalizedRemoteEnvConfig,
    toolName: string,
    args: Record<string, unknown> = {}
  ): Promise<McpToolResult> {
    const cleanArgs = { ...args };
    delete cleanArgs["environment"];

    const rawResult = await this.callRpc(envName, envConfig, "tools/call", {
      name: toolName,
      arguments: cleanArgs
    });

    if (!rawResult || typeof rawResult !== "object") {
      throw new RemoteMcpError(`Unexpected tool response from '${envName}'`);
    }

    const resObj = rawResult as Record<string, unknown>;
    const content = Array.isArray(resObj["content"])
      ? (resObj["content"] as McpContentBlock[])
      : [];

    return {
      content,
      isError: Boolean(resObj["isError"])
    };
  }
}

