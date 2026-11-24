import type { LocalEventStore } from "../events/local-event-store.ts";
import type { StoredEventOccurrence } from "../events/types.ts";
import { deliverLarkMessage } from "./lark-client.ts";
import { decryptSecrets } from "./secrets.ts";
import {
  postSignedJson,
  signedWebhookHeaders,
  validateHttpsCallbackUrl
} from "./webhook-client.ts";

export async function deliverOccurrenceToDestinations(
  store: LocalEventStore,
  occurrence: StoredEventOccurrence
): Promise<void> {
  const payload = store.toMcpPayload(occurrence);
  const destinations = await store.listDestinations();
  for (const dest of destinations) {
    if (!dest.enabled) continue;
    if (!dest.event_types.includes(occurrence.name)) continue;
    try {
      if (dest.destination_type === "lark") {
        const secrets = decryptSecrets(dest.secrets_ciphertext, store.cryptoOptions);
        const receiveId = String(dest.settings["receive_id"] ?? "").trim();
        if (!secrets["app_id"] || !secrets["app_secret"] || !receiveId) {
          throw new Error("Lark destination missing app credentials or receive_id");
        }
        await deliverLarkMessage({
          apiHost: String(dest.settings["api_host"] ?? "https://open.larksuite.com"),
          appId: secrets["app_id"],
          appSecret: secrets["app_secret"],
          receiveIdType: String(dest.settings["receive_id_type"] ?? "chat_id"),
          receiveId,
          occurrence: payload
        });
      } else {
        const url = String(dest.settings["url"] ?? "").trim();
        validateHttpsCallbackUrl(url);
        const body = JSON.stringify(payload);
        const secrets = decryptSecrets(dest.secrets_ciphertext, store.cryptoOptions);
        const headers = signedWebhookHeaders(
          secrets["signing_secret"] ?? "",
          occurrence.event_id,
          body
        );
        await postSignedJson(url, body, headers);
      }
      await store.recordDestinationDelivery(dest.id, "delivered", null);
    } catch (err) {
      await store.recordDestinationDelivery(dest.id, "failed", (err as Error).message);
      console.warn(
        `[context-drop] notification destination #${dest.id} (${dest.name}): ${(err as Error).message}`
      );
    }
  }
}

export async function deliverOccurrenceToMcpSubscriptions(
  store: LocalEventStore,
  occurrence: StoredEventOccurrence
): Promise<void> {
  const payload = store.toMcpPayload(occurrence);
  const subs = await store.listActiveSubscriptions();
  const body = JSON.stringify(payload);
  for (const sub of subs) {
    if (sub.event_name !== occurrence.name) continue;
    const envFilter = String(sub.arguments["environment"] ?? "").trim();
    if (
      envFilter &&
      String(occurrence.data.environment ?? "").toLowerCase() !== envFilter.toLowerCase()
    ) {
      continue;
    }
    try {
      validateHttpsCallbackUrl(sub.callback_url);
      const headers = signedWebhookHeaders(sub.signing_secret, occurrence.event_id, body);
      await postSignedJson(sub.callback_url, body, headers);
      await store.updateSubscriptionCursor(sub.subscription_id, store.cursorFor(occurrence));
    } catch (err) {
      console.warn(
        `[context-drop] MCP event subscription ${sub.subscription_id}: ${(err as Error).message}`
      );
    }
  }
}