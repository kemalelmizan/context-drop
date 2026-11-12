import type { RemoteMcpEnvironmentConfig } from "../server/types.ts";

export interface NormalizedRemoteEnvConfig {
  url: string;
  apiKey: string;
  headers: Record<string, string>;
  allowInsecureHttp: boolean;
}

export interface AvailableMcpEnvironmentInfo {
  name: string;
  aliases: string[];
  mode: "local_db" | "remote_http";
  url?: string;
  has_api_key?: boolean;
  configured: boolean;
  reachable?: boolean;
  error?: string;
}

export type EnvVarMap = Record<string, string | undefined>;

export function resolveHostEnvironment(
  explicit?: string,
  envVars: EnvVarMap = process.env
): string {
  const trimmed = (explicit ?? "").trim().toLowerCase();
  if (trimmed.length > 0) return trimmed;

  const fromEnv = (
    envVars["CONTEXT_DROP_ENV"] ||
    envVars["VERCEL_ENV"] ||
    envVars["NEXT_PUBLIC_VERCEL_ENV"] ||
    envVars["RAILS_ENV"] ||
    envVars["NODE_ENV"] ||
    "development"
  )
    .trim()
    .toLowerCase();

  return fromEnv || "development";
}

function normalizeRemoteEntry(
  name: string,
  rawCfg: unknown
): { name: string; config: NormalizedRemoteEnvConfig } | null {
  const envName = name.trim().toLowerCase();
  if (!envName || envName === "local" || envName === "all") return null;
  if (!rawCfg || typeof rawCfg !== "object" || Array.isArray(rawCfg)) return null;

  const rec = rawCfg as Record<string, unknown>;
  const url = String(rec["url"] ?? "").trim();
  if (!url) return null;

  const rawHeaders = rec["headers"];
  const headers: Record<string, string> = {};
  if (rawHeaders && typeof rawHeaders === "object" && !Array.isArray(rawHeaders)) {
    for (const [k, v] of Object.entries(rawHeaders as Record<string, unknown>)) {
      if (k.trim()) {
        headers[k.trim()] = String(v ?? "");
      }
    }
  }

  const apiKey = String(rec["apiKey"] ?? rec["api_key"] ?? "").trim();
  const allowInsecureHttp = Boolean(
    rec["allowInsecureHttp"] ?? rec["allow_insecure_http"] ?? false
  );

  return {
    name: envName,
    config: {
      url,
      apiKey,
      headers,
      allowInsecureHttp
    }
  };
}

export function resolveEffectiveMcpEnvironments(
  explicitMap?: Record<string, RemoteMcpEnvironmentConfig>,
  envVars: EnvVarMap = process.env
): Record<string, NormalizedRemoteEnvConfig> {
  const merged: Record<string, NormalizedRemoteEnvConfig> = {};

  const rawJson = (envVars["CONTEXT_DROP_REMOTE_ENVIRONMENTS"] ?? "").trim();
  if (rawJson) {
    try {
      const parsed = JSON.parse(rawJson) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        for (const [name, cfg] of Object.entries(parsed as Record<string, unknown>)) {
          const norm = normalizeRemoteEntry(name, cfg);
          if (norm) merged[norm.name] = norm.config;
        }
      }
    } catch {
      // Ignore malformed JSON env variable
    }
  }

  for (const [key, val] of Object.entries(envVars)) {
    const match = /^CONTEXT_DROP_([A-Z0-9_]+)_MCP_URL$/.exec(key);
    if (!match) continue;
    const tokenKey = match[1];
    if (!tokenKey) continue;
    const urlStr = (val ?? "").trim();
    if (!urlStr) continue;

    const envName = tokenKey.toLowerCase();
    const apiKey = (envVars[`CONTEXT_DROP_${tokenKey}_MCP_API_KEY`] ?? "").trim();
    const allowInsecure =
      (envVars[`CONTEXT_DROP_${tokenKey}_MCP_ALLOW_INSECURE_HTTP`] ?? "").trim() === "true";
    const norm = normalizeRemoteEntry(envName, {
      url: urlStr,
      apiKey,
      allowInsecureHttp: allowInsecure
    });
    if (norm) merged[norm.name] = norm.config;
  }

  if (explicitMap) {
    for (const [name, cfg] of Object.entries(explicitMap)) {
      const norm = normalizeRemoteEntry(name, cfg);
      if (norm) merged[norm.name] = norm.config;
    }
  }

  return merged;
}

export function redactEndpointUrl(urlStr: string): string {
  try {
    const parsed = new URL(urlStr);
    const portSuffix =
      parsed.port && parsed.port !== "80" && parsed.port !== "443" ? `:${parsed.port}` : "";
    return `${parsed.protocol}//${parsed.hostname}${portSuffix}${parsed.pathname}`;
  } catch {
    return urlStr;
  }
}

export class EnvironmentRouter {
  public readonly hostEnvironment: string;
  public readonly localOnly: boolean;
  private readonly remotes: Record<string, NormalizedRemoteEnvConfig>;

  constructor(options: {
    hostEnvironment?: string;
    environments?: Record<string, RemoteMcpEnvironmentConfig>;
    localOnly?: boolean;
    envVars?: EnvVarMap;
  } = {}) {
    const envVars = options.envVars ?? process.env;
    this.hostEnvironment = resolveHostEnvironment(options.hostEnvironment, envVars);
    this.localOnly = Boolean(options.localOnly);

    if (this.localOnly) {
      this.remotes = {};
    } else {
      const all = resolveEffectiveMcpEnvironments(options.environments, envVars);
      delete all[this.hostEnvironment];
      this.remotes = all;
    }
  }

  public getRemoteEnvironments(): Record<string, NormalizedRemoteEnvConfig> {
    return { ...this.remotes };
  }

  public getRemoteConfig(envName: string | null | undefined): NormalizedRemoteEnvConfig | null {
    if (!envName) return null;
    return this.remotes[envName.trim().toLowerCase()] ?? null;
  }

  public getAvailableEnvironments(): AvailableMcpEnvironmentInfo[] {
    const list: AvailableMcpEnvironmentInfo[] = [
      {
        name: this.hostEnvironment,
        aliases: this.hostEnvironment === "local" ? [] : ["local"],
        mode: "local_db",
        configured: true
      }
    ];

    for (const [name, cfg] of Object.entries(this.remotes)) {
      list.push({
        name,
        aliases: [],
        mode: "remote_http",
        url: redactEndpointUrl(cfg.url),
        has_api_key: cfg.apiKey.length > 0,
        configured: true
      });
    }

    return list;
  }

  public parseTarget(
    rawId: string | number,
    explicitEnvironment?: string | null
  ): [string | null, string] {
    let envStr = (explicitEnvironment ?? "").trim().toLowerCase();
    let idStr = String(rawId).trim();

    const colonIdx = idStr.indexOf(":");
    if (colonIdx > 0 && colonIdx < idStr.length - 1) {
      const prefix = idStr.slice(0, colonIdx).trim().toLowerCase();
      const rest = idStr.slice(colonIdx + 1).trim();
      if (prefix && rest) {
        if (!envStr) envStr = prefix;
        idStr = rest;
      }
    }

    return [envStr || null, idStr];
  }

  public isLocalTarget(envName: string | null | undefined): boolean {
    if (!envName || !envName.trim()) return true;
    const norm = envName.trim().toLowerCase();
    return norm === "local" || norm === this.hostEnvironment;
  }

  public qualifyId(envName: string, id: string | number): string {
    return `${envName}:${id}`;
  }
}
