import type { FeedbackEventName, McpEventOccurrencePayload } from "../events/types.ts";
import {
  DEFAULT_LARK_HOSTS,
  assertResolvedPublicHost,
  isDisallowedHostname,
  isLoopbackHost,
  normalizeHostname,
  safeHref
} from "../server/ssrf-guard.ts";

export class LarkDeliveryError extends Error {}

export function escapeLarkMd(raw: unknown): string {
  return String(raw ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/([[\]()*_~`])/g, "\\$1");
}

export function validateLarkApiHost(
  apiHostStr: string,
  options?: { allowedHosts?: string[]; allowLocalHttp?: boolean }
): URL {
  let uri: URL;
  try {
    uri = new URL(apiHostStr.trim());
  } catch (err) {
    throw new LarkDeliveryError(`Invalid Lark API host: ${(err as Error).message}`);
  }
  const clean = normalizeHostname(uri.hostname);
  if (!clean) {
    throw new LarkDeliveryError("Lark API host missing");
  }
  if (uri.username || uri.password) {
    throw new LarkDeliveryError("Lark API host must not include credentials");
  }
  if (options?.allowLocalHttp && uri.protocol === "http:" && isLoopbackHost(clean)) {
    return uri;
  }
  if (uri.protocol !== "https:") {
    throw new LarkDeliveryError("Lark API host must use HTTPS");
  }
  if (isDisallowedHostname(clean)) {
    throw new LarkDeliveryError("Lark API host blocked (private or internal network)");
  }
  const permitted = new Set(
    [...DEFAULT_LARK_HOSTS, ...(options?.allowedHosts ?? [])]
      .map((h) => normalizeHostname(h))
      .filter(Boolean)
  );
  if (!permitted.has(clean)) {
    throw new LarkDeliveryError(
      `Lark API host '${clean}' is not in allowed Lark hosts (${Array.from(permitted).join(", ")})`
    );
  }
  return uri;
}

function eventTitle(name: FeedbackEventName): string {
  const map: Record<string, string> = {
    "feedback.created": "New ContextDrop feedback",
    "feedback.updated": "Feedback updated",
    "feedback.status_changed": "Feedback status changed",
    "feedback.deleted": "Feedback deleted"
  };
  return map[name] ?? "ContextDrop feedback event";
}

function headerColor(name: FeedbackEventName): string {
  switch (name) {
    case "feedback.created":
      return "blue";
    case "feedback.status_changed":
      return "orange";
    case "feedback.deleted":
      return "red";
    default:
      return "wathet";
  }
}

export function buildLarkInteractiveCard(occurrence: McpEventOccurrencePayload): string {
  const data = occurrence.data;
  const statusStr = escapeLarkMd(data.status);
  const statusLine = data.previous_status
    ? `${escapeLarkMd(data.previous_status)} → ${statusStr}`
    : statusStr;
  const safeMsg = data.message ? escapeLarkMd(String(data.message).slice(0, 500)) : null;
  const safePage = data.page_url ? escapeLarkMd(String(data.page_url).slice(0, 500)) : null;
  const lines = [
    `**Feedback #${escapeLarkMd(data.feedback_id)}** · \`${escapeLarkMd(data.environment)}\``,
    `**Status:** ${statusLine}`,
    safeMsg ? `> ${safeMsg}` : null,
    safePage ? `**Page:** ${safePage}` : null
  ]
    .filter(Boolean)
    .join("\n");

  const card: Record<string, unknown> = {
    config: { wide_screen_mode: true },
    header: {
      template: headerColor(occurrence.name),
      title: { tag: "plain_text", content: eventTitle(occurrence.name) }
    },
    elements: [{ tag: "div", text: { tag: "lark_md", content: lines } }]
  };
  const dash = safeHref(data.dashboard_url);
  if (dash) {
    card["elements"] = [
      ...(card["elements"] as unknown[]),
      {
        tag: "action",
        actions: [
          {
            tag: "button",
            text: { tag: "plain_text", content: "Open in Dashboard" },
            type: "primary",
            multi_url: { url: dash, pc_url: dash, android_url: dash, ios_url: dash }
          }
        ]
      }
    ];
  }
  return JSON.stringify(card);
}

export async function deliverLarkMessage(input: {
  apiHost: string;
  appId: string;
  appSecret: string;
  receiveIdType: string;
  receiveId: string;
  occurrence: McpEventOccurrencePayload;
  allowedHosts?: string[];
  allowLocalHttp?: boolean;
}): Promise<void> {
  const parsedHost = validateLarkApiHost(input.apiHost, {
    allowedHosts: input.allowedHosts,
    allowLocalHttp: input.allowLocalHttp
  });
  try {
    await assertResolvedPublicHost(parsedHost.hostname, {
      allowLoopback: Boolean(input.allowLocalHttp)
    });
  } catch (err) {
    throw new LarkDeliveryError((err as Error).message);
  }

  const host = parsedHost.toString().replace(/\/+$/, "");
  const tokenRes = await fetch(`${host}/open-apis/auth/v3/tenant_access_token/internal`, {
    method: "POST",
    redirect: "error",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ app_id: input.appId, app_secret: input.appSecret }),
    signal: AbortSignal.timeout(15_000)
  });
  const tokenJson = (await tokenRes.json()) as {
    code?: number;
    msg?: string;
    tenant_access_token?: string;
  };
  if (tokenJson.code !== 0 || !tokenJson.tenant_access_token) {
    throw new LarkDeliveryError(tokenJson.msg ?? "Failed to obtain Lark tenant_access_token");
  }

  const content = buildLarkInteractiveCard(input.occurrence);
  const msgUrl = new URL(`${host}/open-apis/im/v1/messages`);
  msgUrl.searchParams.set("receive_id_type", input.receiveIdType);

  const sendRes = await fetch(msgUrl, {
    method: "POST",
    redirect: "error",
    headers: {
      Authorization: `Bearer ${tokenJson.tenant_access_token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      receive_id: input.receiveId,
      msg_type: "interactive",
      content
    }),
    signal: AbortSignal.timeout(15_000)
  });
  const sendJson = (await sendRes.json()) as { code?: number; msg?: string };
  if (sendJson.code !== 0) {
    throw new LarkDeliveryError(sendJson.msg ?? `Lark send failed (${sendRes.status})`);
  }
}
