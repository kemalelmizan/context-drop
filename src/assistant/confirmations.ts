import type { SanitizedElementInput, StoredFeedbackRecord } from "../server/types.ts";
import { sanitizePromptUrl } from "../server/ssrf-guard.ts";

export const DEFAULT_CONFIRMATION_TEMPLATES: readonly string[] = [
  "Thanks — we recorded your feedback **#{{id}}** ({{environment}}). Status: {{status}} · {{pins_count}} pinned area(s) · {{attachments_count}} attachment(s) · captured {{created_at}}.",
  "Your report **#{{id}}** is saved. We are tracking it as **{{status}}** with {{pins_count}} pin(s) and {{attachments_count}} file(s) from this page.",
  "Feedback **#{{id}}** received. Reference: {{environment}} · {{status}} · page {{page_url}} · {{pins_summary}}."
];

export const DEFAULT_FEEDBACK_GUIDANCE: readonly string[] = [
  "Pin the part of the page that's wrong, add a short note, then press Send — we'll attach structured context automatically.",
  "You can attach a screenshot or highlight a button or field before sending. Your report won't include passwords or hidden fields.",
  "After you send, you'll get a reference number and a summary of what ContextDrop captured (pins, screenshots, page URL)."
];

export interface ConfirmationMetadata {
  id: number | string;
  environment: string;
  status: string;
  page_url: string;
  pins_count: number;
  attachments_count: number;
  pins_summary: string;
  created_at: string;
  selection_mode: "smart" | "verbose";
}

function deterministicIndex(seedInput: string | number, length: number): number {
  if (length <= 1) return 0;
  const s = String(seedInput);
  let hash = 2166136261;
  for (let i = 0; i < s.length; i += 1) {
    hash ^= s.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % length;
}

export function renderConfirmationForFeedback(
  feedback: StoredFeedbackRecord,
  options: { smart?: boolean; customTemplates?: string[] } = {}
): { message: string; metadata: ConfirmationMetadata } {
  const smart = Boolean(options.smart);
  const templates =
    options.customTemplates && options.customTemplates.length > 0
      ? options.customTemplates
      : DEFAULT_CONFIRMATION_TEMPLATES;
  const template = templates[deterministicIndex(feedback.id, templates.length)]!;

  const pins = Array.isArray(feedback.element_references) ? feedback.element_references : [];
  const pinLabels = pins.map((el) => {
    const meta = el.metadata && typeof el.metadata === "object" ? el.metadata : {};
    const friendly = typeof meta["friendly_label"] === "string" ? meta["friendly_label"].trim() : "";
    const kind = typeof meta["component_kind"] === "string" ? meta["component_kind"].trim() : "";
    if (smart && friendly) return friendly;
    if (smart) return kind || "Area on page";
    return (el.selector || "").trim() || el.tag_name;
  });

  const metadata: ConfirmationMetadata = {
    id: feedback.id,
    environment: feedback.environment,
    status: feedback.status,
    page_url: feedback.page_url || "",
    pins_count: pins.length,
    attachments_count: Array.isArray(feedback.attachments) ? feedback.attachments.length : 0,
    pins_summary: pinLabels.length === 0 ? "no pins" : pinLabels.join(", "),
    created_at: feedback.created_at || new Date().toISOString(),
    selection_mode: smart ? "smart" : "verbose"
  };

  let message = template;
  for (const [k, v] of Object.entries(metadata)) {
    message = message.replaceAll(`{{${k}}}`, String(v));
  }

  return { message, metadata };
}

export function renderFeedbackGuidance(customGuidance?: string[]): {
  message: string;
  metadata: Record<string, never>;
} {
  const list =
    customGuidance && customGuidance.length > 0 ? customGuidance : DEFAULT_FEEDBACK_GUIDANCE;
  const idx = Math.floor(Math.random() * list.length);
  return { message: list[idx] ?? DEFAULT_FEEDBACK_GUIDANCE[0]!, metadata: {} };
}

export function formatDomContextForAssistant(
  pageUrl: string,
  elements: SanitizedElementInput[],
  disclosure: "friendly" | "full"
): string {
  if (!elements || elements.length === 0) return "";
  const safeUrl = sanitizePromptUrl(pageUrl, "/");
  const lines = ["<untrusted_dom_context>", `Pinned Live DOM Context (on \`${safeUrl}\`):`];
  elements.forEach((el, idx) => {
    const meta = el.metadata && typeof el.metadata === "object" ? el.metadata : {};
    if (disclosure === "friendly") {
      const friendly =
        (typeof meta["friendly_label"] === "string" && meta["friendly_label"].trim()) ||
        (typeof meta["component_kind"] === "string" && meta["component_kind"].trim()) ||
        "UI area";
      lines.push(`${idx + 1}. ${friendly}`);
    } else {
      lines.push(`${idx + 1}. \`<${el.tag_name}>\` selector=\`${el.selector}\``);
    }
  });
  lines.push("</untrusted_dom_context>");
  return lines.join("\n");
}
