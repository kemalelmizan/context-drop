import crypto from "node:crypto";

export class WebhookDeliveryError extends Error {}

function isPrivateHost(host: string): boolean {
  const down = host.trim().toLowerCase();
  if (down === "localhost" || down.endsWith(".localhost")) return true;
  const match = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(down);
  if (!match) return false;
  const oct = match.slice(1, 5).map((x) => Number(x));
  if (oct[0] === 10) return true;
  if (oct[0] === 127) return true;
  if (oct[0] === 0) return true;
  if (oct[0] === 169 && oct[1] === 254) return true;
  if (oct[0] === 192 && oct[1] === 168) return true;
  if (oct[0] === 172 && oct[1]! >= 16 && oct[1]! <= 31) return true;
  return false;
}

export function validateHttpsCallbackUrl(urlStr: string): URL {
  let uri: URL;
  try {
    uri = new URL(urlStr);
  } catch (err) {
    throw new WebhookDeliveryError(`Invalid webhook URL: ${(err as Error).message}`);
  }
  if (uri.protocol !== "https:") {
    throw new WebhookDeliveryError("Webhook URL must use HTTPS");
  }
  if (!uri.hostname.trim()) {
    throw new WebhookDeliveryError("Webhook URL host missing");
  }
  if (isPrivateHost(uri.hostname)) {
    throw new WebhookDeliveryError("Webhook URL blocked (private network)");
  }
  return uri;
}

export function signedWebhookHeaders(secret: string, msgId: string, body: string): Record<string, string> {
  const timestamp = String(Math.floor(Date.now() / 1000));
  const base = `${msgId}.${timestamp}.${body}`;
  const sig = secret.trim()
    ? `v1,${crypto.createHmac("sha256", secret).update(base).digest("base64")}`
    : "";
  return {
    "webhook-id": msgId,
    "webhook-timestamp": timestamp,
    "webhook-signature": sig,
    "Content-Type": "application/json",
    "User-Agent": "ContextDrop-Webhook/1.0"
  };
}

export async function postSignedJson(
  urlStr: string,
  body: string,
  headers: Record<string, string>
): Promise<void> {
  const res = await fetch(urlStr, { method: "POST", headers, body });
  if (!res.ok) {
    const text = (await res.text()).slice(0, 300);
    throw new WebhookDeliveryError(`HTTP ${res.status}: ${text}`);
  }
}