import type {
  BoundingRectSnapshot,
  ElementCandidateInfo,
  ElementCandidateRelation,
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

export function getParentOrHostElement(node: Element | null): Element | null {
  if (!node) return null;
  if (node.parentElement) {
    return node.parentElement;
  }
  const rootNode = typeof node.getRootNode === "function" ? node.getRootNode() : null;
  if (rootNode && "host" in rootNode && (rootNode as ShadowRoot).host instanceof Element) {
    return (rootNode as ShadowRoot).host;
  }
  return null;
}

export function isElementExcluded(node: Element | null, customSelectors: string[] = []): boolean {
  if (!node) return true;
  const selectors = buildExcludedSelectorList(customSelectors);

  let current: Element | null = node;
  while (current) {
    if (elementMatchesAny(current, selectors)) {
      return true;
    }
    current = getParentOrHostElement(current);
  }
  return false;
}

export function isSelectableElement(node: Element | null, customSelectors: string[] = []): boolean {
  if (!node) return false;
  const tag = (node.tagName || "").toUpperCase();
  if (!tag || tag === "HTML" || tag === "BODY" || tag === "HEAD" || tag === "SCRIPT" || tag === "STYLE") {
    return false;
  }
  if (typeof node.closest === "function") {
    if (node.closest("context-drop-widget") || node.closest("[data-context-drop-ui]")) {
      return false;
    }
  }
  if (isElementExcluded(node, customSelectors)) {
    return false;
  }
  const rect = typeof node.getBoundingClientRect === "function"
    ? node.getBoundingClientRect()
    : { width: 0, height: 0 };
  if ((rect.width ?? 0) <= 0 || (rect.height ?? 0) <= 0) {
    return false;
  }
  return true;
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
    current = getParentOrHostElement(current);
  }

  return segments.join(" > ").slice(0, 1000);
}

export function computeBoundingRect(el: Element): BoundingRectSnapshot {
  const rect = typeof el.getBoundingClientRect === "function"
    ? el.getBoundingClientRect()
    : { x: 0, y: 0, width: 0, height: 0 };

  return {
    x: Math.round((rect.x ?? (rect as DOMRect).left ?? 0) * 100) / 100,
    y: Math.round((rect.y ?? (rect as DOMRect).top ?? 0) * 100) / 100,
    width: Math.round((rect.width ?? 0) * 100) / 100,
    height: Math.round((rect.height ?? 0) * 100) / 100
  };
}

export function describeElementCandidate(
  el: Element,
  relation: ElementCandidateRelation,
  depth: number,
  customSelectors: string[] = []
): ElementCandidateInfo {
  const rawText = extractSanitizedText(el, customSelectors);
  const textPreview = rawText
    ? rawText.length > 64
      ? `${rawText.slice(0, 61)}...`
      : rawText
    : null;

  return {
    element: el,
    tagName: (el.tagName || "div").toLowerCase(),
    selector: computeSelector(el),
    domPath: computeDomPath(el),
    textPreview,
    rect: computeBoundingRect(el),
    relation,
    depth
  };
}

export function resolveAncestorChain(
  el: Element | null,
  customSelectors: string[] = [],
  maxDepth: number = 8
): Element[] {
  if (!el || !isSelectableElement(el, customSelectors)) {
    return [];
  }

  const chain: Element[] = [];
  let current: Element | null = el;

  while (current && chain.length < maxDepth) {
    if (isSelectableElement(current, customSelectors)) {
      chain.unshift(current);
    }
    current = getParentOrHostElement(current);
  }

  return chain;
}

function isAncestorOf(possibleAncestor: Element, node: Element): boolean {
  let current: Element | null = getParentOrHostElement(node);
  while (current) {
    if (current === possibleAncestor) return true;
    current = getParentOrHostElement(current);
  }
  return false;
}

/**
 * Builds an ordered list of candidate elements for a pointer location so users can
 * disambiguate overlapping sibling layers, deeply nested children, and parent containers.
 *
 * Order:
 * 1. Direct child elements (if the target is a container with immediate selectable children)
 * 2. Primary hovered/clicked target ("target")
 * 3. Overlapping non-ancestor elements at the same screen coordinate ("overlap")
 * 4. DOM ancestors from immediate parent up to top-level layout section ("ancestor")
 */
export function resolveCandidateStack(
  primaryTarget: Element | null,
  pointElements: Element[] = [],
  customSelectors: string[] = [],
  maxCandidates: number = 10
): ElementCandidateInfo[] {
  const seen = new Set<Element>();
  const stack: ElementCandidateInfo[] = [];

  const validPrimary =
    primaryTarget && isSelectableElement(primaryTarget, customSelectors)
      ? primaryTarget
      : pointElements.find((candidate) => isSelectableElement(candidate, customSelectors)) || null;

  if (!validPrimary) {
    return [];
  }

  // 1. Primary target at index 0 so default hover/click is the exact element under pointer
  seen.add(validPrimary);
  stack.push(describeElementCandidate(validPrimary, "target", 0, customSelectors));

  // 2. Overlapping non-ancestor elements from elementsFromPoint (e.g., elements behind an overlay or badge)
  for (const ptEl of pointElements) {
    if (stack.length >= maxCandidates) break;
    if (seen.has(ptEl)) continue;
    if (!isSelectableElement(ptEl, customSelectors)) continue;
    if (!isAncestorOf(ptEl, validPrimary)) {
      seen.add(ptEl);
      stack.push(describeElementCandidate(ptEl, "overlap", stack.length, customSelectors));
    }
  }

  // 3. Direct selectable children of the primary target (when a wrapper intercepts hover)
  const childNodes = (validPrimary as unknown as { children?: ArrayLike<Element>; childNodes?: ArrayLike<Node> }).children ||
    (validPrimary.childNodes || []);
  for (let i = 0; i < childNodes.length; i += 1) {
    if (stack.length >= maxCandidates) break;
    const node = childNodes[i] as Element;
    if (node && node.nodeType === 1 && !seen.has(node) && isSelectableElement(node, customSelectors)) {
      seen.add(node);
      stack.push(describeElementCandidate(node, "child", stack.length, customSelectors));
    }
  }

  // 4. Ancestor chain walking up from validPrimary
  let parent = getParentOrHostElement(validPrimary);
  while (parent && stack.length < maxCandidates) {
    if (!seen.has(parent) && isSelectableElement(parent, customSelectors)) {
      seen.add(parent);
      stack.push(describeElementCandidate(parent, "ancestor", stack.length, customSelectors));
    }
    parent = getParentOrHostElement(parent);
  }

  return stack;
}

export function captureElementSnapshot(
  el: Element,
  customSelectors: string[] = [],
  clientRef?: string
): ElementReferenceSnapshot | null {
  if (isElementExcluded(el, customSelectors)) {
    return null;
  }

  const boundingRect = computeBoundingRect(el);

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
