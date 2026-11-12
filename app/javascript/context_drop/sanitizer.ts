import type {
  BoundingRectSnapshot,
  ElementCandidateInfo,
  ElementCandidateRelation,
  ElementReferenceSnapshot,
  SmartComponentDescription,
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
  "data-component",
  "data-controller",
  "data-ui",
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
      if (children.length === 0) {
        const directText = (childEl as unknown as { textContent?: string }).textContent || "";
        if (directText.trim().length > 0) {
          parts.push(directText.trim());
        }
        return;
      }
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

  const smart = describeSmartComponent(el, customSelectors);

  return {
    element: el,
    tagName: (el.tagName || "div").toLowerCase(),
    selector: computeSelector(el),
    domPath: computeDomPath(el),
    textPreview,
    friendlyLabel: smart.label,
    componentKind: smart.kind,
    rect: computeBoundingRect(el),
    relation,
    depth
  };
}

const INTERACTIVE_SMART_TAGS = new Set([
  "button",
  "a",
  "input",
  "select",
  "textarea",
  "summary",
  "label"
]);

const INTERACTIVE_SMART_ROLES = new Set([
  "button",
  "link",
  "menuitem",
  "tab",
  "switch",
  "checkbox",
  "radio",
  "combobox",
  "option",
  "searchbox",
  "slider"
]);

const SEMANTIC_COMPONENT_TAGS = new Set([
  "dialog",
  "article",
  "aside",
  "nav",
  "header",
  "footer",
  "form",
  "tr",
  "li",
  "figure",
  "blockquote",
  "fieldset",
  "details",
  "table",
  "turbo-frame"
]);

const SEMANTIC_COMPONENT_ROLES = new Set([
  "dialog",
  "alertdialog",
  "alert",
  "status",
  "banner",
  "navigation",
  "search",
  "region",
  "tabpanel",
  "listitem",
  "row",
  "toolbar",
  "menu",
  "card"
]);

const INLINE_LEAF_TAGS = new Set([
  "span",
  "strong",
  "em",
  "b",
  "i",
  "u",
  "small",
  "mark",
  "abbr",
  "time",
  "code",
  "kbd",
  "svg",
  "path",
  "circle",
  "rect",
  "line",
  "polyline",
  "polygon",
  "g",
  "use"
]);

const COMPONENT_HINT_PATTERN =
  /\b(card|panel|modal|drawer|dialog|toast|banner|alert|notice|callout|widget|navbar|topbar|header|sidebar|toolbar|dropdown|popover|menu|tile|pricing|checkout|summary|hero|stat|metric|item|row|badge|pill)\b/i;

function isInteractiveSmartNode(el: Element): boolean {
  const tag = (el.tagName || "").toLowerCase();
  if (INTERACTIVE_SMART_TAGS.has(tag)) return true;
  const role = (el.getAttribute("role") || "").trim().toLowerCase();
  return role.length > 0 && INTERACTIVE_SMART_ROLES.has(role);
}

function hasComponentBoundarySignal(el: Element): boolean {
  const tag = (el.tagName || "").toLowerCase();
  if (SEMANTIC_COMPONENT_TAGS.has(tag)) return true;

  const role = (el.getAttribute("role") || "").trim().toLowerCase();
  if (role && SEMANTIC_COMPONENT_ROLES.has(role)) return true;

  for (const attr of [
    "data-component",
    "data-controller",
    "data-turbo-frame",
    "data-ui",
    "data-testid",
    "data-qa"
  ]) {
    const val = (el.getAttribute(attr) || "").trim();
    if (val.length > 0) return true;
  }

  const classAndId = `${el.getAttribute("id") || ""} ${el.getAttribute("class") || ""}`;
  return COMPONENT_HINT_PATTERN.test(classAndId);
}

function isOversizedPageShell(el: Element): boolean {
  const tag = (el.tagName || "").toLowerCase();
  if (tag === "main" || tag === "body" || tag === "html") return true;

  const vw = typeof window !== "undefined" ? window.innerWidth || 1280 : 1280;
  const vh = typeof window !== "undefined" ? window.innerHeight || 800 : 800;
  const rect = computeBoundingRect(el);
  return rect.width >= vw * 0.92 && rect.height >= vh * 0.82;
}

