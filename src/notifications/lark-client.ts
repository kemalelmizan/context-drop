import type { FeedbackEventName, McpEventOccurrencePayload } from "../events/types.ts";

export class LarkDeliveryError extends Error {}

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
  const statusLine = data.previous_status
    ? `${data.previous_status} → ${data.status}`
    : data.status;
  const lines = [
    `**Feedback #${data.feedback_id}** · \`${data.environment}\``,
    `**Status:** ${statusLine}`,
    data.message ? `> ${String(data.message).slice(0, 500)}` : null,
    data.page_url ? `**Page:** ${data.page_url}` : null
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
  if (data.dashboard_url) {
    const dash = data.dashboard_url;
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
}): Promise<void> {
  const host = input.apiHost.replace(/\/+$/, "");
  const tokenRes = await fetch(`${host}/open-apis/auth/v3/tenant_access_token/internal`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ app_id: input.appId, app_secret: input.appSecret })
  });
  const tokenJson = (await tokenRes.json()) as { code?: number; msg?: string; tenant_access_token?: string };
  if (tokenJson.code !== 0 || !tokenJson.tenant_access_token) {
    throw new LarkDeliveryError(tokenJson.msg ?? "Failed to obtain Lark tenant_access_token");
  }

  const content = buildLarkInteractiveCard(input.occurrence);
  const msgUrl = new URL(`${host}/open-apis/im/v1/messages`);
  msgUrl.searchParams.set("receive_id_type", input.receiveIdType);

  const sendRes = await fetch(msgUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${tokenJson.tenant_access_token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      receive_id: input.receiveId,
      msg_type: "interactive",
      content
    })
  });
  const sendJson = (await sendRes.json()) as { code?: number; msg?: string };
  if (sendJson.code !== 0) {
    throw new LarkDeliveryError(sendJson.msg ?? `Lark send failed (${sendRes.status})`);
  }
}