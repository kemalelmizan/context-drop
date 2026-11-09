import type {
  BoundingRectSnapshot,
  ElementReferenceSnapshot,
  ViewportSnapshot
} from "./types.ts";

export const MANDATORY_EXCLUDED_SELECTORS: readonly string[] = [
  "[data-feedback-ignore]",
  "[data-feedback-sensitive]",
  "input[type='password']",
  "input[type='hidden']",
  "[autocomplete^='cc-']",
  "context-drop-widget",
  "[data-context-drop-ui]"
];

export const ALLOWED_HTML_ATTRIBUTES: readonly string[] = [
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
];

const IGNORED_TEXT_TAGS = new Set([
  "SCRIPT",
  "STYLE",
  "NOSCRIPT",
  "TEMPLATE",
  "SVG",
  "PATH",
  "INPUT",
  "TEXTAREA",
  "SELECT"
]);

export function buildExcludedSelectorList(customSelectors: string[] = []): string[] {
  const combined = new Set<string>(MANDATORY_EXCLUDED_SELECTORS);
  for (const sel of customSelectors) {
    if (typeof sel === "string" && sel.trim().length > 0) {
      combined.add(sel.trim());
    }
  }
  return Array.from(combined);
}

function elementMatchesAny(el: Element, selectors: string[]): boolean {
  const tagName = (el.tagName || "").toLowerCase();
  if (tagName === "context-drop-widget") return true;
  if (el.hasAttribute("data-feedback-ignore") || el.hasAttribute("data-feedback-sensitive")) {
    return true;
  }
  if (el.hasAttribute("data-context-drop-ui")) {
    return true;
  }
  if (tagName === "input") {
    const inputType = (el.getAttribute("type") || "").toLowerCase();
    if (inputType === "password" || inputType === "hidden") return true;
  }
  const autocomplete = (el.getAttribute("autocomplete") || "").toLowerCase();
  if (autocomplete.startsWith("cc-")) return true;

  if (typeof el.matches === "function") {
    for (const sel of selectors) {
      try {
        if (el.matches(sel)) return true;
      } catch {
        // Ignore invalid custom CSS selector syntax
      }
    }
  }
  return false;
}

export function isElementExcluded(node: Element | null, customSelectors: string[] = []): boolean {
  if (!node) return true;
  const selectors = buildExcludedSelectorList(customSelectors);

  let current: Element | null = node;
  while (current) {
    if (elementMatchesAny(current, selectors)) {
      return true;
    }
    if (current.parentElement) {
      current = current.parentElement;
    } else {
      const rootNode = typeof current.getRootNode === "function" ? current.getRootNode() : null;
      if (rootNode && "host" in rootNode && (rootNode as ShadowRoot).host instanceof Element) {
        current = (rootNode as ShadowRoot).host;
      } else {
        current = null;
      }
    }
  }
  return false;
}

export function extractSanitizedAttributes(el: Element): Record<string, string> {
  const snapshot: Record<string, string> = {};
  const attrNames = typeof el.getAttributeNames === "function" ? el.getAttributeNames() : [];

  for (const rawName of attrNames) {
    const name = rawName.toLowerCase().trim();
    if (!name || name === "value" || name === "defaultvalue" || name.startsWith("on")) {
      continue;
    }
    if (name === "data-feedback-ignore" || name === "data-feedback-sensitive") {
      continue;
    }

    const isAllowed =
      ALLOWED_HTML_ATTRIBUTES.includes(name) ||
      (name.startsWith("aria-") && name !== "aria-hidden");

    if (!isAllowed) continue;

    const rawVal = el.getAttribute(rawName);
    if (rawVal === null) continue;

    const trimmed = rawVal.trim();
    if (name === "href" && /^(javascript|data):/i.test(trimmed)) {
      continue;
    }
    snapshot[name] = trimmed.slice(0, 300);
  }

  return snapshot;
}

export function extractSanitizedText(el: Element, customSelectors: string[] = []): string | null {
  const tagName = (el.tagName || "").toUpperCase();
  if (IGNORED_TEXT_TAGS.has(tagName)) {
    return null;
  }

  const selectors = buildExcludedSelectorList(customSelectors);
  const parts: string[] = [];

  function walk(node: Node): void {
    if (node.nodeType === 3) {
      // Node.TEXT_NODE === 3
      const text = node.nodeValue || "";
      if (text.trim().length > 0) {
        parts.push(text.trim());
      }
      return;
    }

    if (node.nodeType === 1) {
      // Node.ELEMENT_NODE === 1
      const childEl = node as Element;
      const childTag = (childEl.tagName || "").toUpperCase();
      if (IGNORED_TEXT_TAGS.has(childTag)) return;
      if (elementMatchesAny(childEl, selectors)) return;

      const children = childEl.childNodes || [];
      for (let i = 0; i < children.length; i += 1) {
        walk(children[i]);
      }
    }
  }

  walk(el);

  const joined = parts.join(" ").replace(/\s+/g, " ").trim();
  if (joined.length === 0) return null;
  return joined.slice(0, 500);
}

