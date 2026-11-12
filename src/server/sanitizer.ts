import type { BoundingRectSnapshot, ViewportSnapshot } from "../../app/javascript/context_drop/types.ts";
import type { SanitizedElementInput } from "./types.ts";

export const ALLOWED_ATTRIBUTE_KEYS = new Set([
  "id",
  "class",
  "role",
  "name",
  "type",
  "href",
  "title",
  "placeholder",
  "alt",
  "data-testid",
  "data-test",
  "data-cy",
  "data-qa",
  "data-turbo-frame"
]);

export const FORBIDDEN_METADATA_KEYS = new Set([
  "outerhtml",
  "innerhtml",
  "value",
  "defaultvalue",
  "password",
  "secret",
  "token",
  "authorization",
  "cookie"
]);

export const MANDATORY_SERVER_EXCLUDED_SELECTORS = [
  "[data-feedback-ignore]",
  "[data-feedback-sensitive]",
  "input[type='password']",
  "input[type='hidden']",
  "[autocomplete^='cc-']"
] as const;

const MAX_TEXT_LENGTH = 500;
const MAX_SELECTOR_LENGTH = 500;
const MAX_DOM_PATH_LENGTH = 1000;
const MAX_ATTR_VALUE_LENGTH = 300;

export class SensitiveElementError extends Error {
  public readonly status = 422;

  constructor(message = "Cannot attach excluded or sensitive DOM element") {
    super(message);
    this.name = "SensitiveElementError";
  }
}

function asRecord(input: unknown): Record<string, unknown> {
  if (input && typeof input === "object" && !Array.isArray(input)) {
    return input as Record<string, unknown>;
  }
  return {};
}

function truncateStr(val: unknown, maxLen: number): string | null {
  if (val === null || val === undefined) return null;
  const str = String(val);
  return str.length > maxLen ? str.slice(0, maxLen) : str;
}

export function isSensitiveElementPayload(
  tagName: string,
  attrs: Record<string, unknown>,
  selector = ""
): boolean {
  const inputType = String(attrs["type"] ?? "").trim().toLowerCase();
  if (tagName === "input" && (inputType === "password" || inputType === "hidden")) {
    return true;
  }

  const lowerAttrKeys = Object.keys(attrs).map((k) => k.trim().toLowerCase());
  if (
    lowerAttrKeys.includes("data-feedback-ignore") ||
    lowerAttrKeys.includes("data-feedback-sensitive")
  ) {
    return true;
  }

  const autocomplete = String(attrs["autocomplete"] ?? "").trim().toLowerCase();
  if (autocomplete.startsWith("cc-")) {
    return true;
  }

  const selDown = selector.toLowerCase();
  if (
    selDown.includes("data-feedback-ignore") ||
    selDown.includes("data-feedback-sensitive")
  ) {
    return true;
  }

  return false;
}

export function sanitizeAttributes(rawAttrs: unknown): Record<string, string> {
  const attrs = asRecord(rawAttrs);
  const sanitized: Record<string, string> = {};

  for (const [key, value] of Object.entries(attrs)) {
    const normalizedKey = key.trim().toLowerCase();
    if (!normalizedKey) continue;
    if (FORBIDDEN_METADATA_KEYS.has(normalizedKey)) continue;
    if (normalizedKey.startsWith("on")) continue;

    const allowed =
      ALLOWED_ATTRIBUTE_KEYS.has(normalizedKey) ||
      (normalizedKey.startsWith("aria-") && normalizedKey !== "aria-hidden");
    if (!allowed) continue;

    const strVal = String(value ?? "").trim();
    if (
      normalizedKey === "href" &&
      (strVal.toLowerCase().startsWith("javascript:") || strVal.toLowerCase().startsWith("data:"))
    ) {
      continue;
    }

    sanitized[normalizedKey] = truncateStr(strVal, MAX_ATTR_VALUE_LENGTH) ?? "";
  }

  return sanitized;
}

