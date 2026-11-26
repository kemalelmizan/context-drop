import dns from "node:dns";
import net from "node:net";

export const MAX_URL_LENGTH = 2048;
export const MAX_PROMPT_URL_LENGTH = 512;
export const DEFAULT_LARK_HOSTS = ["open.larksuite.com", "open.feishu.cn"] as const;

const CONTROL_CHARS_RE = /[\r\n\0\t]/;
const INTERNAL_HOST_SUFFIXES = [
  ".localhost",
  ".local",
  ".internal",
  ".nip.io",
  ".sslip.io",
  ".xip.io"
] as const;

const EMBEDDED_PRIVATE_IPV4_RE =
  /(?:^|[.-])(?:127(?:\.\d{1,3}){3}|10(?:\.\d{1,3}){3}|169\.254(?:\.\d{1,3}){2}|192\.168(?:\.\d{1,3}){2}|172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2}|100\.(?:6[4-9]|[7-9]\d|1[01]\d|12[0-7])(?:\.\d{1,3}){2}|0\.0\.0\.0)(?:[.-]|$)/i;

export function normalizeHostname(host: string): string {
  return host.trim().toLowerCase().replace(/^\[|\]$/g, "").replace(/\.+$/, "");
}

export function isLoopbackHost(host: string): boolean {
  const clean = normalizeHostname(host);
  if (!clean) return false;
  if (clean === "localhost" || clean.endsWith(".localhost") || clean === "127.0.0.1" || clean === "::1") {
    return true;
  }
  const match = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(clean);
  if (match && Number(match[1]) === 127) return true;
  return false;
}

function isDisallowedIpv4(octets: number[]): boolean {
  const [a, b, c, d] = octets;
  if (
    a === undefined ||
    b === undefined ||
    c === undefined ||
    d === undefined ||
    [a, b, c, d].some((n) => !Number.isInteger(n) || n < 0 || n > 255)
  ) {
    return true;
  }
  if (a === 10 || a === 127 || a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64.0.0/10
  if (a >= 224) return true; // Multicast & reserved
  return false;
}

export function isDisallowedIp(ipRaw: string): boolean {
  const clean = normalizeHostname(ipRaw);
  const ipVersion = net.isIP(clean);
  if (ipVersion === 0) return false;

  if (ipVersion === 4) {
    return isDisallowedIpv4(clean.split(".").map(Number));
  }

  // IPv6
  if (
    clean === "::1" ||
    clean === "::" ||
    clean.startsWith("fe8") ||
    clean.startsWith("fe9") ||
    clean.startsWith("fea") ||
    clean.startsWith("feb") ||
    clean.startsWith("fc") ||
    clean.startsWith("fd") ||
    clean.startsWith("ff")
  ) {
    return true;
  }

  // IPv4-mapped IPv6 (dotted `::ffff:169.254.169.254` or hex `::ffff:a9fe:a9fe`)
  if (clean.startsWith("::ffff:")) {
    const tail = clean.slice(7);
    if (net.isIP(tail) === 4) {
      return isDisallowedIpv4(tail.split(".").map(Number));
    }
    const hexMatch = /^([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i.exec(tail);
    if (hexMatch) {
      const hi = parseInt(hexMatch[1]!, 16);
      const lo = parseInt(hexMatch[2]!, 16);
      return isDisallowedIpv4([(hi >> 8) & 0xff, hi & 0xff, (lo >> 8) & 0xff, lo & 0xff]);
    }
  }

  return false;
}

export function isDisallowedHostname(host: string): boolean {
  const clean = normalizeHostname(host);
  if (!clean) return true;
  if (clean === "localhost" || clean === "metadata" || clean === "metadata.google.internal") {
    return true;
  }
  if (INTERNAL_HOST_SUFFIXES.some((suffix) => clean.endsWith(suffix))) {
    return true;
  }
  if (EMBEDDED_PRIVATE_IPV4_RE.test(clean)) {
    return true;
  }
  if (net.isIP(clean) !== 0) {
    return isDisallowedIp(clean);
  }
  return false;
}

export async function assertResolvedPublicHost(
  host: string,
  options?: { allowLoopback?: boolean }
): Promise<void> {
  const clean = normalizeHostname(host);
  if (!clean) {
    throw new Error("Target URL host missing");
  }
  if (options?.allowLoopback && isLoopbackHost(clean)) {
    return;
  }
  if (isDisallowedHostname(clean)) {
    throw new Error(`Blocked disallowed private/metadata host '${clean}'`);
  }
  if (net.isIP(clean) !== 0) {
    return;
  }

  let records: Array<{ address: string }>;
  try {
    records = await dns.promises.lookup(clean, { all: true, verbatim: true });
  } catch (err) {
    throw new Error(`Unable to resolve host '${clean}': ${(err as Error).message}`);
  }

  if (!records || records.length === 0) {
    throw new Error(`Unable to resolve host '${clean}'`);
  }

  for (const rec of records) {
    if (isDisallowedIp(rec.address)) {
      throw new Error(
        `Blocked DNS rebinding / private IP resolution (${rec.address}) for host '${clean}'`
      );
    }
  }
}

export function safeExternalHttpUrl(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const str = raw.trim();
  if (!str || str.length > MAX_URL_LENGTH || CONTROL_CHARS_RE.test(str)) {
    return null;
  }
  try {
    const parsed = new URL(str);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    if (!parsed.hostname) return null;
    if (parsed.username || parsed.password) return null;
    return str;
  } catch {
    return null;
  }
}

export function safeHref(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const str = raw.trim();
  if (!str || str.length > MAX_URL_LENGTH || CONTROL_CHARS_RE.test(str)) {
    return null;
  }
  if (/^\/(?!\/)/.test(str)) {
    return str;
  }
  return safeExternalHttpUrl(str);
}

export function isSafePageUrl(raw: unknown): boolean {
  return safeHref(raw) !== null;
}

export function sanitizePromptUrl(raw: unknown, fallback = "unknown"): string {
  const cleaned = String(raw ?? "")
    .replace(/[\r\n\0\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return fallback;
  return cleaned.slice(0, MAX_PROMPT_URL_LENGTH);
}
