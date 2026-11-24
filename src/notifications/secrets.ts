import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const CIPHER = "aes-256-gcm";

function resolveMasterKey(secret?: string, storageDir?: string): Buffer {
  const explicit = (secret ?? process.env.CONTEXT_DROP_OWNERSHIP_SECRET ?? "").trim();
  if (explicit.length >= 16) {
    return crypto.createHash("sha256").update(explicit, "utf8").digest();
  }

  const base = storageDir ?? path.join(process.cwd(), ".context-drop");
  const keyPath = path.join(base, "notification.key");
  if (fs.existsSync(keyPath)) {
    const raw = fs.readFileSync(keyPath);
    if (raw.byteLength === 32) return raw;
  }
  fs.mkdirSync(base, { recursive: true });
  const fresh = crypto.randomBytes(32);
  fs.writeFileSync(keyPath, fresh);
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