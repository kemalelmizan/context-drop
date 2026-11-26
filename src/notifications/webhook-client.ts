import crypto from "node:crypto";
import {
  assertResolvedPublicHost,
  isDisallowedHostname,
  isLoopbackHost
} from "../server/ssrf-guard.ts";

export class WebhookDeliveryError extends Error {}

export function validateHttpsCallbackUrl(
  urlStr: string,
  options?: { allowLocalHttp?: boolean }
): URL {
  let uri: URL;
  try {
    uri = new URL(urlStr);
  } catch (err) {
    throw new WebhookDeliveryError(`Invalid webhook URL: ${(err as Error).message}`);
  }
  if (!uri.hostname.trim()) {
    throw new WebhookDeliveryError("Webhook URL host missing");
  }
  if (uri.username || uri.password) {
    throw new WebhookDeliveryError("Webhook URL must not include credentials");
  }
  if (options?.allowLocalHttp && uri.protocol === "http:" && isLoopbackHost(uri.hostname)) {
    return uri;
  }
  if (uri.protocol !== "https:") {
    throw new WebhookDeliveryError("Webhook URL must use HTTPS");
  }
  if (isDisallowedHostname(uri.hostname)) {
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
  headers: Record<string, string>,
  options?: { allowLocalHttp?: boolean }
): Promise<void> {
  const uri = validateHttpsCallbackUrl(urlStr, options);
  try {
    await assertResolvedPublicHost(uri.hostname, { allowLoopback: Boolean(options?.allowLocalHttp) });
  } catch (err) {
    throw new WebhookDeliveryError((err as Error).message);
  }

  const res = await fetch(uri.toString(), {
    method: "POST",
    redirect: "error",
    headers,
    body,
    signal: AbortSignal.timeout(12_000)
  });
  if (!res.ok) {
    const text = (await res.text()).slice(0, 300);
    throw new WebhookDeliveryError(`HTTP ${res.status}: ${text}`);
  }
}
