import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const CIPHER = "aes-256-gcm";

function resolveMasterKey(secret?: string, storageDir?: string): Buffer {
  const candidates = [
    secret,
    process.env.CONTEXT_DROP_OWNERSHIP_SECRET,
    process.env.CONTEXT_DROP_SECRET_KEY,
    process.env.CONTEXT_DROP_SECRET
  ];
  for (const cand of candidates) {
    const explicit = (cand ?? "").trim();
    if (explicit.length >= 16) {
      return crypto.createHash("sha256").update(explicit, "utf8").digest();
    }
  }

  const base = storageDir ?? path.join(process.cwd(), ".context-drop");
  const keyPath = path.join(base, "notification.key");
  if (fs.existsSync(keyPath)) {
    const raw = fs.readFileSync(keyPath);
    try {
      fs.chmodSync(keyPath, 0o600);
    } catch {
      // Non-fatal on filesystems without POSIX chmod
    }
    if (raw.byteLength === 32) return raw;
  }
  fs.mkdirSync(base, { recursive: true });
  const fresh = crypto.randomBytes(32);
  const tmpPath = `${keyPath}.tmp.${crypto.randomBytes(4).toString("hex")}`;
  fs.writeFileSync(tmpPath, fresh, { mode: 0o600 });
  try {
    fs.chmodSync(tmpPath, 0o600);
  } catch {
    // Non-fatal
  }
  fs.renameSync(tmpPath, keyPath);
  return fresh;
}

export function encryptSecrets(
  hash: Record<string, string>,
  options?: { secret?: string; storageDir?: string }
): Record<string, string> {
  const key = resolveMasterKey(options?.secret, options?.storageDir);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(CIPHER, key, iv);
  const plaintext = JSON.stringify(hash);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    v: "1",
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    ciphertext: ciphertext.toString("base64")
  };
}

export function decryptSecrets(
  blob: Record<string, unknown> | null | undefined,
  options?: { secret?: string; storageDir?: string }
): Record<string, string> {
  if (!blob || typeof blob !== "object") return {};
  const ivB64 = String(blob["iv"] ?? "");
  const tagB64 = String(blob["tag"] ?? "");
  const ctB64 = String(blob["ciphertext"] ?? "");
  if (!ivB64 || !tagB64 || !ctB64) return {};
  try {
    const key = resolveMasterKey(options?.secret, options?.storageDir);
    const decipher = crypto.createDecipheriv(CIPHER, key, Buffer.from(ivB64, "base64"));
    decipher.setAuthTag(Buffer.from(tagB64, "base64"));
    const plain = Buffer.concat([
      decipher.update(Buffer.from(ctB64, "base64")),
      decipher.final()
    ]).toString("utf8");
    const parsed = JSON.parse(plain) as Record<string, string>;
    return Object.fromEntries(
      Object.entries(parsed).map(([k, v]) => [k, String(v)])
    );
  } catch {
    return {};
  }
}

export function maskSecret(raw: string | undefined | null): string | null {
  const str = String(raw ?? "").trim();
  if (!str) return null;
  if (str.length <= 6) return "••••••••";
  return `••••${str.slice(-4)}`;
}

export function redactSecretsFromText(
  input: string | undefined | null,
  extraSecrets: Array<string | undefined | null> = []
): string {
  let out = String(input ?? "");
  if (!out) return out;

  const envCandidates = [
    process.env.CONTEXT_DROP_MCP_API_KEY,
    process.env.CONTEXT_DROP_SECRET_KEY,
    process.env.CONTEXT_DROP_OWNERSHIP_SECRET,
    process.env.CONTEXT_DROP_SECRET,
    process.env.CONTEXT_DROP_INTEGRATIONS_API_KEY,
    process.env.CONTEXT_DROP_LLM_API_KEY,
    process.env.CONTEXT_DROP_ASSISTANT_LLM_API_KEY,
    process.env.CONTEXT_DROP_ASSISTANT_ANTHROPIC_API_KEY,
    process.env.CONTEXT_DROP_ASSISTANT_OPENAI_API_KEY,
    process.env.CONTEXT_DROP_ASSISTANT_GEMINI_API_KEY,
    process.env.ANTHROPIC_API_KEY,
    process.env.OPENAI_API_KEY,
    process.env.GEMINI_API_KEY,
    ...extraSecrets
  ]
    .map((s) => (s ?? "").trim())
    .filter((s) => s.length >= 8)
    .sort((a, b) => b.length - a.length);

  for (const secret of envCandidates) {
    out = out.replaceAll(secret, "[FILTERED]");
  }

  out = out.replace(/\b(Bearer\s+)[A-Za-z0-9._~+/=-]{6,}/gi, "$1[FILTERED]");
  out = out.replace(
    /\b(?:sk-ant-[A-Za-z0-9_-]{8,}|sk-[A-Za-z0-9_-]{12,}|AIza[0-9A-Za-z_-]{16,}|whsec_[A-Za-z0-9_-]{8,})\b/g,
    "[FILTERED]"
  );
  out = out.replace(
    /\b(ownership_tokens?|approval_token|api[_-]?key|app_secret|signing_secret|mcp_api_key|x-goog-api-key|x-api-key)(\s*[=:]\s*["']?)([^&\s"',;]+)/gi,
    "$1$2[FILTERED]"
  );
  return out;
}