function findFirstHeadingText(
  root: Element,
  customSelectors: string[] = [],
  maxDepth: number = 4
): string | null {
  const selectors = buildExcludedSelectorList(customSelectors);
  const headingTags = new Set(["H1", "H2", "H3", "H4", "H5", "H6", "LEGEND", "CAPTION", "SUMMARY"]);

  function search(node: Element, depth: number): string | null {
    if (depth > maxDepth) return null;
    const children = (node as unknown as { childNodes?: ArrayLike<Node> }).childNodes || [];
    for (let i = 0; i < children.length; i += 1) {
      const child = children[i];
      if (!child || child.nodeType !== 1) continue;
      const childEl = child as Element;
      if (elementMatchesAny(childEl, selectors)) continue;

      const cTag = (childEl.tagName || "").toUpperCase();
      const cRole = (childEl.getAttribute("role") || "").trim().toLowerCase();
      if (headingTags.has(cTag) || cRole === "heading") {
        const headingText = extractSanitizedText(childEl, customSelectors);
        if (headingText && headingText.length > 0) {
          return headingText;
        }
      }

      const nested = search(childEl, depth + 1);
      if (nested) return nested;
    }
    return null;
  }

  return search(root, 1);
}

function humanizeIdentifierToken(raw: string): string | null {
  const cleaned = raw
    .trim()
    .replace(/^(cd|js|app|ui|scenario|section|page)[-_]/i, "")
    .replace(/[-_](btn|button|link|card|panel|section|wrapper|container|box|el|root|view|\d+)$/i, "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[-_./]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned || cleaned.length < 2 || /^[0-9a-f]{7,}$/i.test(cleaned)) {
    return null;
  }

  return cleaned
    .split(" ")
    .slice(0, 4)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

function inferFriendlyComponentKind(el: Element): string {
  const tag = (el.tagName || "div").toLowerCase();
  const role = (el.getAttribute("role") || "").trim().toLowerCase();
  const classAndId = `${el.getAttribute("id") || ""} ${el.getAttribute("class") || ""}`.toLowerCase();

  if (tag === "button" || role === "button") return "Button";
  if (tag === "a" || role === "link") return "Link";
  if (role === "tab") return "Tab";
  if (role === "menuitem") return "Menu item";
  if (role === "switch") return "Toggle";
  if (tag === "select" || role === "combobox") return "Dropdown";
  if (tag === "textarea") return "Text field";
  if (tag === "input") {
    const type = (el.getAttribute("type") || "text").toLowerCase();
    if (type === "search" || role === "searchbox") return "Search box";
    if (type === "checkbox" || role === "checkbox") return "Checkbox";
    if (type === "radio" || role === "radio") return "Option";
    if (type === "submit" || type === "button") return "Button";
    return "Input field";
  }
  if (tag === "label") return "Field";
  if (tag === "dialog" || role === "dialog" || role === "alertdialog" || /\b(modal|drawer|dialog)\b/.test(classAndId)) {
    return "Dialog";
  }
  if (role === "alert" || role === "status" || /\b(toast|banner|alert|notice|callout)\b/.test(classAndId)) {
    return "Banner";
  }
  if (tag === "nav" || role === "navigation" || /\b(navbar|topbar|Subnav|breadcrumb)\b/i.test(classAndId)) {
    return "Navigation";
  }
  if (tag === "header" || /\bheader\b/.test(classAndId)) return "Header";
  if (tag === "footer") return "Footer";
  if (tag === "aside" || /\bsidebar\b/.test(classAndId)) return "Sidebar";
  if (tag === "form") return "Form";
  if (tag === "table") return "Table";
  if (tag === "tr" || role === "row") return "Table row";
  if (tag === "li" || role === "listitem") return "Item";
  if (tag === "img" || tag === "figure" || tag === "svg" || tag === "picture") return "Image";
  if (/^h[1-6]$/.test(tag) || role === "heading") return "Heading";
  if (
    tag === "article" ||
    tag === "turbo-frame" ||
    /\b(card|panel|tile|pricing|summary|widget|stat|metric|popover|dropdown)\b/.test(classAndId)
  ) {
    return "Card";
  }
  if (tag === "section" || role === "region") return "Section";
  return "Page area";
}

function truncateCleanPhrase(raw: string, maxLen: number = 32): string {
  const normalized = raw.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLen) return normalized;
  return `${normalized.slice(0, maxLen - 1).trimEnd()}…`;
}

/**
 * Resolves a hovered/clicked DOM leaf into a meaningful, human-recognizable UI component
 * for Production ("smart") mode so non-technical users never wrestle with tiny `<span>`/`<svg>`
 * fragments or overlapping DevTools layer lists.
 */