function escapeCssIdentifier(ident: string): string {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
    return CSS.escape(ident);
  }
  return ident.replace(/([^a-zA-Z0-9_-])/g, "\\$1");
}

export function computeSelector(el: Element): string {
  const tag = (el.tagName || "div").toLowerCase();
  const id = (el.getAttribute("id") || "").trim();
  if (id) {
    return `#${escapeCssIdentifier(id)}`;
  }

  const testId =
    el.getAttribute("data-testid") ||
    el.getAttribute("data-test") ||
    el.getAttribute("data-cy") ||
    el.getAttribute("data-qa");

  if (testId && testId.trim()) {
    const attrKey = el.hasAttribute("data-testid")
      ? "data-testid"
      : el.hasAttribute("data-test")
        ? "data-test"
        : el.hasAttribute("data-cy")
          ? "data-cy"
          : "data-qa";
    return `${tag}[${attrKey}="${testId.trim().replace(/"/g, '\\"')}"]`;
  }

  const classAttr = (el.getAttribute("class") || "").trim();
  if (classAttr) {
    const classes = classAttr
      .split(/\s+/)
      .filter((c) => c.length > 0 && !c.startsWith("cd-"))
      .slice(0, 3)
      .map((c) => `.${escapeCssIdentifier(c)}`)
      .join("");
    if (classes) {
      return `${tag}${classes}`;
    }
  }

  return tag;
}

export function computeDomPath(el: Element): string {
  const segments: string[] = [];
  let current: Element | null = el;

  while (current && segments.length < 15) {
    const tag = (current.tagName || "").toLowerCase();
    if (!tag) break;

    let segment = tag;
    const id = (current.getAttribute("id") || "").trim();
    if (id) {
      segment += `#${id}`;
    } else {
      const classAttr = (current.getAttribute("class") || "").trim();
      if (classAttr) {
        const firstClasses = classAttr
          .split(/\s+/)
          .filter(Boolean)
          .slice(0, 2)
          .join(".");
        if (firstClasses) {
          segment += `.${firstClasses}`;
        }
      }
    }

    segments.unshift(segment);

    if (current.parentElement) {
      current = current.parentElement;
    } else {
      const rootNode = typeof current.getRootNode === "function" ? current.getRootNode() : null;
      if (rootNode && "host" in rootNode && (rootNode as ShadowRoot).host instanceof Element) {
        current = (rootNode as ShadowRoot).host;
      } else {
        current = null;
      }
    }
  }

  return segments.join(" > ").slice(0, 1000);
}

export function captureElementSnapshot(
  el: Element,
  customSelectors: string[] = [],
  clientRef?: string
): ElementReferenceSnapshot | null {
  if (isElementExcluded(el, customSelectors)) {
    return null;
  }

  const rect = typeof el.getBoundingClientRect === "function"
    ? el.getBoundingClientRect()
    : { x: 0, y: 0, width: 0, height: 0 };

  const boundingRect: BoundingRectSnapshot = {
    x: Math.round((rect.x ?? (rect as DOMRect).left ?? 0) * 100) / 100,
    y: Math.round((rect.y ?? (rect as DOMRect).top ?? 0) * 100) / 100,
    width: Math.round((rect.width ?? 0) * 100) / 100,
    height: Math.round((rect.height ?? 0) * 100) / 100
  };

  const viewport: ViewportSnapshot = {
    width: typeof window !== "undefined" ? window.innerWidth || 1024 : 1024,
    height: typeof window !== "undefined" ? window.innerHeight || 768 : 768
  };

  const generatedRef = clientRef || `el_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  return {
    client_ref: generatedRef,
    tag_name: (el.tagName || "div").toLowerCase(),
    selector: computeSelector(el),
    dom_path: computeDomPath(el),
    text_content: extractSanitizedText(el, customSelectors),
    attributes_snapshot: extractSanitizedAttributes(el),
    bounding_rect: boundingRect,
    viewport: viewport,
    metadata: {},
    captured_at: new Date().toISOString()
  };
}