export function sanitizeBoundingRect(rawRect: unknown): Partial<BoundingRectSnapshot> {
  const rect = asRecord(rawRect);
  const result: Partial<BoundingRectSnapshot> = {};

  for (const coord of ["x", "y", "width", "height"] as const) {
    if (rect[coord] === undefined || rect[coord] === null) continue;
    const num = Number(rect[coord]);
    if (!Number.isNaN(num)) {
      result[coord] = Number.isFinite(num) ? Math.round(num * 100) / 100 : 0;
    }
  }

  return result;
}

export function sanitizeViewport(rawViewport: unknown): Partial<ViewportSnapshot> {
  const vp = asRecord(rawViewport);
  const result: Partial<ViewportSnapshot> = {};

  for (const dim of ["width", "height"] as const) {
    if (vp[dim] === undefined || vp[dim] === null) continue;
    const num = Math.trunc(Number(vp[dim]));
    if (!Number.isNaN(num)) {
      result[dim] = num > 0 ? num : 0;
    }
  }

  return result;
}

function sanitizeScalar(val: unknown): unknown {
  if (val === null || typeof val === "boolean") return val;
  if (typeof val === "number") return Number.isFinite(val) ? val : 0;
  return truncateStr(String(val), MAX_TEXT_LENGTH);
}

export function sanitizeGenericMetadata(input: unknown, depth = 0): Record<string, unknown> {
  if (depth > 4) return {};
  const obj = asRecord(input);
  const cleaned: Record<string, unknown> = {};

  for (const [k, v] of Object.entries(obj)) {
    const keyStr = k.trim();
    if (!keyStr) continue;
    if (FORBIDDEN_METADATA_KEYS.has(keyStr.toLowerCase())) continue;

    if (Array.isArray(v)) {
      cleaned[keyStr] = v.slice(0, 25).map((item) =>
        item && typeof item === "object" && !Array.isArray(item)
          ? sanitizeGenericMetadata(item, depth + 1)
          : sanitizeScalar(item)
      );
    } else if (v && typeof v === "object") {
      cleaned[keyStr] = sanitizeGenericMetadata(v, depth + 1);
    } else if (v !== undefined) {
      cleaned[keyStr] = sanitizeScalar(v);
    }
  }

  return cleaned;
}

function sanitizeTextContent(tagName: string, text: unknown): string | null {
  if (text === null || text === undefined) return null;
  if (["input", "textarea", "select", "password"].includes(tagName)) {
    return null;
  }
  const normalized = String(text).replace(/\s+/g, " ").trim();
  if (!normalized) return null;
  return truncateStr(normalized, MAX_TEXT_LENGTH);
}

function parseIsoTimestamp(val: unknown): string {
  if (typeof val === "string" && val.trim().length > 0) {
    const parsed = Date.parse(val.trim());
    if (!Number.isNaN(parsed)) {
      return new Date(parsed).toISOString();
    }
  }
  return new Date().toISOString();
}

export function sanitizeElementReference(rawInput: unknown): SanitizedElementInput {
  const params = asRecord(rawInput);
  const tagName = String(params["tag_name"] ?? "").trim().toLowerCase();
  const rawAttrs = asRecord(params["attributes_snapshot"] ?? params["attributes"]);
  const rawSelector = String(params["selector"] ?? "");

  if (isSensitiveElementPayload(tagName, rawAttrs, rawSelector)) {
    throw new SensitiveElementError("Cannot attach excluded or sensitive DOM element");
  }

  return {
    client_ref: truncateStr(params["client_ref"], 128),
    tag_name: tagName || "div",
    selector: (truncateStr(rawSelector, MAX_SELECTOR_LENGTH) ?? "").trim() || tagName || "div",
    dom_path: truncateStr(params["dom_path"], MAX_DOM_PATH_LENGTH),
    text_content: sanitizeTextContent(tagName, params["text_content"]),
    attributes_snapshot: sanitizeAttributes(rawAttrs),
    bounding_rect: sanitizeBoundingRect(params["bounding_rect"]),
    viewport: sanitizeViewport(params["viewport"]),
    metadata: sanitizeGenericMetadata(params["metadata"]),
    captured_at: parseIsoTimestamp(params["captured_at"])
  };
}