export function resolveSmartComponent(
  primaryTarget: Element | null,
  customSelectors: string[] = []
): Element | null {
  if (!primaryTarget || !isSelectableElement(primaryTarget, customSelectors)) {
    return null;
  }

  // 1. If the user is pointing inside an interactive control (button, link, input, tab, menuitem),
  //    snap cleanly to that control rather than an inner <span> or <svg>.
  let cursor: Element | null = primaryTarget;
  let hops = 0;
  while (cursor && hops < 6) {
    if (isSelectableElement(cursor, customSelectors) && isInteractiveSmartNode(cursor)) {
      return cursor;
    }
    cursor = getParentOrHostElement(cursor);
    hops += 1;
  }

  // 2. Otherwise walk up to the nearest bounded semantic / visual component (Card, Banner, Form,
  //    Dialog, Table row, Navigation, Stimulus/Turbo component) without jumping to full-page <main>/<body>.
  cursor = primaryTarget;
  hops = 0;
  let fallbackSection: Element | null = null;
  while (cursor && hops < 6) {
    if (isSelectableElement(cursor, customSelectors) && !isOversizedPageShell(cursor)) {
      const rect = computeBoundingRect(cursor);
      if (rect.width >= 24 && rect.height >= 18) {
        if (hasComponentBoundarySignal(cursor)) {
          return cursor;
        }
        const tag = (cursor.tagName || "").toLowerCase();
        if (tag === "section" && !fallbackSection) {
          fallbackSection = cursor;
        }
      }
    }
    cursor = getParentOrHostElement(cursor);
    hops += 1;
  }

  if (fallbackSection) {
    return fallbackSection;
  }

  // 3. If the leaf is a bare inline/SVG fragment, step up to its nearest clean block parent.
  const leafTag = (primaryTarget.tagName || "").toLowerCase();
  if (INLINE_LEAF_TAGS.has(leafTag)) {
    let parent = getParentOrHostElement(primaryTarget);
    let step = 0;
    while (parent && step < 4) {
      const pTag = (parent.tagName || "").toLowerCase();
      if (
        !INLINE_LEAF_TAGS.has(pTag) &&
        isSelectableElement(parent, customSelectors) &&
        !isOversizedPageShell(parent)
      ) {
        return parent;
      }
      parent = getParentOrHostElement(parent);
      step += 1;
    }
  }

  return primaryTarget;
}

/**
 * Produces a plain-language, jargon-free label for any DOM element (e.g. `"Upgrade Cluster" button`,
 * `"Order Summary" card`, `"Email Address" input field`) with zero CSS selectors or pixel metrics.
 */
export function describeSmartComponent(
  el: Element,
  customSelectors: string[] = [],
  originalLeaf?: Element | null
): SmartComponentDescription {
  const kind = inferFriendlyComponentKind(el);
  let name: string | null = null;

  const ariaLabel =
    (el.getAttribute("aria-label") || "").trim() ||
    (el.getAttribute("placeholder") || "").trim() ||
    (el.getAttribute("alt") || "").trim() ||
    (el.getAttribute("title") || "").trim();

  if (ariaLabel) {
    name = truncateCleanPhrase(ariaLabel, 30);
  }

  if (!name && isInteractiveSmartNode(el)) {
    const ownText = extractSanitizedText(el, customSelectors);
    if (ownText) {
      name = truncateCleanPhrase(ownText, 28);
    }
  }

  if (!name) {
    const headingText = findFirstHeadingText(el, customSelectors);
    if (headingText) {
      name = truncateCleanPhrase(headingText, 30);
    }
  }

  if (!name) {
    for (const attr of ["data-component", "data-turbo-frame", "data-controller", "id", "name"]) {
      const rawAttr = (el.getAttribute(attr) || "").trim();
      if (rawAttr) {
        const humanized = humanizeIdentifierToken(rawAttr);
        if (humanized) {
          name = truncateCleanPhrase(humanized, 28);
          break;
        }
      }
    }
  }

  if (!name) {
    const snippet = extractSanitizedText(el, customSelectors);
    if (snippet && snippet.length <= 42) {
      name = truncateCleanPhrase(snippet, 28);
    }
  }

  const lowerKind = kind.toLowerCase();
  let label = kind;
  if (name) {
    const nameAlreadyHasKind = name.toLowerCase().endsWith(lowerKind);
    label = nameAlreadyHasKind ? name : `“${name}” ${lowerKind}`;
  }

  return {
    element: el,
    label,
    kind,
    name,
    promotedFromLeaf: Boolean(originalLeaf && originalLeaf !== el)
  };
}

export function computeFriendlyComponentLabel(
  el: Element,
  customSelectors: string[] = []
): string {
  return describeSmartComponent(el, customSelectors).label;
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
  clientRef?: string,
  extraMetadata?: Record<string, unknown>
): ElementReferenceSnapshot | null {
  if (isElementExcluded(el, customSelectors)) {
    return null;
  }

  const boundingRect = computeBoundingRect(el);
  const smart = describeSmartComponent(el, customSelectors);

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
    metadata: {
      friendly_label: smart.label,
      component_kind: smart.kind,
      ...(extraMetadata || {})
    },
    captured_at: new Date().toISOString()
  };
}
