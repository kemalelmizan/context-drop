/**
 * ContextDrop Browser Widget Bundle (v0.1.0)
 * Self-contained Custom Element (<context-drop-widget>) with Shadow DOM isolation.
 * Generated from app/javascript/context_drop/*.ts — DO NOT EDIT DIRECTLY.
 */
(function () {
  "use strict";

  // --- Module: sanitizer.ts ---
  const MANDATORY_EXCLUDED_SELECTORS                    = [
    "[data-feedback-ignore]",
    "[data-feedback-sensitive]",
    "input[type='password']",
    "input[type='hidden']",
    "[autocomplete^='cc-']",
    "context-drop-widget",
    "[data-context-drop-ui]"
  ];
  const ALLOWED_HTML_ATTRIBUTES                    = [
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
  function buildExcludedSelectorList(customSelectors           = [])           {
    const combined = new Set        (MANDATORY_EXCLUDED_SELECTORS);
    for (const sel of customSelectors) {
      if (typeof sel === "string" && sel.trim().length > 0) {
        combined.add(sel.trim());
      }
    }
    return Array.from(combined);
  }
  
  function elementMatchesAny(el         , selectors          )          {
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
  function getParentOrHostElement(node                )                 {
    if (!node) return null;
    if (node.parentElement) {
      return node.parentElement;
    }
    const rootNode = typeof node.getRootNode === "function" ? node.getRootNode() : null;
    if (rootNode && "host" in rootNode && (rootNode              ).host instanceof Element) {
      return (rootNode              ).host;
    }
    return null;
  }
  function isElementExcluded(node                , customSelectors           = [])          {
    if (!node) return true;
    const selectors = buildExcludedSelectorList(customSelectors);
  
    let current                 = node;
    while (current) {
      if (elementMatchesAny(current, selectors)) {
        return true;
      }
      current = getParentOrHostElement(current);
    }
    return false;
  }
  function isSelectableElement(node                , customSelectors           = [])          {
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
  function extractSanitizedAttributes(el         )                         {
    const snapshot                         = {};
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
  function extractSanitizedText(el         , customSelectors           = [])                {
    const tagName = (el.tagName || "").toUpperCase();
    if (IGNORED_TEXT_TAGS.has(tagName)) {
      return null;
    }
  
    const selectors = buildExcludedSelectorList(customSelectors);
    const parts           = [];
  
    function walk(node      )       {
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
        const childEl = node           ;
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
  
  function escapeCssIdentifier(ident        )         {
    if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
      return CSS.escape(ident);
    }
    return ident.replace(/([^a-zA-Z0-9_-])/g, "\\$1");
  }
  function computeSelector(el         )         {
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
  function computeDomPath(el         )         {
    const segments           = [];
    let current                 = el;
  
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
  function computeBoundingRect(el         )                       {
    const rect = typeof el.getBoundingClientRect === "function"
      ? el.getBoundingClientRect()
      : { x: 0, y: 0, width: 0, height: 0 };
  
    return {
      x: Math.round((rect.x ?? (rect           ).left ?? 0) * 100) / 100,
      y: Math.round((rect.y ?? (rect           ).top ?? 0) * 100) / 100,
      width: Math.round((rect.width ?? 0) * 100) / 100,
      height: Math.round((rect.height ?? 0) * 100) / 100
    };
  }
  function describeElementCandidate(
    el         ,
    relation                          ,
    depth        ,
    customSelectors           = []
  )                       {
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
  function resolveAncestorChain(
    el                ,
    customSelectors           = [],
    maxDepth         = 8
  )            {
    if (!el || !isSelectableElement(el, customSelectors)) {
      return [];
    }
  
    const chain            = [];
    let current                 = el;
  
    while (current && chain.length < maxDepth) {
      if (isSelectableElement(current, customSelectors)) {
        chain.unshift(current);
      }
      current = getParentOrHostElement(current);
    }
  
    return chain;
  }
  
  function isAncestorOf(possibleAncestor         , node         )          {
    let current                 = getParentOrHostElement(node);
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
  function resolveCandidateStack(
    primaryTarget                ,
    pointElements            = [],
    customSelectors           = [],
    maxCandidates         = 10
  )                         {
    const seen = new Set         ();
    const stack                         = [];
  
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
    const childNodes = (validPrimary                                                                              ).children ||
      (validPrimary.childNodes || []);
    for (let i = 0; i < childNodes.length; i += 1) {
      if (stack.length >= maxCandidates) break;
      const node = childNodes[i]           ;
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
  function captureElementSnapshot(
    el         ,
    customSelectors           = [],
    clientRef         
  )                                  {
    if (isElementExcluded(el, customSelectors)) {
      return null;
    }
  
    const boundingRect = computeBoundingRect(el);
  
    const viewport                   = {
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

  // --- Module: icons.ts ---
  /**
   * Authored inline SVG icon set for ContextDrop.
   * All icons share a 16x16 or 20x20 viewBox, 1.75px stroke weight, and round caps/joins.
   */
  const ICON_PIN = `<svg viewBox="0 0 20 20" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11.8 3.2l5 5-2.1 2.1-1.8-.6-3.2 3.2.6 2.5-1.6 1.6-3.1-3.1-3.1 3.1v-.1l3.1-3.1-3.1-3.1 1.6-1.6 2.5.6 3.2-3.2-.6-1.8 2.1-2.1z"/></svg>`;
  const ICON_PIN_DROP = `<svg viewBox="0 0 20 20" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 2.5a4.5 4.5 0 0 1 4.5 4.5c0 3.1-4.5 7.5-4.5 7.5S5.5 10.1 5.5 7A4.5 4.5 0 0 1 10 2.5z"/><circle cx="10" cy="7" r="1.6"/><path d="M5 17.5h10"/></svg>`;
  const ICON_LAYERS = `<svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="10 2.5 17.5 6.5 10 10.5 2.5 6.5 10 2.5"/><polyline points="2.5 10.2 10 14.2 17.5 10.2"/><polyline points="2.5 13.8 10 17.8 17.5 13.8"/></svg>`;
  const ICON_CHEVRON_UP = `<svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3.5 10 8 5.5 12.5 10"/></svg>`;
  const ICON_CHEVRON_DOWN = `<svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3.5 6 8 10.5 12.5 6"/></svg>`;
  const ICON_CHEVRON_RIGHT = `<svg viewBox="0 0 16 16" width="11" height="11" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 3.5 10.5 8 6 12.5"/></svg>`;
  const ICON_CAMERA = `<svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6.5h2.5l1.4-2h6.2l1.4 2H17a1.5 1.5 0 0 1 1.5 1.5v7.5A1.5 1.5 0 0 1 17 17H3a1.5 1.5 0 0 1-1.5-1.5V8A1.5 1.5 0 0 1 3 6.5z"/><circle cx="10" cy="11.5" r="2.75"/></svg>`;
  const ICON_IMAGE = `<svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2.5" y="3.5" width="15" height="13" rx="2"/><circle cx="7" cy="8" r="1.3"/><path d="M17.5 13.2l-3.8-3.7L6 16.5"/></svg>`;
  const ICON_SEND = `<svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.85" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 16V4"/><polyline points="5 9 10 4 15 9"/></svg>`;
  const ICON_CLOSE = `<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="4" y1="4" x2="12" y2="12"/><line x1="12" y1="4" x2="4" y2="12"/></svg>`;
  const ICON_MINIMIZE = `<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="3.5" y1="8" x2="12.5" y2="8"/></svg>`;
  const ICON_EXPAND = `<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 3.5 12.5 3.5 12.5 10"/><line x1="12.5" y1="3.5" x2="3.5" y2="12.5"/></svg>`;
  const ICON_GRIP = `<svg viewBox="0 0 12 16" width="10" height="14" fill="currentColor" aria-hidden="true"><circle cx="3.5" cy="4" r="1.1"/><circle cx="8.5" cy="4" r="1.1"/><circle cx="3.5" cy="8" r="1.1"/><circle cx="8.5" cy="8" r="1.1"/><circle cx="3.5" cy="12" r="1.1"/><circle cx="8.5" cy="12" r="1.1"/></svg>`;
  const ICON_CHECK = `<svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3.5 8.5 6.5 11.5 12.5 4.5"/></svg>`;
  const ICON_CHAT = `<svg viewBox="0 0 20 20" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 4h12a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H8l-4 3v-3H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"/></svg>`;

  // --- Module: styles.ts ---
  const WIDGET_SHADOW_STYLES = `
  :host {
    all: initial;
    --cd-ink: #111318;
    --cd-ink-secondary: #4b5262;
    --cd-ink-subtle: #5c6478;
    --cd-surface: #faf9f6;
    --cd-surface-recessed: #f1efea;
    --cd-surface-elevated: #ffffff;
    --cd-border: #d6d3cd;
    --cd-border-subtle: #e4e1da;
    --cd-pin: #c2410c;
    --cd-pin-hover: #9a3412;
    --cd-pin-soft: #ffedd5;
    --cd-accent: #1d4ed8;
    --cd-accent-hover: #1e40af;
    --cd-accent-soft: #dbeafe;
    --cd-danger: #b91c1c;
    --cd-danger-soft: #fee2e2;
    --cd-success: #15803d;
    --cd-success-soft: #dcfce7;
    --cd-shadow-float: 0 22px 44px -12px rgba(17, 19, 24, 0.22), 0 8px 18px -6px rgba(17, 19, 24, 0.10);
    --cd-shadow-pin: 0 12px 24px -6px rgba(17, 19, 24, 0.24), 0 4px 10px -3px rgba(17, 19, 24, 0.12);
    --cd-radius-lg: 16px;
    --cd-radius-md: 10px;
    --cd-radius-sm: 6px;
    --cd-font: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    --cd-mono: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    --cd-ease: cubic-bezier(0.22, 1, 0.36, 1);
    font-family: var(--cd-font);
    font-size: 13.5px;
    line-height: 1.5;
    color: var(--cd-ink);
    caret-color: var(--cd-pin);
    z-index: 2147483640;
  }
  
  *, *::before, *::after {
    box-sizing: border-box;
  }
  
  ::selection {
    background: var(--cd-pin-soft);
    color: var(--cd-ink);
  }
  
  .cd-root {
    position: fixed;
    z-index: 2147483640;
    display: flex;
    flex-direction: column;
    pointer-events: none;
    max-width: calc(100vw - 24px);
  }
  
  .cd-root.pos-top_left {
    top: 20px;
    left: 20px;
    align-items: flex-start;
  }
  
  .cd-root.pos-top_right {
    top: 20px;
    right: 20px;
    align-items: flex-end;
  }
  
  .cd-root.pos-bottom_left {
    bottom: 20px;
    left: 20px;
    align-items: flex-start;
  }
  
  .cd-root.pos-bottom_right {
    bottom: 20px;
    right: 20px;
    align-items: flex-end;
  }
  
  .cd-root.is-free-positioned {
    bottom: auto;
    right: auto;
    align-items: flex-start;
  }
  
  /* Focus states across all interactive controls */
  button:focus-visible,
  textarea:focus-visible {
    outline: 2px solid var(--cd-accent);
    outline-offset: 2px;
  }
  
  /* Custom themed scrollbars */
  .cd-chat-thread::-webkit-scrollbar,
  .cd-tray::-webkit-scrollbar,
  .cd-breadcrumb-scroll::-webkit-scrollbar {
    width: 6px;
    height: 6px;
  }
  
  .cd-chat-thread::-webkit-scrollbar-track,
  .cd-tray::-webkit-scrollbar-track,
  .cd-breadcrumb-scroll::-webkit-scrollbar-track {
    background: transparent;
  }
  
  .cd-chat-thread::-webkit-scrollbar-thumb,
  .cd-tray::-webkit-scrollbar-thumb,
  .cd-breadcrumb-scroll::-webkit-scrollbar-thumb {
    background: var(--cd-border);
    border-radius: 9999px;
  }
  
  /* Freely Floating Pin Trigger Dock */
  .cd-pin-dock {
    pointer-events: auto;
    display: inline-flex;
    align-items: center;
    gap: 2px;
    padding: 4px;
    background: var(--cd-ink);
    color: var(--cd-surface);
    border: 1px solid rgba(250, 249, 246, 0.14);
    border-radius: 9999px 9999px 9999px 6px;
    box-shadow: var(--cd-shadow-pin);
    user-select: none;
    touch-action: none;
    transition: transform 0.18s var(--cd-ease), box-shadow 0.18s var(--cd-ease);
  }
  
  .cd-pin-dock[hidden] {
    display: none !important;
  }
  
  .cd-pin-dock.is-dragging {
    cursor: grabbing;
    transform: scale(1.03);
  }
  
  .cd-pin-dock-grip {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 4px 3px 4px 5px;
    color: #9ca3b5;
    cursor: grab;
  }
  
  .cd-pin-dock-grip:active {
    cursor: grabbing;
  }
  
  .cd-floating-pin-btn {
    appearance: none;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 7px 11px;
    border-radius: 9999px 9999px 9999px 4px;
    border: 0;
    background: var(--cd-pin);
    color: var(--cd-surface);
    font-family: var(--cd-font);
    font-size: 12.5px;
    font-weight: 600;
    cursor: pointer;
    transition: background-color 0.15s var(--cd-ease), transform 0.15s var(--cd-ease);
  }
  
  .cd-floating-pin-btn:hover {
    background: var(--cd-pin-hover);
  }
  
  .cd-floating-pin-btn.is-active {
    background: var(--cd-accent);
  }
  
  .cd-trigger {
    appearance: none;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 7px 12px;
    border-radius: 9999px;
    border: 0;
    background: transparent;
    color: var(--cd-surface);
    font-family: var(--cd-font);
    font-size: 12.5px;
    font-weight: 600;
    cursor: pointer;
    transition: background-color 0.15s var(--cd-ease);
  }
  
  .cd-trigger:hover {
    background: rgba(250, 249, 246, 0.12);
  }
  
  .cd-count-pill {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 18px;
    height: 18px;
    padding: 0 5px;
    border-radius: 9999px;
    background: var(--cd-pin-soft);
    color: var(--cd-pin-hover);
    font-size: 11px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }
  
  /* Compact Minimized Bar (active while pinning elements or minimized) */
  .cd-compact-bar {
    pointer-events: auto;
    display: flex;
    align-items: center;
    gap: 8px;
    width: 440px;
    max-width: calc(100vw - 24px);
    padding: 7px 10px;
    background: var(--cd-surface);
    color: var(--cd-ink);
    border: 1px solid var(--cd-border);
    border-radius: 14px;
    box-shadow: var(--cd-shadow-float);
    margin-bottom: 10px;
    user-select: none;
    touch-action: none;
  }
  
  .cd-compact-bar[hidden] {
    display: none !important;
  }
  
  .cd-compact-status {
    display: flex;
    align-items: center;
    gap: 6px;
    flex: 1;
    min-width: 0;
  }
  
  .cd-breadcrumb-scroll {
    display: flex;
    align-items: center;
    gap: 3px;
    overflow-x: auto;
    white-space: nowrap;
    scrollbar-width: thin;
    flex: 1;
    min-width: 0;
    padding: 2px 0;
  }
  
  .cd-crumb-btn {
    appearance: none;
    border: 1px solid transparent;
    background: var(--cd-surface-recessed);
    color: var(--cd-ink-secondary);
    font-family: var(--cd-mono);
    font-size: 11px;
    padding: 2px 6px;
    border-radius: 5px;
    cursor: pointer;
    flex-shrink: 0;
  }
  
  .cd-crumb-btn:hover {
    border-color: var(--cd-accent);
    color: var(--cd-ink);
  }
  
  .cd-crumb-btn.is-current {
    background: var(--cd-accent-soft);
    border-color: var(--cd-accent);
    color: var(--cd-accent-hover);
    font-weight: 600;
  }
  
  .cd-crumb-sep {
    display: inline-flex;
    color: var(--cd-ink-subtle);
    flex-shrink: 0;
  }
  
  /* Main Floating Chatbox Composer Window */
  .cd-composer {
    pointer-events: auto;
    width: 400px;
    max-width: calc(100vw - 24px);
    background: var(--cd-surface);
    border: 1px solid var(--cd-border);
    border-radius: var(--cd-radius-lg);
    box-shadow: var(--cd-shadow-float);
    margin-bottom: 10px;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    transition: opacity 0.18s var(--cd-ease), transform 0.18s var(--cd-ease);
  }
  
  .cd-composer[hidden] {
    display: none !important;
  }
  
  .cd-composer.is-dragging-over {
    border-color: var(--cd-accent);
  }
  
  /* Chatbox Header with Top-Left Pin Selector & Drag Bar */
  .cd-composer-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 9px 11px;
    background: var(--cd-surface-recessed);
    border-bottom: 1px solid var(--cd-border);
    cursor: grab;
    user-select: none;
    touch-action: none;
  }
  
  .cd-composer-header:active {
    cursor: grabbing;
  }
  
  .cd-header-left {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }
  
  /* Pin-Shaped Selector on the Top-Left Corner of the Chatbox */
  .cd-pin-corner-btn {
    appearance: none;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 6px 10px;
    border-radius: 11px 11px 11px 3px;
    border: 1px solid rgba(194, 65, 12, 0.25);
    background: var(--cd-pin);
    color: var(--cd-surface);
    font-family: var(--cd-font);
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    box-shadow: 0 4px 10px -2px rgba(194, 65, 12, 0.28);
    transition: background-color 0.15s var(--cd-ease), transform 0.15s var(--cd-ease);
  }
  
  .cd-pin-corner-btn:hover {
    background: var(--cd-pin-hover);
    transform: translateY(-1px);
  }
  
  .cd-pin-corner-btn.is-active {
    background: var(--cd-accent);
    border-color: var(--cd-accent);
    box-shadow: 0 4px 10px -2px rgba(29, 78, 216, 0.30);
  }
  
  .cd-composer-title {
    font-size: 13px;
    font-weight: 600;
    color: var(--cd-ink);
    margin: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  
  .cd-header-actions {
    display: flex;
    align-items: center;
    gap: 4px;
  }
  
  .cd-icon-btn {
    appearance: none;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border: 1px solid transparent;
    background: transparent;
    color: var(--cd-ink-secondary);
    border-radius: 7px;
    cursor: pointer;
    transition: background-color 0.12s ease, color 0.12s ease;
  }
  
  .cd-icon-btn:hover {
    background: rgba(17, 19, 24, 0.06);
    color: var(--cd-ink);
  }
  
  /* Conversational Chat Thread */
  .cd-chat-thread {
    display: flex;
    flex-direction: column;
    gap: 10px;
    max-height: 230px;
    overflow-y: auto;
    padding: 12px 14px;
    background: var(--cd-surface);
    scrollbar-width: thin;
  }
  
  .cd-chat-empty {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 10px 12px;
    background: var(--cd-surface-recessed);
    border: 1px solid var(--cd-border-subtle);
    border-radius: var(--cd-radius-md);
    color: var(--cd-ink-secondary);
    font-size: 12.5px;
  }
  
  .cd-chat-empty-text {
    margin: 0;
    color: var(--cd-ink);
    font-weight: 500;
  }
  
  .cd-chat-empty-hint {
    margin: 0;
    font-size: 11.5px;
    color: var(--cd-ink-secondary);
  }
  
  .cd-chat-msg {
    display: flex;
    flex-direction: column;
    gap: 5px;
    align-self: flex-end;
    max-width: 92%;
    padding: 9px 11px;
    background: var(--cd-surface-elevated);
    border: 1px solid var(--cd-border);
    border-radius: 12px 12px 3px 12px;
  }
  
  .cd-chat-msg-text {
    margin: 0;
    font-size: 13px;
    color: var(--cd-ink);
    white-space: pre-wrap;
    word-break: break-word;
  }
  
  .cd-chat-msg-meta {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    font-size: 11px;
    color: var(--cd-ink-secondary);
    font-variant-numeric: tabular-nums;
  }
  
  .cd-chat-msg-pills {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }
  
  .cd-chat-msg-pill {
    font-family: var(--cd-mono);
    font-size: 10.5px;
    padding: 1px 6px;
    border-radius: 4px;
    background: var(--cd-surface-recessed);
    border: 1px solid var(--cd-border-subtle);
    color: var(--cd-ink);
  }
  
  /* Pinned Elements & Attachments Context Tray */
  .cd-tray {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    max-height: 116px;
    overflow-y: auto;
    padding: 8px 12px;
    background: var(--cd-surface-recessed);
    border-top: 1px solid var(--cd-border-subtle);
    scrollbar-width: thin;
  }
  
  .cd-tray:empty {
    display: none;
  }
  
  .cd-chip {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    max-width: 100%;
    padding: 3px 7px;
    background: var(--cd-surface-elevated);
    border: 1px solid var(--cd-border);
    border-radius: 7px;
    font-size: 11.5px;
    color: var(--cd-ink);
    transition: border-color 0.12s ease;
  }
  
  .cd-chip[data-chip-type="element"]:hover {
    border-color: var(--cd-pin);
  }
  
  .cd-chip-thumb {
    width: 20px;
    height: 20px;
    border-radius: 4px;
    object-fit: cover;
    border: 1px solid var(--cd-border);
  }
  
  .cd-chip-badge {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    font-size: 10px;
    font-weight: 600;
    padding: 1px 5px;
    border-radius: 4px;
    background: var(--cd-pin-soft);
    color: var(--cd-pin-hover);
  }
  
  .cd-chip[data-chip-type="screenshot"] .cd-chip-badge,
  .cd-chip[data-chip-type="image"] .cd-chip-badge {
    background: var(--cd-accent-soft);
    color: var(--cd-accent-hover);
  }
  
  .cd-chip-label {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 165px;
    font-family: var(--cd-mono);
    font-size: 11px;
  }
  
  .cd-chip-action,
  .cd-chip-remove {
    appearance: none;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 0;
    background: transparent;
    color: var(--cd-ink-secondary);
    cursor: pointer;
    padding: 2px;
    border-radius: 4px;
    line-height: 1;
  }
  
  .cd-chip-action:hover {
    color: var(--cd-accent);
    background: var(--cd-accent-soft);
  }
  
  .cd-chip-remove:hover {
    color: var(--cd-danger);
    background: var(--cd-danger-soft);
  }
  
  /* Status Banner */
  .cd-status {
    padding: 7px 12px;
    font-size: 12px;
    font-weight: 500;
    border-top: 1px solid var(--cd-border-subtle);
  }
  
  .cd-status[hidden] {
    display: none !important;
  }
  
  .cd-status.error {
    color: var(--cd-danger);
    background: var(--cd-danger-soft);
  }
  
  .cd-status.success {
    color: var(--cd-success);
    background: var(--cd-success-soft);
  }
  
  /* Chatbox Prompt Input Container */
  .cd-prompt-shell {
    display: flex;
    flex-direction: column;
    background: var(--cd-surface-elevated);
    border-top: 1px solid var(--cd-border);
  }
  
  .cd-textarea {
    width: 100%;
    min-height: 68px;
    max-height: 180px;
    resize: vertical;
    border: 0;
    padding: 10px 13px 6px;
    font-family: var(--cd-font);
    font-size: 13.5px;
    line-height: 1.45;
    color: var(--cd-ink);
    background: transparent;
  }
  
  .cd-textarea::placeholder {
    color: var(--cd-ink-secondary);
  }
  
  .cd-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 6px 10px 9px;
    background: var(--cd-surface-elevated);
  }
  
  .cd-toolbar-actions {
    display: flex;
    align-items: center;
    gap: 5px;
    flex-wrap: wrap;
  }
  
  .cd-btn {
    appearance: none;
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 5px 9px;
    border-radius: 7px;
    border: 1px solid var(--cd-border);
    background: var(--cd-surface);
    color: var(--cd-ink);
    font-family: var(--cd-font);
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    transition: background-color 0.12s ease, border-color 0.12s ease;
  }
  
  .cd-btn:hover:not(:disabled) {
    background: var(--cd-surface-recessed);
    border-color: var(--cd-ink-secondary);
  }
  
  .cd-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  
  .cd-btn-primary {
    background: var(--cd-ink);
    border-color: var(--cd-ink);
    color: var(--cd-surface);
    font-weight: 600;
    padding: 6px 12px;
  }
  
  .cd-btn-primary:hover:not(:disabled) {
    background: #252a34;
    border-color: #252a34;
  }
  
  @media (max-width: 480px) {
    .cd-composer,
    .cd-compact-bar {
      width: calc(100vw - 20px);
    }
  }
  `;

  // --- Module: api-client.ts ---
  class ContextDropApiClient {
            baseUrl        ;
            cachedCsrfToken                = null;
            inFlightConfigPromise                               = null;
  
    constructor(baseUrl         = "/context_drop") {
      this.baseUrl = baseUrl.replace(/\/+$/, "") || "/context_drop";
    }
  
           getCsrfToken()                {
      const metaToken = this.getMetaCsrfToken();
      if (metaToken) {
        return metaToken;
      }
      return this.cachedCsrfToken;
    }
  
           setCsrfToken(token               )       {
      this.cachedCsrfToken = token ? token.trim() : null;
    }
  
            getMetaCsrfToken()                {
      if (typeof document === "undefined") return null;
      const meta = document.querySelector('meta[name="csrf-token"]');
      const content = meta ? meta.getAttribute("content") : null;
      return content && content.trim().length > 0 ? content.trim() : null;
    }
  
           async fetchConfig()                        {
      if (this.inFlightConfigPromise) {
        return this.inFlightConfigPromise;
      }
  
      this.inFlightConfigPromise = (async () => {
        try {
          const response = await fetch(`${this.baseUrl}/config`, {
            method: "GET",
            credentials: "same-origin",
            headers: {
              Accept: "application/json"
            }
          });
  
          if (!response.ok) {
            throw new Error(`Failed to fetch ContextDrop config (${response.status})`);
          }
  
          const config = (await response.json())                ;
          if (config && typeof config.csrf_token === "string" && config.csrf_token.trim().length > 0) {
            this.cachedCsrfToken = config.csrf_token.trim();
            if (typeof document !== "undefined") {
              const meta = document.querySelector('meta[name="csrf-token"]');
              if (meta) {
                meta.setAttribute("content", this.cachedCsrfToken);
              }
            }
          }
          return config;
        } finally {
          this.inFlightConfigPromise = null;
        }
      })();
  
      return this.inFlightConfigPromise;
    }
  
           async resolveCsrfToken(forceRefresh = false)                         {
      if (!forceRefresh) {
        const metaToken = this.getMetaCsrfToken();
        if (metaToken) {
          return metaToken;
        }
        if (this.cachedCsrfToken) {
          return this.cachedCsrfToken;
        }
      }
  
      try {
        const config = await this.fetchConfig();
        if (config && config.csrf_token) {
          return config.csrf_token.trim();
        }
      } catch {
        // Continue and fall back to current token or null
      }
  
      return this.cachedCsrfToken || this.getMetaCsrfToken();
    }
  
            isCsrfError(status        , message        )          {
      if (status !== 422) return false;
      return /csrf|authenticity/i.test(message);
    }
  
            async executeWithCsrfRetry   (
      requestFn                                                 ,
      defaultErrorMessage        
    )             {
      let csrfToken = await this.resolveCsrfToken(false);
      let response = await requestFn(csrfToken);
  
      if (response.ok) {
        return (await response.json())     ;
      }
  
      if (response.status === 422) {
        const rawText = await response.text();
        let parsedError                = null;
        try {
          const json = JSON.parse(rawText)                      ;
          if (json && typeof json.error === "string") {
            parsedError = json.error;
          }
        } catch {
          // Not JSON
        }
  
        const errorMessage = parsedError || rawText || "";
        const shouldRetryCsrf =
          this.isCsrfError(response.status, errorMessage) || (!csrfToken && response.status === 422);
  
        if (shouldRetryCsrf) {
          csrfToken = await this.resolveCsrfToken(true);
          response = await requestFn(csrfToken);
          if (response.ok) {
            return (await response.json())     ;
          }
          const retryErrBody = await response.json().catch(() => ({}));
          throw new Error(
            (retryErrBody                      ).error || `${defaultErrorMessage} (${response.status})`
          );
        }
  
        throw new Error(parsedError || errorMessage || `${defaultErrorMessage} (${response.status})`);
      }
  
      const errBody = await response.json().catch(() => ({}));
      throw new Error(
        (errBody                      ).error || `${defaultErrorMessage} (${response.status})`
      );
    }
  
           async uploadAttachment(file      , filename        )                                      {
      const makeRequest = async (csrfToken               ) => {
        const formData = new FormData();
        formData.append("file", file, filename);
  
        const headers                         = {
          Accept: "application/json"
        };
        if (csrfToken) {
          headers["X-CSRF-Token"] = csrfToken;
        }
  
        return fetch(`${this.baseUrl}/attachments`, {
          method: "POST",
          credentials: "same-origin",
          headers,
          body: formData
        });
      };
  
      return this.executeWithCsrfRetry(makeRequest, "Upload failed");
    }
  
           async submitFeedback(payload                           )                                      {
      const makeRequest = async (csrfToken               ) => {
        const headers                         = {
          "Content-Type": "application/json",
          Accept: "application/json"
        };
        if (csrfToken) {
          headers["X-CSRF-Token"] = csrfToken;
        }
  
        return fetch(`${this.baseUrl}/feedback`, {
          method: "POST",
          credentials: "same-origin",
          headers,
          body: JSON.stringify({ feedback: payload })
        });
      };
  
      return this.executeWithCsrfRetry(makeRequest, "Submission failed");
    }
  }

  // --- Module: screenshot.ts ---
  function collectRedactionRects(customExcludedSelectors           = [])                         {
    if (typeof document === "undefined") return [];
  
    const selectors = buildExcludedSelectorList(customExcludedSelectors);
    const selectorQuery = [
      ...selectors.filter((s) => s !== "context-drop-widget" && s !== "[data-context-drop-ui]"),
      "iframe"
    ].join(", ");
  
    const rects                         = [];
    let candidates                     ;
    try {
      candidates = document.querySelectorAll(selectorQuery);
    } catch {
      candidates = document.querySelectorAll(
        "[data-feedback-ignore], [data-feedback-sensitive], input[type='password'], input[type='hidden'], iframe"
      );
    }
  
    for (let i = 0; i < candidates.length; i += 1) {
      const el = candidates[i];
      if (el.closest("context-drop-widget")) continue;
  
      // For iframes, redact cross-origin or excluded iframes
      if (el.tagName.toLowerCase() === "iframe" && !isElementExcluded(el, customExcludedSelectors)) {
        const src = el.getAttribute("src") || "";
        const isCrossOrigin =
          src.startsWith("http://") ||
          src.startsWith("https://") ||
          src.startsWith("//");
        if (!isCrossOrigin) continue;
      }
  
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) {
        rects.push({
          x: r.x ?? r.left,
          y: r.y ?? r.top,
          width: r.width,
          height: r.height
        });
      }
    }
  
    return rects;
  }
  
  function dataUrlToBlob(dataUrl        )       {
    const parts = dataUrl.split(";base64,");
    const mime = (parts[0] || "data:image/png").replace("data:", "");
    const b64 = parts[1] || "";
    const binary = typeof atob === "function" ? atob(b64) : "";
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new Blob([bytes], { type: mime });
  }
  async function captureViewportScreenshot(
    customExcludedSelectors           = [],
    cropRegion                       
  )                                   {
    if (typeof document === "undefined" || typeof window === "undefined") {
      throw new Error("Screenshot capture is only available in a browser environment.");
    }
  
    const widgets = Array.from(document.querySelectorAll("context-drop-widget, [data-context-drop-ui]"))                 ;
    const previousVisibility = widgets.map((el) => el.style.visibility);
  
    try {
      // 1. Hide ContextDrop's own UI during capture
      for (const w of widgets) {
        w.style.visibility = "hidden";
      }
  
      const vw = Math.max(window.innerWidth || 1024, 1);
      const vh = Math.max(window.innerHeight || 768, 1);
      const region                       = cropRegion
        ? {
            x: Math.max(0, Math.min(cropRegion.x, vw - 1)),
            y: Math.max(0, Math.min(cropRegion.y, vh - 1)),
            width: Math.max(1, Math.min(cropRegion.width, vw - Math.max(0, cropRegion.x))),
            height: Math.max(1, Math.min(cropRegion.height, vh - Math.max(0, cropRegion.y)))
          }
        : { x: 0, y: 0, width: vw, height: vh };
  
      const redactionRects = collectRedactionRects(customExcludedSelectors);
  
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(region.width);
      canvas.height = Math.round(region.height);
      const ctx = canvas.getContext("2d");
  
      if (!ctx) {
        throw new Error("Canvas 2D context is unavailable or restricted by browser policy.");
      }
  
      // Paint page background
      const bodyBg =
        window.getComputedStyle && document.body
          ? window.getComputedStyle(document.body).backgroundColor
          : "#ffffff";
      ctx.fillStyle = bodyBg && bodyBg !== "rgba(0, 0, 0, 0)" ? bodyBg : "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
  
      // Paint visible non-excluded DOM elements approximation onto canvas
      const visibleNodes = document.body ? Array.from(document.body.querySelectorAll("*")) : [];
      for (const node of visibleNodes) {
        if (node.closest("context-drop-widget") || node.hasAttribute("data-context-drop-ui")) continue;
        if (isElementExcluded(node, customExcludedSelectors)) continue;
  
        const r = node.getBoundingClientRect();
        if (r.width <= 0 || r.height <= 0) continue;
  
        const rx = (r.x ?? r.left) - region.x;
        const ry = (r.y ?? r.top) - region.y;
        if (rx + r.width < 0 || ry + r.height < 0 || rx > region.width || ry > region.height) {
          continue;
        }
  
        const style = window.getComputedStyle ? window.getComputedStyle(node) : null;
        if (style) {
          if (style.backgroundColor && style.backgroundColor !== "rgba(0, 0, 0, 0)" && style.backgroundColor !== "transparent") {
            ctx.fillStyle = style.backgroundColor;
            ctx.fillRect(rx, ry, r.width, r.height);
          }
          if (style.borderWidth && parseFloat(style.borderWidth) > 0) {
            ctx.strokeStyle = style.borderColor || "#cbd5e1";
            ctx.lineWidth = Math.min(parseFloat(style.borderWidth), 4);
            ctx.strokeRect(rx, ry, r.width, r.height);
          }
        }
      }
  
      // 2. Enforce pre-capture visual redaction of all sensitive/excluded elements
      for (const red of redactionRects) {
        const rx = red.x - region.x;
        const ry = red.y - region.y;
        if (rx + red.width < 0 || ry + red.height < 0 || rx > region.width || ry > region.height) {
          continue;
        }
        ctx.fillStyle = "#0f172a";
        ctx.fillRect(rx, ry, red.width, red.height);
        ctx.fillStyle = "#94a3b8";
        ctx.font = "11px sans-serif";
        if (red.width >= 60 && red.height >= 16) {
          ctx.fillText("[REDACTED]", rx + 6, ry + Math.min(red.height - 4, 14));
        }
      }
  
      const dataUrl = canvas.toDataURL("image/png");
      const blob = dataUrlToBlob(dataUrl);
  
      return {
        dataUrl,
        blob,
        width: canvas.width,
        height: canvas.height,
        redactedCount: redactionRects.length,
        metadata: {
          capture_type: cropRegion ? "element" : "viewport",
          image_dimensions: { width: canvas.width, height: canvas.height },
          viewport: { width: vw, height: vh },
          redacted_elements_count: redactionRects.length,
          captured_at: new Date().toISOString()
        }
      };
    } finally {
      // Always restore ContextDrop UI visibility
      widgets.forEach((el, idx) => {
        el.style.visibility = previousVisibility[idx] || "";
      });
    }
  }
  async function captureElementScreenshot(
    element         ,
    padding         = 16,
    customExcludedSelectors           = [],
    elementClientRef         
  )                                   {
    if (isElementExcluded(element, customExcludedSelectors)) {
      throw new Error("Cannot capture screenshot of an excluded or sensitive DOM element.");
    }
  
    const r = element.getBoundingClientRect();
    const pad = Math.max(0, padding);
    const cropRegion                       = {
      x: (r.x ?? r.left) - pad,
      y: (r.y ?? r.top) - pad,
      width: r.width + pad * 2,
      height: r.height + pad * 2
    };
  
    const result = await captureViewportScreenshot(customExcludedSelectors, cropRegion);
    result.metadata.capture_type = "element";
    if (elementClientRef) {
      result.metadata.element_attachment_ref = elementClientRef;
    }
    return result;
  }

  // --- Module: element-picker.ts ---
  class ElementPicker {
            active          = false;
            anchored          = false;
            anchorX         = 0;
            anchorY         = 0;
            lastPointerX         = 0;
            lastPointerY         = 0;
            wheelAccumulator         = 0;
  
            callbacks                        ;
            overlayEl                        = null;
            leafOutlineEl                        = null;
            labelEl                        = null;
            pinMarkerEl                        = null;
            popoverEl                        = null;
            previewOverlayEl                        = null;
  
            candidateStack                         = [];
            activeCandidateIndex         = 0;
            leafElement                 = null;
            previousCursor         = "";
  
            boundMouseMove                         ;
            boundClickCapture                         ;
            boundPointerCapture                    ;
            boundWheelCapture                         ;
            boundKeyDown                            ;
            boundScrollOrResize            ;
  
    constructor(callbacks                        ) {
      this.callbacks = callbacks;
      this.boundMouseMove = this.handleMouseMove.bind(this);
      this.boundClickCapture = this.handleClickCapture.bind(this);
      this.boundPointerCapture = this.handlePointerSuppression.bind(this);
      this.boundWheelCapture = this.handleWheelCapture.bind(this);
      this.boundKeyDown = this.handleKeyDown.bind(this);
      this.boundScrollOrResize = this.updateOverlayPosition.bind(this);
    }
  
           isActive()          {
      return this.active;
    }
  
           isAnchored()          {
      return this.anchored;
    }
  
           getActiveCandidate()                              {
      return this.candidateStack[this.activeCandidateIndex] || null;
    }
  
           getCandidateStack()                         {
      return [...this.candidateStack];
    }
  
           start()       {
      if (this.active || typeof document === "undefined" || typeof window === "undefined") {
        return;
      }
      this.active = true;
      this.anchored = false;
      this.candidateStack = [];
      this.activeCandidateIndex = 0;
      this.leafElement = null;
  
      this.hideExternalPreview();
  
      this.previousCursor = document.body ? document.body.style.cursor : "";
      if (document.body) {
        document.body.style.cursor = "crosshair";
      }
  
      this.mountSelectionUi();
      this.notifyStateChange();
  
      window.addEventListener("mousemove", this.boundMouseMove, { capture: true, passive: true });
      window.addEventListener("pointerdown", this.boundPointerCapture, { capture: true });
      window.addEventListener("mousedown", this.boundPointerCapture, { capture: true });
      window.addEventListener("mouseup", this.boundPointerCapture, { capture: true });
      window.addEventListener("click", this.boundClickCapture, { capture: true });
      window.addEventListener("wheel", this.boundWheelCapture, { capture: true, passive: false });
      window.addEventListener("keydown", this.boundKeyDown, { capture: true });
      window.addEventListener("scroll", this.boundScrollOrResize, { capture: true, passive: true });
      window.addEventListener("resize", this.boundScrollOrResize, { passive: true });
    }
  
           stop()       {
      if (!this.active) return;
      this.active = false;
      this.anchored = false;
      this.candidateStack = [];
      this.activeCandidateIndex = 0;
      this.leafElement = null;
  
      if (typeof document !== "undefined" && document.body) {
        document.body.style.cursor = this.previousCursor;
      }
  
      if (typeof window !== "undefined") {
        window.removeEventListener("mousemove", this.boundMouseMove, { capture: true });
        window.removeEventListener("pointerdown", this.boundPointerCapture, { capture: true });
        window.removeEventListener("mousedown", this.boundPointerCapture, { capture: true });
        window.removeEventListener("mouseup", this.boundPointerCapture, { capture: true });
        window.removeEventListener("click", this.boundClickCapture, { capture: true });
        window.removeEventListener("wheel", this.boundWheelCapture, { capture: true });
        window.removeEventListener("keydown", this.boundKeyDown, { capture: true });
        window.removeEventListener("scroll", this.boundScrollOrResize, { capture: true });
        window.removeEventListener("resize", this.boundScrollOrResize);
      }
  
      this.unmountSelectionUi();
      this.notifyStateChange();
      this.callbacks.onExit();
    }
  
    /**
     * Allows the widget or breadcrumb bar to select or preview a specific DOM element directly.
     */
           focusCandidateElement(el         )       {
      if (!this.active) return;
      const excluded = this.callbacks.getExcludedSelectors();
      if (!isSelectableElement(el, excluded)) return;
  
      const existingIdx = this.candidateStack.findIndex((c) => c.element === el);
      if (existingIdx !== -1) {
        this.activeCandidateIndex = existingIdx;
      } else {
        const info = describeElementCandidate(el, "ancestor", this.candidateStack.length, excluded);
        this.candidateStack.push(info);
        this.activeCandidateIndex = this.candidateStack.length - 1;
      }
  
      this.updateOverlayPosition();
      if (this.anchored) {
        this.renderLayerPopover();
      }
      this.notifyStateChange();
    }
  
           selectElementDirectly(el         )          {
      const excluded = this.callbacks.getExcludedSelectors();
      const snapshot = captureElementSnapshot(el, excluded);
      if (!snapshot) return false;
  
      this.callbacks.onSelect(snapshot, el);
      this.closeLayerPopover();
  
      if (!this.callbacks.canSelectMore()) {
        this.stop();
      } else {
        this.notifyStateChange();
      }
      return true;
    }
  
           showExternalPreview(el                )       {
      if (typeof document === "undefined" || !document.body) return;
      if (!el || this.active) {
        this.hideExternalPreview();
        return;
      }
  
      const rect = el.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) {
        this.hideExternalPreview();
        return;
      }
  
      if (!this.previewOverlayEl) {
        const preview = document.createElement("div");
        preview.setAttribute("data-context-drop-ui", "chip-preview");
        preview.style.cssText = [
          "position: fixed",
          "pointer-events: none",
          "z-index: 2147483644",
          "border: 2px solid #c2410c",
          "background: rgba(234, 88, 12, 0.10)",
          "border-radius: 6px",
          "transition: all 0.12s cubic-bezier(0.22, 1, 0.36, 1)"
        ].join(";");
        document.body.appendChild(preview);
        this.previewOverlayEl = preview;
      }
  
      this.previewOverlayEl.style.display = "block";
      this.previewOverlayEl.style.left = `${rect.left}px`;
      this.previewOverlayEl.style.top = `${rect.top}px`;
      this.previewOverlayEl.style.width = `${rect.width}px`;
      this.previewOverlayEl.style.height = `${rect.height}px`;
    }
  
           hideExternalPreview()       {
      if (this.previewOverlayEl && this.previewOverlayEl.parentNode) {
        this.previewOverlayEl.parentNode.removeChild(this.previewOverlayEl);
      }
      this.previewOverlayEl = null;
    }
  
           cycleDepth(delta        )       {
      if (!this.active || this.candidateStack.length <= 1) return;
      const next = Math.max(
        0,
        Math.min(this.candidateStack.length - 1, this.activeCandidateIndex + delta)
      );
      if (next !== this.activeCandidateIndex) {
        this.activeCandidateIndex = next;
        this.updateOverlayPosition();
        if (this.anchored) {
          this.renderLayerPopover();
        }
        this.notifyStateChange();
      }
    }
  
            notifyStateChange()       {
      if (!this.callbacks.onStateChange) return;
      const activeCandidate = this.getActiveCandidate();
      const ancestors = activeCandidate
        ? resolveAncestorChain(activeCandidate.element, this.callbacks.getExcludedSelectors())
        : [];
      this.callbacks.onStateChange({
        active: this.active,
        anchored: this.anchored,
        activeCandidate,
        candidateStack: [...this.candidateStack],
        ancestors
      });
    }
  
            mountSelectionUi()       {
      if (typeof document === "undefined" || !document.body) return;
  
      // Secondary ghost outline showing the innermost leaf element when cycling up to parent/overlapping layers
      const leafOutline = document.createElement("div");
      leafOutline.setAttribute("data-context-drop-ui", "leaf-outline");
      leafOutline.style.cssText = [
        "position: fixed",
        "pointer-events: none",
        "z-index: 2147483644",
        "border: 1px dashed rgba(29, 78, 216, 0.55)",
        "background: rgba(29, 78, 216, 0.03)",
        "border-radius: 4px",
        "display: none"
      ].join(";");
  
      // Primary active element highlight box
      const overlay = document.createElement("div");
      overlay.setAttribute("data-context-drop-ui", "overlay");
      overlay.style.cssText = [
        "position: fixed",
        "pointer-events: none",
        "z-index: 2147483645",
        "border: 2px solid #1d4ed8",
        "background: rgba(29, 78, 216, 0.10)",
        "border-radius: 6px",
        "display: none",
        "transition: left 0.06s cubic-bezier(0.22, 1, 0.36, 1), top 0.06s cubic-bezier(0.22, 1, 0.36, 1), width 0.06s cubic-bezier(0.22, 1, 0.36, 1), height 0.06s cubic-bezier(0.22, 1, 0.36, 1)"
      ].join(";");
  
      // Floating HUD badge on the highlight box
      const label = document.createElement("div");
      label.setAttribute("data-context-drop-ui", "label");
      label.style.cssText = [
        "position: absolute",
        "top: -30px",
        "left: -2px",
        "background: #111318",
        "color: #faf9f6",
        "font-family: ui-monospace, SFMono-Regular, Menlo, monospace",
        "font-size: 11px",
        "font-variant-numeric: tabular-nums",
        "line-height: 1.3",
        "padding: 4px 8px",
        "border-radius: 6px",
        "white-space: nowrap",
        "pointer-events: none",
        "display: inline-flex",
        "align-items: center",
        "gap: 6px",
        "box-shadow: 0 8px 18px -4px rgba(17, 19, 24, 0.28)"
      ].join(";");
      overlay.appendChild(label);
  
      // Floating Pin marker that follows the pointer or anchors at the clicked coordinate
      const pinMarker = document.createElement("div");
      pinMarker.setAttribute("data-context-drop-ui", "pin-marker");
      pinMarker.style.cssText = [
        "position: fixed",
        "pointer-events: none",
        "z-index: 2147483646",
        "width: 28px",
        "height: 28px",
        "margin-left: -6px",
        "margin-top: -24px",
        "border-radius: 9999px 9999px 9999px 3px",
        "background: #c2410c",
        "color: #faf9f6",
        "border: 1.5px solid #faf9f6",
        "display: none",
        "align-items: center",
        "justify-content: center",
        "box-shadow: 0 8px 16px -3px rgba(17, 19, 24, 0.32)",
        "transition: transform 0.12s cubic-bezier(0.22, 1, 0.36, 1)"
      ].join(";");
      pinMarker.innerHTML = ICON_PIN;
  
      // Layer & Hierarchy Disambiguation Popover (anchors when clicking overlapping/cascading elements)
      const popover = document.createElement("div");
      popover.setAttribute("data-context-drop-ui", "layer-popover");
      popover.style.cssText = [
        "position: fixed",
        "z-index: 2147483647",
        "width: 348px",
        "max-width: calc(100vw - 24px)",
        "background: #faf9f6",
        "color: #111318",
        "border: 1px solid #d6d3cd",
        "border-radius: 12px",
        "box-shadow: 0 22px 44px -12px rgba(17, 19, 24, 0.26), 0 6px 14px -4px rgba(17, 19, 24, 0.10)",
        "font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        "font-size: 12px",
        "display: none",
        "overflow: hidden",
        "pointer-events: auto"
      ].join(";");
  
      document.body.appendChild(leafOutline);
      document.body.appendChild(overlay);
      document.body.appendChild(pinMarker);
      document.body.appendChild(popover);
  
      this.leafOutlineEl = leafOutline;
      this.overlayEl = overlay;
      this.labelEl = label;
      this.pinMarkerEl = pinMarker;
      this.popoverEl = popover;
    }
  
            unmountSelectionUi()       {
      for (const el of [this.leafOutlineEl, this.overlayEl, this.pinMarkerEl, this.popoverEl]) {
        if (el && el.parentNode) {
          el.parentNode.removeChild(el);
        }
      }
      this.leafOutlineEl = null;
      this.overlayEl = null;
      this.labelEl = null;
      this.pinMarkerEl = null;
      this.popoverEl = null;
    }
  
            isInternalUiEvent(event       )          {
      const path = typeof event.composedPath === "function" ? event.composedPath() : [];
      for (const node of path) {
        if (node instanceof Element) {
          if (
            node.tagName.toLowerCase() === "context-drop-widget" ||
            node.hasAttribute("data-context-drop-ui") ||
            (typeof node.closest === "function" &&
              (node.closest("context-drop-widget") || node.closest("[data-context-drop-ui]")))
          ) {
            return true;
          }
        }
      }
      const rawTarget = event.target instanceof Element ? event.target : null;
      if (
        rawTarget &&
        typeof rawTarget.closest === "function" &&
        (rawTarget.closest("context-drop-widget") || rawTarget.closest("[data-context-drop-ui]"))
      ) {
        return true;
      }
      return false;
    }
  
            collectPointElements(clientX        , clientY        , event        )            {
      const results            = [];
      if (typeof document !== "undefined" && typeof document.elementsFromPoint === "function") {
        try {
          const fromPoint = document.elementsFromPoint(clientX, clientY);
          for (const el of fromPoint) {
            if (el instanceof Element) {
              results.push(el);
            }
          }
        } catch {
          // Fallback to composedPath below
        }
      }
      if (event && typeof event.composedPath === "function") {
        for (const node of event.composedPath()) {
          if (node instanceof Element && !results.includes(node)) {
            results.push(node);
          }
        }
      }
      if (event && event.target instanceof Element && !results.includes(event.target)) {
        results.unshift(event.target);
      }
      return results;
    }
  
            updateCandidatesFromPoint(clientX        , clientY        , event        )       {
      const excluded = this.callbacks.getExcludedSelectors();
      const pointElements = this.collectPointElements(clientX, clientY, event);
      const primary = pointElements.find((el) => isSelectableElement(el, excluded)) || null;
  
      if (!primary) {
        this.leafElement = null;
        this.candidateStack = [];
        this.activeCandidateIndex = 0;
        return;
      }
  
      // Preserve depth selection if user is hovering inside the exact same primary leaf element
      if (this.leafElement === primary && this.candidateStack.length > 0) {
        return;
      }
  
      this.leafElement = primary;
      this.candidateStack = resolveCandidateStack(primary, pointElements, excluded, 10);
      this.activeCandidateIndex = 0;
    }
  
            handleMouseMove(event            )       {
      if (!this.active) return;
  
      this.lastPointerX = event.clientX;
      this.lastPointerY = event.clientY;
  
      if (this.anchored) {
        return;
      }
  
      if (this.isInternalUiEvent(event)) {
        if (this.overlayEl) this.overlayEl.style.display = "none";
        if (this.leafOutlineEl) this.leafOutlineEl.style.display = "none";
        if (this.pinMarkerEl) this.pinMarkerEl.style.display = "none";
        return;
      }
  
      if (this.pinMarkerEl) {
        this.pinMarkerEl.style.display = "inline-flex";
        this.pinMarkerEl.style.left = `${event.clientX}px`;
        this.pinMarkerEl.style.top = `${event.clientY}px`;
      }
  
      this.updateCandidatesFromPoint(event.clientX, event.clientY, event);
      this.updateOverlayPosition();
      this.notifyStateChange();
    }
  
            updateOverlayPosition()       {
      if (!this.overlayEl || !this.labelEl) return;
  
      const currentCandidate = this.getActiveCandidate();
      if (!currentCandidate) {
        this.overlayEl.style.display = "none";
        if (this.leafOutlineEl) this.leafOutlineEl.style.display = "none";
        return;
      }
  
      const rect = currentCandidate.element.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) {
        this.overlayEl.style.display = "none";
        return;
      }
  
      this.overlayEl.style.display = "block";
      this.overlayEl.style.left = `${rect.left}px`;
      this.overlayEl.style.top = `${rect.top}px`;
      this.overlayEl.style.width = `${rect.width}px`;
      this.overlayEl.style.height = `${rect.height}px`;
  
      // Position the HUD pill inside the top of the box if the element is near the top of the viewport
      if (rect.top < 36) {
        this.labelEl.style.top = "6px";
        this.labelEl.style.left = "6px";
      } else {
        this.labelEl.style.top = "-30px";
        this.labelEl.style.left = "-2px";
      }
  
      const total = this.candidateStack.length;
      const pos = this.activeCandidateIndex + 1;
      const dims = `${Math.round(rect.width)}×${Math.round(rect.height)}`;
      const depthBadge = total > 1 ? ` · ${pos}/${total} layers (↕ scroll)` : "";
      this.labelEl.textContent = `${currentCandidate.tagName}${currentCandidate.selector.startsWith(currentCandidate.tagName) ? currentCandidate.selector.slice(currentCandidate.tagName.length) : ` ${currentCandidate.selector}`} · ${dims}${depthBadge}`;
  
      // Show ghost leaf outline when inspecting an ancestor or overlapping layer
      if (this.leafOutlineEl) {
        if (this.activeCandidateIndex > 0 && this.leafElement && this.leafElement !== currentCandidate.element) {
          const leafRect = this.leafElement.getBoundingClientRect();
          this.leafOutlineEl.style.display = "block";
          this.leafOutlineEl.style.left = `${leafRect.left}px`;
          this.leafOutlineEl.style.top = `${leafRect.top}px`;
          this.leafOutlineEl.style.width = `${leafRect.width}px`;
          this.leafOutlineEl.style.height = `${leafRect.height}px`;
        } else {
          this.leafOutlineEl.style.display = "none";
        }
      }
    }
  
            handleWheelCapture(event            )       {
      if (!this.active) return;
  
      // Allow natural scrolling inside the layer popover or widget itself
      if (this.isInternalUiEvent(event)) {
        return;
      }
  
      if (this.candidateStack.length <= 1) {
        return;
      }
  
      event.preventDefault();
      event.stopPropagation();
  
      this.wheelAccumulator += event.deltaY;
      if (Math.abs(this.wheelAccumulator) >= 24) {
        const step = this.wheelAccumulator > 0 ? 1 : -1;
        this.wheelAccumulator = 0;
        this.cycleDepth(step);
      }
    }
  
            handlePointerSuppression(event       )       {
      if (!this.active) return;
      if (this.isInternalUiEvent(event)) {
        return;
      }
  
      // Intercept host page pointer events in capture phase so links/buttons do not fire
      event.preventDefault();
      event.stopPropagation();
      if (typeof event.stopImmediatePropagation === "function") {
        event.stopImmediatePropagation();
      }
    }
  
            handleClickCapture(event            )       {
      if (!this.active) return;
      if (this.isInternalUiEvent(event)) {
        return;
      }
  
      event.preventDefault();
      event.stopPropagation();
      if (typeof event.stopImmediatePropagation === "function") {
        event.stopImmediatePropagation();
      }
  
      // If popover was already anchored and user clicked elsewhere on the page, re-evaluate at the new click point
      this.anchorX = event.clientX;
      this.anchorY = event.clientY;
      this.updateCandidatesFromPoint(event.clientX, event.clientY, event);
  
      const activeCandidate = this.getActiveCandidate();
      if (!activeCandidate) return;
  
      // Fast-path: Shift+Click or single-layer target pins immediately
      if (event.shiftKey || this.candidateStack.length === 1) {
        this.selectElementDirectly(activeCandidate.element);
        return;
      }
  
      // Otherwise anchor the floating pin and open the Layer & Hierarchy Disambiguation Popover
      this.anchored = true;
      if (this.pinMarkerEl) {
        this.pinMarkerEl.style.display = "inline-flex";
        this.pinMarkerEl.style.left = `${this.anchorX}px`;
        this.pinMarkerEl.style.top = `${this.anchorY}px`;
        this.pinMarkerEl.style.transform = "scale(1.08)";
      }
      this.updateOverlayPosition();
      this.renderLayerPopover();
      this.notifyStateChange();
    }
  
           closeLayerPopover()       {
      this.anchored = false;
      if (this.popoverEl) {
        this.popoverEl.style.display = "none";
        this.popoverEl.innerHTML = "";
      }
      if (this.pinMarkerEl) {
        this.pinMarkerEl.style.transform = "scale(1)";
        this.pinMarkerEl.style.left = `${this.lastPointerX}px`;
        this.pinMarkerEl.style.top = `${this.lastPointerY}px`;
      }
      this.notifyStateChange();
    }
  
            renderLayerPopover()       {
      if (!this.popoverEl || typeof window === "undefined") return;
      const activeCandidate = this.getActiveCandidate();
      if (!activeCandidate) return;
  
      this.popoverEl.innerHTML = "";
      this.popoverEl.style.display = "block";
  
      // Header: title + Pin Current CTA + close popover
      const header = document.createElement("div");
      header.style.cssText = [
        "display: flex",
        "align-items: center",
        "justify-content: space-between",
        "gap: 8px",
        "padding: 10px 12px",
        "background: #f1efea",
        "border-bottom: 1px solid #d6d3cd"
      ].join(";");
  
      const titleGroup = document.createElement("div");
      titleGroup.style.cssText = "display: flex; align-items: center; gap: 6px; font-weight: 600; font-size: 12px; color: #111318;";
      const layersIconSpan = document.createElement("span");
      layersIconSpan.style.cssText = "display: inline-flex; color: #c2410c;";
      layersIconSpan.innerHTML = ICON_LAYERS;
      const titleText = document.createElement("span");
      titleText.textContent = `Choose Element Layer (${this.candidateStack.length})`;
      titleGroup.appendChild(layersIconSpan);
      titleGroup.appendChild(titleText);
  
      const headerActions = document.createElement("div");
      headerActions.style.cssText = "display: flex; align-items: center; gap: 4px;";
  
      const stepUpBtn = document.createElement("button");
      stepUpBtn.type = "button";
      stepUpBtn.title = "Step to parent/outer layer (Up arrow)";
      stepUpBtn.setAttribute("aria-label", "Step to outer layer");
      stepUpBtn.style.cssText = [
        "display: inline-flex",
        "align-items: center",
        "justify-content: center",
        "width: 24px",
        "height: 24px",
        "border-radius: 6px",
        "border: 1px solid #d6d3cd",
        "background: #faf9f6",
        "color: #111318",
        "cursor: pointer"
      ].join(";");
      stepUpBtn.innerHTML = ICON_CHEVRON_UP;
      stepUpBtn.disabled = this.activeCandidateIndex >= this.candidateStack.length - 1;
      stepUpBtn.addEventListener("click", (ev) => {
        ev.stopPropagation();
        this.cycleDepth(1);
      });
  
      const stepDownBtn = document.createElement("button");
      stepDownBtn.type = "button";
      stepDownBtn.title = "Step to inner/child layer (Down arrow)";
      stepDownBtn.setAttribute("aria-label", "Step to inner layer");
      stepDownBtn.style.cssText = stepUpBtn.style.cssText;
      stepDownBtn.innerHTML = ICON_CHEVRON_DOWN;
      stepDownBtn.disabled = this.activeCandidateIndex <= 0;
      stepDownBtn.addEventListener("click", (ev) => {
        ev.stopPropagation();
        this.cycleDepth(-1);
      });
  
      const closeBtn = document.createElement("button");
      closeBtn.type = "button";
      closeBtn.title = "Resume hover selection (Esc)";
      closeBtn.setAttribute("aria-label", "Close layer picker");
      closeBtn.style.cssText = [
        "display: inline-flex",
        "align-items: center",
        "justify-content: center",
        "width: 24px",
        "height: 24px",
        "border-radius: 6px",
        "border: 0",
        "background: transparent",
        "color: #4b5262",
        "cursor: pointer"
      ].join(";");
      closeBtn.innerHTML = ICON_CLOSE;
      closeBtn.addEventListener("click", (ev) => {
        ev.stopPropagation();
        this.closeLayerPopover();
      });
  
      headerActions.appendChild(stepDownBtn);
      headerActions.appendChild(stepUpBtn);
      headerActions.appendChild(closeBtn);
      header.appendChild(titleGroup);
      header.appendChild(headerActions);
      this.popoverEl.appendChild(header);
  
      // Interactive DOM Breadcrumb Bar
      const ancestors = resolveAncestorChain(
        activeCandidate.element,
        this.callbacks.getExcludedSelectors(),
        6
      );
      if (ancestors.length > 0) {
        const breadcrumbBar = document.createElement("div");
        breadcrumbBar.setAttribute("data-context-drop-ui", "breadcrumb-bar");
        breadcrumbBar.style.cssText = [
          "display: flex",
          "align-items: center",
          "flex-wrap: wrap",
          "gap: 3px",
          "padding: 7px 12px",
          "background: #f5f3ee",
          "border-bottom: 1px solid #e4e1da",
          "font-family: ui-monospace, SFMono-Regular, Menlo, monospace",
          "font-size: 11px"
        ].join(";");
  
        ancestors.forEach((ancEl, idx) => {
          if (idx > 0) {
            const sep = document.createElement("span");
            sep.style.cssText = "display: inline-flex; color: #687082;";
            sep.innerHTML = ICON_CHEVRON_RIGHT;
            breadcrumbBar.appendChild(sep);
          }
  
          const isCurrent = ancEl === activeCandidate.element;
          const crumbBtn = document.createElement("button");
          crumbBtn.type = "button";
          crumbBtn.textContent = computeSelector(ancEl);
          crumbBtn.style.cssText = [
            "appearance: none",
            "border: 1px solid " + (isCurrent ? "#1d4ed8" : "transparent"),
            "background: " + (isCurrent ? "#dbeafe" : "transparent"),
            "color: " + (isCurrent ? "#1e3a8a" : "#4b5262"),
            "font-family: inherit",
            "font-size: 11px",
            "font-weight: " + (isCurrent ? "600" : "500"),
            "padding: 2px 5px",
            "border-radius: 4px",
            "cursor: pointer",
            "max-width: 130px",
            "overflow: hidden",
            "text-overflow: ellipsis",
            "white-space: nowrap"
          ].join(";");
  
          crumbBtn.addEventListener("mouseenter", () => {
            this.focusCandidateElement(ancEl);
          });
          crumbBtn.addEventListener("click", (ev) => {
            ev.stopPropagation();
            this.selectElementDirectly(ancEl);
          });
  
          breadcrumbBar.appendChild(crumbBtn);
        });
  
        this.popoverEl.appendChild(breadcrumbBar);
      }
  
      // Layer Stack List (Target, Overlapping siblings, Direct children, Ancestor containers)
      const list = document.createElement("div");
      list.style.cssText = [
        "max-height: 230px",
        "overflow-y: auto",
        "padding: 6px",
        "display: flex",
        "flex-direction: column",
        "gap: 3px"
      ].join(";");
  
      const relationLabels                         = {
        target: "Topmost",
        overlap: "Overlap",
        child: "Child",
        ancestor: "Parent"
      };
  
      this.candidateStack.forEach((candidate, idx) => {
        const isSelected = idx === this.activeCandidateIndex;
        const row = document.createElement("button");
        row.type = "button";
        row.setAttribute("data-context-drop-layer-index", String(idx));
        row.style.cssText = [
          "appearance: none",
          "width: 100%",
          "text-align: left",
          "display: flex",
          "flex-direction: column",
          "gap: 3px",
          "padding: 7px 9px",
          "border-radius: 8px",
          "border: 1px solid " + (isSelected ? "#1d4ed8" : "transparent"),
          "background: " + (isSelected ? "#eff6ff" : "transparent"),
          "color: #111318",
          "cursor: pointer",
          "transition: background-color 0.1s ease"
        ].join(";");
  
        const topLine = document.createElement("div");
        topLine.style.cssText = "display: flex; align-items: center; justify-content: space-between; gap: 6px; width: 100%;";
  
        const leftGroup = document.createElement("div");
        leftGroup.style.cssText = "display: flex; align-items: center; gap: 6px; min-width: 0; flex: 1;";
  
        const relBadge = document.createElement("span");
        relBadge.textContent = relationLabels[candidate.relation] || "Layer";
        relBadge.style.cssText = [
          "font-size: 10px",
          "font-weight: 600",
          "padding: 1px 5px",
          "border-radius: 4px",
          "background: " + (candidate.relation === "target" ? "#ffedd5" : candidate.relation === "overlap" ? "#fce7f3" : "#e2e8f0"),
          "color: " + (candidate.relation === "target" ? "#9a3412" : candidate.relation === "overlap" ? "#9d174d" : "#334155"),
          "flex-shrink: 0"
        ].join(";");
  
        const selectorSpan = document.createElement("span");
        selectorSpan.textContent = `${candidate.tagName}${candidate.selector.startsWith(candidate.tagName) ? candidate.selector.slice(candidate.tagName.length) : candidate.selector}`;
        selectorSpan.style.cssText = [
          "font-family: ui-monospace, SFMono-Regular, Menlo, monospace",
          "font-size: 11.5px",
          "font-weight: 600",
          "color: #111318",
          "overflow: hidden",
          "text-overflow: ellipsis",
          "white-space: nowrap"
        ].join(";");
  
        leftGroup.appendChild(relBadge);
        leftGroup.appendChild(selectorSpan);
  
        const dimsSpan = document.createElement("span");
        dimsSpan.textContent = `${Math.round(candidate.rect.width)}×${Math.round(candidate.rect.height)}`;
        dimsSpan.style.cssText = [
          "font-family: ui-monospace, SFMono-Regular, Menlo, monospace",
          "font-size: 10.5px",
          "font-variant-numeric: tabular-nums",
          "color: #4b5262",
          "flex-shrink: 0"
        ].join(";");
  
        topLine.appendChild(leftGroup);
        topLine.appendChild(dimsSpan);
        row.appendChild(topLine);
  
        if (candidate.textPreview) {
          const previewLine = document.createElement("div");
          previewLine.textContent = `"${candidate.textPreview}"`;
          previewLine.style.cssText = [
            "font-size: 11px",
            "color: #4b5262",
            "overflow: hidden",
            "text-overflow: ellipsis",
            "white-space: nowrap",
            "padding-left: 2px"
          ].join(";");
          row.appendChild(previewLine);
        }
  
        row.addEventListener("mouseenter", () => {
          if (this.activeCandidateIndex !== idx) {
            this.activeCandidateIndex = idx;
            this.updateOverlayPosition();
            this.notifyStateChange();
          }
        });
  
        row.addEventListener("click", (ev) => {
          ev.stopPropagation();
          this.selectElementDirectly(candidate.element);
        });
  
        list.appendChild(row);
      });
  
      this.popoverEl.appendChild(list);
  
      // Footer with primary Pin confirmation action
      const footer = document.createElement("div");
      footer.style.cssText = [
        "display: flex",
        "align-items: center",
        "justify-content: space-between",
        "padding: 8px 12px",
        "background: #f1efea",
        "border-top: 1px solid #d6d3cd"
      ].join(";");
  
      const hint = document.createElement("span");
      hint.textContent = "Click any layer or press Enter";
      hint.style.cssText = "font-size: 11px; color: #4b5262;";
  
      const pinNowBtn = document.createElement("button");
      pinNowBtn.type = "button";
      pinNowBtn.setAttribute("data-context-drop-ui", "confirm-pin-btn");
      pinNowBtn.style.cssText = [
        "display: inline-flex",
        "align-items: center",
        "gap: 5px",
        "padding: 5px 10px",
        "border-radius: 6px",
        "border: 0",
        "background: #c2410c",
        "color: #faf9f6",
        "font-size: 11.5px",
        "font-weight: 600",
        "cursor: pointer"
      ].join(";");
      pinNowBtn.innerHTML = `${ICON_CHECK}<span>Pin Selected</span>`;
      pinNowBtn.addEventListener("click", (ev) => {
        ev.stopPropagation();
        const target = this.getActiveCandidate();
        if (target) {
          this.selectElementDirectly(target.element);
        }
      });
  
      footer.appendChild(hint);
      footer.appendChild(pinNowBtn);
      this.popoverEl.appendChild(footer);
  
      // Clamp popover inside viewport bounds near anchorX, anchorY
      const vw = window.innerWidth || 1024;
      const vh = window.innerHeight || 768;
      const popWidth = 348;
      const popHeight = 310;
      const left = Math.max(12, Math.min(this.anchorX + 14, vw - popWidth - 12));
      const top =
        this.anchorY + popHeight + 20 > vh
          ? Math.max(12, this.anchorY - popHeight - 12)
          : Math.max(12, this.anchorY + 14);
  
      this.popoverEl.style.left = `${left}px`;
      this.popoverEl.style.top = `${top}px`;
    }
  
            handleKeyDown(event               )       {
      if (!this.active) return;
  
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        if (this.anchored) {
          this.closeLayerPopover();
        } else {
          this.stop();
        }
        return;
      }
  
      if (event.key === "ArrowUp" || event.key === "[") {
        event.preventDefault();
        event.stopPropagation();
        this.cycleDepth(1);
        return;
      }
  
      if (event.key === "ArrowDown" || event.key === "]") {
        event.preventDefault();
        event.stopPropagation();
        this.cycleDepth(-1);
        return;
      }
  
      if (event.key === "Enter") {
        const candidate = this.getActiveCandidate();
        if (candidate) {
          event.preventDefault();
          event.stopPropagation();
          this.selectElementDirectly(candidate.element);
        }
      }
    }
  }

  // --- Module: widget.ts ---
  const DEFAULT_CONFIG               = {
    enabled: true,
    position: "top_left",
    placeholder: "Describe the issue or drop context from the page...",
    features: {
      element_selection: true,
      screenshot_capture: true,
      element_capture_padding: 16
    },
    limits: {
      max_attachments: 10,
      max_element_references: 10,
      max_attachment_size: 10 * 1024 * 1024,
      allowed_content_types: ["image/png", "image/jpeg", "image/webp", "image/gif"],
      max_image_dimensions: [4096, 4096]
    },
    privacy: {
      excluded_selectors: Array.from(MANDATORY_EXCLUDED_SELECTORS)
    }
  };
  
  const BaseHTMLElement                     =
    typeof HTMLElement !== "undefined"
      ? HTMLElement
      : (class {}                                 );
  class ContextDropWidgetElement extends BaseHTMLElement {
           shadow                    = null;
            config               = structuredClone(DEFAULT_CONFIG);
            customMetadata                          = {};
            apiClient                       = new ContextDropApiClient("/context_drop");
            picker                       = null;
  
            isOpen          = false;
            isMinimized          = false;
            isSubmitting          = false;
            freePos                                       = null;
  
            elementReferences                             = [];
            elementDomNodes                       = new Map();
            attachments                          = [];
            sessionHistory                         = [];
  
            rootContainer                        = null;
            composerEl                        = null;
            compactBarEl                        = null;
            compactBreadcrumbEl                        = null;
            compactPinBtn                           = null;
            pinDockEl                        = null;
            floatingPinBtn                           = null;
            triggerBtn                           = null;
            cornerPinBtn                           = null;
            chatThreadEl                        = null;
            textareaEl                             = null;
            trayEl                        = null;
            statusEl                        = null;
            fileInputEl                          = null;
            submitBtn                           = null;
  
           connectedCallback()       {
      if (!this.shadow) {
        this.shadow = this.attachShadow({ mode: "open" });
      }
      this.readDataAttributes();
      this.renderShadowDom();
  
      this.picker = new ElementPicker({
        onSelect: (snapshot, el) => {
          const added = this.addElementReference(snapshot, el);
          if (added) {
            this.showStatus(`Pinned ${snapshot.selector}`, "success");
          }
          this.syncUiStates();
        },
        onExit: () => {
          this.isMinimized = false;
          this.openComposer();
          this.syncUiStates();
        },
        canSelectMore: () => this.elementReferences.length < this.config.limits.max_element_references,
        getExcludedSelectors: () => this.config.privacy.excluded_selectors,
        onStateChange: (state) => {
          this.renderCompactBreadcrumbs(state.activeCandidate, state.ancestors);
          this.syncPinActiveIndicators(state.active);
        }
      });
    }
  
           disconnectedCallback()       {
      if (this.picker && this.picker.isActive()) {
        this.picker.stop();
      }
      this.picker?.hideExternalPreview();
    }
  
           getConfig()               {
      return this.config;
    }
  
           getElementReferences()                             {
      return [...this.elementReferences];
    }
  
           getAttachments()                          {
      return [...this.attachments];
    }
  
           getSessionHistory()                         {
      return [...this.sessionHistory];
    }
  
           openComposer()       {
      this.isOpen = true;
      this.isMinimized = false;
      this.syncUiStates();
      if (this.textareaEl) {
        this.textareaEl.focus();
      }
    }
  
           closeComposer()       {
      this.isOpen = false;
      this.isMinimized = false;
      if (this.picker && this.picker.isActive()) {
        this.picker.stop();
      }
      this.picker?.hideExternalPreview();
      this.syncUiStates();
    }
  
           toggleComposer()       {
      if (this.isOpen && !this.isMinimized) {
        this.closeComposer();
      } else {
        this.openComposer();
      }
    }
  
           minimizeToCompactBar()       {
      this.isOpen = true;
      this.isMinimized = true;
      this.syncUiStates();
    }
  
           expandFromCompactBar()       {
      if (this.picker && this.picker.isActive()) {
        this.picker.stop();
      }
      this.isMinimized = false;
      this.openComposer();
    }
  
           startPinSelection()       {
      if (!this.config.features.element_selection || !this.picker) return;
      if (this.elementReferences.length >= this.config.limits.max_element_references) {
        this.openComposer();
        this.showStatus(
          `Maximum of ${this.config.limits.max_element_references} pinned elements reached.`,
          "error"
        );
        return;
      }
      this.minimizeToCompactBar();
      this.picker.start();
      this.syncUiStates();
    }
  
           togglePinSelection()       {
      if (this.picker && this.picker.isActive()) {
        this.picker.stop();
      } else {
        this.startPinSelection();
      }
    }
  
           setFreePosition(left        , top        )       {
      if (!this.rootContainer) return;
      const vw = typeof window !== "undefined" ? window.innerWidth || 1024 : 1024;
      const vh = typeof window !== "undefined" ? window.innerHeight || 768 : 768;
      const clampedLeft = Math.max(8, Math.min(left, vw - 72));
      const clampedTop = Math.max(8, Math.min(top, vh - 48));
  
      this.freePos = { left: clampedLeft, top: clampedTop };
      this.rootContainer.classList.add("is-free-positioned");
      this.rootContainer.style.left = `${clampedLeft}px`;
      this.rootContainer.style.top = `${clampedTop}px`;
    }
  
           addElementReference(snapshot                          , elementNode          )          {
      if (this.elementReferences.length >= this.config.limits.max_element_references) {
        this.showStatus(
          `Maximum of ${this.config.limits.max_element_references} DOM elements reached.`,
          "error"
        );
        return false;
      }
      this.elementReferences.push(snapshot);
      if (elementNode) {
        this.elementDomNodes.set(snapshot.client_ref, elementNode);
      }
      this.renderTray();
      this.syncUiStates();
      return true;
    }
  
           removeElementReference(clientRef        )       {
      this.elementReferences = this.elementReferences.filter((el) => el.client_ref !== clientRef);
      this.elementDomNodes.delete(clientRef);
      this.picker?.hideExternalPreview();
      this.renderTray();
      this.syncUiStates();
    }
  
           removeAttachment(attachmentId        )       {
      this.attachments = this.attachments.filter((att) => att.id !== attachmentId);
      this.renderTray();
      this.syncUiStates();
    }
  
            readDataAttributes()       {
      const endpoint = this.getAttribute("data-endpoint") || "/context_drop";
      this.apiClient = new ContextDropApiClient(endpoint);
  
      const rawConfig = this.getAttribute("data-config");
      if (rawConfig) {
        try {
          const parsed = JSON.parse(rawConfig)                         ;
          this.config = {
            ...this.config,
            ...parsed,
            features: { ...this.config.features, ...(parsed.features || {}) },
            limits: { ...this.config.limits, ...(parsed.limits || {}) },
            privacy: { ...this.config.privacy, ...(parsed.privacy || {}) }
          };
          if (parsed.csrf_token) {
            this.apiClient.setCsrfToken(parsed.csrf_token);
          }
        } catch {
          // Ignore malformed JSON attribute
        }
      }
  
      const posOverride = this.getAttribute("data-position")                         ;
      if (
        posOverride &&
        ["bottom_right", "bottom_left", "top_right", "top_left"].includes(posOverride)
      ) {
        this.config.position = posOverride;
      }
  
      const placeholderOverride = this.getAttribute("data-placeholder");
      if (placeholderOverride) {
        this.config.placeholder = placeholderOverride;
      }
  
      const rawMetadata = this.getAttribute("data-metadata");
      if (rawMetadata) {
        try {
          this.customMetadata = JSON.parse(rawMetadata)                           ;
        } catch {
          this.customMetadata = {};
        }
      }
    }
  
            attachDragHandle(handleEl             , onClickFallback             )       {
      let startX = 0;
      let startY = 0;
      let initialLeft = 0;
      let initialTop = 0;
      let dragging = false;
      let moved = false;
      let suppressNextClick = false;
      let suppressClickTimer                                       = null;
  
      const clearSuppressClick = ()       => {
        suppressNextClick = false;
        if (suppressClickTimer !== null) {
          clearTimeout(suppressClickTimer);
          suppressClickTimer = null;
        }
      };
  
      if (onClickFallback) {
        handleEl.addEventListener("click", (ev            ) => {
          if (suppressNextClick) {
            clearSuppressClick();
            ev.preventDefault();
            ev.stopPropagation();
            return;
          }
          onClickFallback();
        });
      }
  
      const onPointerMove = (ev              )       => {
        if (!dragging) return;
        const dx = ev.clientX - startX;
        const dy = ev.clientY - startY;
        if (!moved && Math.hypot(dx, dy) > 5) {
          moved = true;
          this.pinDockEl?.classList.add("is-dragging");
        }
        if (moved) {
          this.setFreePosition(initialLeft + dx, initialTop + dy);
        }
      };
  
      const cleanupDrag = ()       => {
        dragging = false;
        this.pinDockEl?.classList.remove("is-dragging");
        window.removeEventListener("pointermove", onPointerMove);
        window.removeEventListener("pointerup", onPointerUp);
        window.removeEventListener("pointercancel", onPointerCancel);
      };
  
      const onPointerUp = ()       => {
        if (!dragging) return;
        cleanupDrag();
        if (moved && onClickFallback) {
          suppressNextClick = true;
          if (suppressClickTimer !== null) {
            clearTimeout(suppressClickTimer);
          }
          suppressClickTimer = setTimeout(() => {
            suppressNextClick = false;
            suppressClickTimer = null;
          }, 0);
        }
      };
  
      const onPointerCancel = ()       => {
        if (!dragging) return;
        cleanupDrag();
        clearSuppressClick();
      };
  
      handleEl.addEventListener("pointerdown", (ev              ) => {
        // Only primary mouse button or touch
        if (ev.button !== 0) return;
        const targetEl =
          ev.target && typeof (ev.target           ).closest === "function"
            ? (ev.target           )
            : null;
        const closestBtn = targetEl?.closest("button");
        if (closestBtn && closestBtn !== handleEl && handleEl.contains(closestBtn)) {
          return;
        }
  
        if (!this.rootContainer || typeof window === "undefined") return;
        const rect = this.rootContainer.getBoundingClientRect();
        startX = ev.clientX;
        startY = ev.clientY;
        initialLeft = this.freePos ? this.freePos.left : rect.left;
        initialTop = this.freePos ? this.freePos.top : rect.top;
        dragging = true;
        moved = false;
        clearSuppressClick();
  
        window.addEventListener("pointermove", onPointerMove);
        window.addEventListener("pointerup", onPointerUp);
        window.addEventListener("pointercancel", onPointerCancel);
      });
    }
  
            renderShadowDom()       {
      if (!this.shadow) return;
      this.shadow.innerHTML = "";
  
      const styleEl = document.createElement("style");
      styleEl.textContent = WIDGET_SHADOW_STYLES;
      this.shadow.appendChild(styleEl);
  
      const root = document.createElement("div");
      root.className = `cd-root pos-${this.config.position}`;
      this.rootContainer = root;
  
      // 1. Compact Minimized Pinning Bar (visible while pinning elements on the page or minimized)
      const compactBar = document.createElement("div");
      compactBar.className = "cd-compact-bar";
      compactBar.setAttribute("role", "region");
      compactBar.setAttribute("aria-label", "ContextDrop Pinning Bar");
      compactBar.hidden = true;
      this.compactBarEl = compactBar;
  
      const compactGrip = document.createElement("span");
      compactGrip.className = "cd-pin-dock-grip";
      compactGrip.title = "Drag to move pinning bar";
      compactGrip.innerHTML = ICON_GRIP;
      this.attachDragHandle(compactBar);
      compactBar.appendChild(compactGrip);
  
      const compactPinBtn = document.createElement("button");
      compactPinBtn.type = "button";
      compactPinBtn.className = "cd-pin-corner-btn is-active";
      compactPinBtn.setAttribute("aria-label", "Toggle element pin mode");
      compactPinBtn.innerHTML = `${ICON_PIN}<span>Pinning</span>`;
      compactPinBtn.addEventListener("click", () => this.togglePinSelection());
      this.compactPinBtn = compactPinBtn;
      compactBar.appendChild(compactPinBtn);
  
      const compactStatus = document.createElement("div");
      compactStatus.className = "cd-compact-status";
      const breadcrumbScroll = document.createElement("div");
      breadcrumbScroll.className = "cd-breadcrumb-scroll";
      this.compactBreadcrumbEl = breadcrumbScroll;
      compactStatus.appendChild(breadcrumbScroll);
      compactBar.appendChild(compactStatus);
  
      const compactLayerUp = document.createElement("button");
      compactLayerUp.type = "button";
      compactLayerUp.className = "cd-icon-btn";
      compactLayerUp.title = "Step to outer/parent element (Up arrow)";
      compactLayerUp.setAttribute("aria-label", "Step to parent element");
      compactLayerUp.innerHTML = ICON_CHEVRON_UP;
      compactLayerUp.addEventListener("click", () => this.picker?.cycleDepth(1));
      compactBar.appendChild(compactLayerUp);
  
      const compactLayerDown = document.createElement("button");
      compactLayerDown.type = "button";
      compactLayerDown.className = "cd-icon-btn";
      compactLayerDown.title = "Step to inner/child element (Down arrow)";
      compactLayerDown.setAttribute("aria-label", "Step to child element");
      compactLayerDown.innerHTML = ICON_CHEVRON_DOWN;
      compactLayerDown.addEventListener("click", () => this.picker?.cycleDepth(-1));
      compactBar.appendChild(compactLayerDown);
  
      const expandBtn = document.createElement("button");
      expandBtn.type = "button";
      expandBtn.className = "cd-btn cd-btn-primary";
      expandBtn.setAttribute("aria-label", "Return to chatbox");
      expandBtn.innerHTML = `${ICON_EXPAND}<span>Chat</span>`;
      expandBtn.addEventListener("click", () => this.expandFromCompactBar());
      compactBar.appendChild(expandBtn);
  
      // 2. Main Floating Chatbox Composer Window
      const composer = document.createElement("div");
      composer.className = "cd-composer";
      composer.setAttribute("role", "dialog");
      composer.setAttribute("aria-label", "ContextDrop Feedback Chatbox");
      composer.hidden = !this.isOpen;
      this.composerEl = composer;
  
      // Drag-and-drop image support on the chatbox
      composer.addEventListener("dragover", (ev) => {
        ev.preventDefault();
        composer.classList.add("is-dragging-over");
      });
      composer.addEventListener("dragleave", () => {
        composer.classList.remove("is-dragging-over");
      });
      composer.addEventListener("drop", (ev) => {
        ev.preventDefault();
        composer.classList.remove("is-dragging-over");
        const files = ev.dataTransfer?.files;
        if (files && files.length > 0) {
          void this.handleFilesSelected(Array.from(files));
        }
      });
  
      // Header with Top-Left Pin-Shaped Selector & Drag Handle
      const header = document.createElement("div");
      header.className = "cd-composer-header";
      this.attachDragHandle(header);
  
      const headerLeft = document.createElement("div");
      headerLeft.className = "cd-header-left";
  
      if (this.config.features.element_selection) {
        const cornerPinBtn = document.createElement("button");
        cornerPinBtn.type = "button";
        cornerPinBtn.className = "cd-pin-corner-btn";
        cornerPinBtn.title = "Pin any HTML element on the page as context";
        cornerPinBtn.setAttribute("aria-label", "Select DOM element on page");
        cornerPinBtn.innerHTML = `${ICON_PIN}<span>Pin Element</span>`;
        cornerPinBtn.addEventListener("click", () => this.startPinSelection());
        this.cornerPinBtn = cornerPinBtn;
        headerLeft.appendChild(cornerPinBtn);
      }
  
      const title = document.createElement("h2");
      title.className = "cd-composer-title";
      title.textContent = "ContextDrop";
      headerLeft.appendChild(title);
  
      const headerActions = document.createElement("div");
      headerActions.className = "cd-header-actions";
  
      const minBtn = document.createElement("button");
      minBtn.type = "button";
      minBtn.className = "cd-icon-btn";
      minBtn.title = "Minimize to compact bar";
      minBtn.setAttribute("aria-label", "Minimize chatbox to compact bar");
      minBtn.innerHTML = ICON_MINIMIZE;
      minBtn.addEventListener("click", () => this.minimizeToCompactBar());
  
      const closeBtn = document.createElement("button");
      closeBtn.type = "button";
      closeBtn.className = "cd-icon-btn";
      closeBtn.title = "Close chatbox (Esc)";
      closeBtn.setAttribute("aria-label", "Close feedback composer");
      closeBtn.innerHTML = ICON_CLOSE;
      closeBtn.addEventListener("click", () => this.closeComposer());
  
      headerActions.appendChild(minBtn);
      headerActions.appendChild(closeBtn);
      header.appendChild(headerLeft);
      header.appendChild(headerActions);
      composer.appendChild(header);
  
      // Conversational Chat Thread
      const chatThread = document.createElement("div");
      chatThread.className = "cd-chat-thread";
      chatThread.setAttribute("aria-live", "polite");
      this.chatThreadEl = chatThread;
      composer.appendChild(chatThread);
      this.renderChatThread();
  
      // Pinned Elements & Attachments Chip Tray
      const tray = document.createElement("div");
      tray.className = "cd-tray";
      tray.setAttribute("aria-label", "Attached context items");
      this.trayEl = tray;
      composer.appendChild(tray);
  
      // Status message bar
      const status = document.createElement("div");
      status.className = "cd-status";
      status.setAttribute("role", "status");
      status.hidden = true;
      this.statusEl = status;
      composer.appendChild(status);
  
      // Hidden file input
      const fileInput = document.createElement("input");
      fileInput.type = "file";
      fileInput.multiple = true;
      fileInput.accept = this.config.limits.allowed_content_types.join(",");
      fileInput.hidden = true;
      fileInput.addEventListener("change", () => {
        if (fileInput.files) {
          void this.handleFilesSelected(Array.from(fileInput.files));
          fileInput.value = "";
        }
      });
      this.fileInputEl = fileInput;
      composer.appendChild(fileInput);
  
      // Chatbox Prompt Input Shell
      const promptShell = document.createElement("div");
      promptShell.className = "cd-prompt-shell";
  
      const textarea = document.createElement("textarea");
      textarea.className = "cd-textarea";
      textarea.placeholder = this.config.placeholder;
      textarea.setAttribute("aria-label", "Feedback description");
      textarea.addEventListener("keydown", (ev) => {
        if ((ev.metaKey || ev.ctrlKey) && ev.key === "Enter") {
          ev.preventDefault();
          void this.handleSubmit();
        } else if (ev.key === "Escape") {
          ev.preventDefault();
          this.closeComposer();
        }
      });
      textarea.addEventListener("paste", (ev) => this.handlePaste(ev));
      this.textareaEl = textarea;
      promptShell.appendChild(textarea);
  
      // Toolbar inside prompt shell
      const toolbar = document.createElement("div");
      toolbar.className = "cd-toolbar";
  
      const actions = document.createElement("div");
      actions.className = "cd-toolbar-actions";
  
      if (this.config.features.element_selection) {
        const pickBtn = document.createElement("button");
        pickBtn.type = "button";
        pickBtn.className = "cd-btn";
        pickBtn.setAttribute("aria-label", "Pin HTML element as context");
        pickBtn.innerHTML = `${ICON_PIN}<span>Pin</span>`;
        pickBtn.addEventListener("click", () => this.startPinSelection());
        actions.appendChild(pickBtn);
      }
  
      if (this.config.features.screenshot_capture) {
        const screenshotBtn = document.createElement("button");
        screenshotBtn.type = "button";
        screenshotBtn.className = "cd-btn";
        screenshotBtn.setAttribute("aria-label", "Capture viewport screenshot");
        screenshotBtn.innerHTML = `${ICON_CAMERA}<span>Screenshot</span>`;
        screenshotBtn.addEventListener("click", () => {
          void this.handleViewportScreenshot();
        });
        actions.appendChild(screenshotBtn);
      }
  
      const uploadBtn = document.createElement("button");
      uploadBtn.type = "button";
      uploadBtn.className = "cd-btn";
      uploadBtn.setAttribute("aria-label", "Upload image attachment");
      uploadBtn.innerHTML = `${ICON_IMAGE}<span>Image</span>`;
      uploadBtn.addEventListener("click", () => this.fileInputEl?.click());
      actions.appendChild(uploadBtn);
  
      const submitBtn = document.createElement("button");
      submitBtn.type = "button";
      submitBtn.className = "cd-btn cd-btn-primary";
      submitBtn.setAttribute("aria-label", "Submit feedback");
      submitBtn.innerHTML = `${ICON_SEND}<span>Send</span>`;
      submitBtn.addEventListener("click", () => {
        void this.handleSubmit();
      });
      this.submitBtn = submitBtn;
  
      toolbar.appendChild(actions);
      toolbar.appendChild(submitBtn);
      promptShell.appendChild(toolbar);
      composer.appendChild(promptShell);
  
      // 3. Freely Draggable Floating Pin Dock (visible when chatbox is closed, or draggable launcher)
      const pinDock = document.createElement("div");
      pinDock.className = "cd-pin-dock";
      this.pinDockEl = pinDock;
  
      const dockGrip = document.createElement("span");
      dockGrip.className = "cd-pin-dock-grip";
      dockGrip.title = "Drag to float anywhere on screen";
      dockGrip.innerHTML = ICON_GRIP;
      this.attachDragHandle(dockGrip);
      pinDock.appendChild(dockGrip);
  
      if (this.config.features.element_selection) {
        const floatingPinBtn = document.createElement("button");
        floatingPinBtn.type = "button";
        floatingPinBtn.className = "cd-floating-pin-btn";
        floatingPinBtn.title = "Pin an element on the page (or drag to move)";
        floatingPinBtn.setAttribute("aria-label", "Pin element on page");
        floatingPinBtn.innerHTML = `${ICON_PIN}<span>Pin</span>`;
        this.attachDragHandle(floatingPinBtn, () => this.startPinSelection());
        this.floatingPinBtn = floatingPinBtn;
        pinDock.appendChild(floatingPinBtn);
      }
  
      const trigger = document.createElement("button");
      trigger.type = "button";
      trigger.className = "cd-trigger";
      trigger.setAttribute("aria-label", "Open feedback composer");
      trigger.setAttribute("aria-expanded", String(this.isOpen));
      trigger.innerHTML = `${ICON_CHAT}<span>ContextDrop</span>`;
      this.attachDragHandle(trigger, () => this.toggleComposer());
      this.triggerBtn = trigger;
      pinDock.appendChild(trigger);
  
      root.appendChild(compactBar);
      root.appendChild(composer);
      root.appendChild(pinDock);
      this.shadow.appendChild(root);
  
      this.renderCompactBreadcrumbs(null, []);
      this.syncUiStates();
    }
  
            syncPinActiveIndicators(pickerActive         )       {
      if (this.cornerPinBtn) {
        this.cornerPinBtn.classList.toggle("is-active", pickerActive);
        this.cornerPinBtn.setAttribute("aria-pressed", String(pickerActive));
      }
      if (this.floatingPinBtn) {
        this.floatingPinBtn.classList.toggle("is-active", pickerActive);
        this.floatingPinBtn.setAttribute("aria-pressed", String(pickerActive));
      }
      if (this.compactPinBtn) {
        this.compactPinBtn.classList.toggle("is-active", pickerActive);
        this.compactPinBtn.innerHTML = pickerActive
          ? `${ICON_PIN}<span>Pinning</span>`
          : `${ICON_PIN}<span>Pin Element</span>`;
      }
    }
  
            syncUiStates()       {
      const pickerActive = this.picker ? this.picker.isActive() : false;
      const totalContextCount = this.elementReferences.length + this.attachments.length;
  
      if (this.composerEl) {
        this.composerEl.hidden = !this.isOpen || this.isMinimized;
      }
      if (this.compactBarEl) {
        this.compactBarEl.hidden = !(this.isOpen && this.isMinimized);
      }
      if (this.pinDockEl) {
        this.pinDockEl.hidden = this.isOpen;
      }
  
      if (this.triggerBtn) {
        this.triggerBtn.setAttribute("aria-expanded", String(this.isOpen && !this.isMinimized));
        const countBadge =
          totalContextCount > 0 ? `<span class="cd-count-pill">${totalContextCount}</span>` : "";
        this.triggerBtn.innerHTML = `${ICON_CHAT}<span>ContextDrop</span>${countBadge}`;
      }
  
      if (this.cornerPinBtn) {
        const pinCount =
          this.elementReferences.length > 0
            ? `<span class="cd-count-pill">${this.elementReferences.length}</span>`
            : "";
        this.cornerPinBtn.innerHTML = `${ICON_PIN}<span>Pin Element</span>${pinCount}`;
      }
  
      this.syncPinActiveIndicators(pickerActive);
    }
  
            renderCompactBreadcrumbs(
      activeCandidate                             ,
      ancestors           
    )       {
      if (!this.compactBreadcrumbEl) return;
      this.compactBreadcrumbEl.innerHTML = "";
  
      if (!activeCandidate || ancestors.length === 0) {
        const hint = document.createElement("span");
        hint.style.cssText = "font-size: 11.5px; color: #4b5262;";
        hint.textContent =
          this.elementReferences.length > 0
            ? `${this.elementReferences.length} pinned · Hover or click any element (scroll ↕ for layers)`
            : "Hover any element · Scroll ↕ for layers · Click to inspect stack";
        this.compactBreadcrumbEl.appendChild(hint);
        return;
      }
  
      ancestors.forEach((ancEl, idx) => {
        if (idx > 0) {
          const sep = document.createElement("span");
          sep.className = "cd-crumb-sep";
          sep.innerHTML = ICON_CHEVRON_RIGHT;
          this.compactBreadcrumbEl?.appendChild(sep);
        }
  
        const isCurrent = ancEl === activeCandidate.element;
        const crumb = document.createElement("button");
        crumb.type = "button";
        crumb.className = `cd-crumb-btn${isCurrent ? " is-current" : ""}`;
        crumb.textContent = computeSelector(ancEl);
        crumb.title = "Click to pin this element directly";
        crumb.addEventListener("mouseenter", () => {
          this.picker?.focusCandidateElement(ancEl);
        });
        crumb.addEventListener("click", () => {
          this.picker?.selectElementDirectly(ancEl);
        });
        this.compactBreadcrumbEl?.appendChild(crumb);
      });
    }
  
            renderChatThread()       {
      if (!this.chatThreadEl) return;
      this.chatThreadEl.innerHTML = "";
  
      if (this.sessionHistory.length === 0) {
        const emptyBox = document.createElement("div");
        emptyBox.className = "cd-chat-empty";
  
        const p1 = document.createElement("p");
        p1.className = "cd-chat-empty-text";
        p1.textContent = "Drop context directly from this page.";
  
        const p2 = document.createElement("p");
        p2.className = "cd-chat-empty-hint";
        p2.textContent =
          "Use the top-left Pin selector to pick specific HTML elements (scroll or click to disambiguate overlapping layers), attach screenshots, and send your note.";
  
        emptyBox.appendChild(p1);
        emptyBox.appendChild(p2);
        this.chatThreadEl.appendChild(emptyBox);
        return;
      }
  
      for (const entry of this.sessionHistory) {
        const msgCard = document.createElement("div");
        msgCard.className = "cd-chat-msg";
  
        if (entry.elements.length > 0 || entry.attachments.length > 0) {
          const pills = document.createElement("div");
          pills.className = "cd-chat-msg-pills";
  
          for (const el of entry.elements) {
            const pill = document.createElement("span");
            pill.className = "cd-chat-msg-pill";
            pill.textContent = el.selector;
            pills.appendChild(pill);
          }
          for (const att of entry.attachments) {
            const pill = document.createElement("span");
            pill.className = "cd-chat-msg-pill";
            pill.textContent = att.label;
            pills.appendChild(pill);
          }
          msgCard.appendChild(pills);
        }
  
        if (entry.message) {
          const textP = document.createElement("p");
          textP.className = "cd-chat-msg-text";
          textP.textContent = entry.message;
          msgCard.appendChild(textP);
        }
  
        const meta = document.createElement("div");
        meta.className = "cd-chat-msg-meta";
        const idSpan = document.createElement("span");
        idSpan.textContent = `Dropped #${entry.id}`;
        const timeSpan = document.createElement("span");
        timeSpan.textContent = entry.createdAt;
        meta.appendChild(idSpan);
        meta.appendChild(timeSpan);
        msgCard.appendChild(meta);
  
        this.chatThreadEl.appendChild(msgCard);
      }
  
      this.chatThreadEl.scrollTop = this.chatThreadEl.scrollHeight;
    }
  
            renderTray()       {
      if (!this.trayEl) return;
      this.trayEl.innerHTML = "";
  
      // Render ElementReference chips
      for (const elRef of this.elementReferences) {
        const chip = document.createElement("div");
        chip.className = "cd-chip";
        chip.setAttribute("data-chip-type", "element");
  
        const domNode = this.elementDomNodes.get(elRef.client_ref);
        if (domNode) {
          chip.addEventListener("mouseenter", () => this.picker?.showExternalPreview(domNode));
          chip.addEventListener("mouseleave", () => this.picker?.hideExternalPreview());
        }
  
        const badge = document.createElement("span");
        badge.className = "cd-chip-badge";
        badge.innerHTML = `${ICON_PIN}<span>Pin</span>`;
  
        const label = document.createElement("span");
        label.className = "cd-chip-label";
        label.textContent = elRef.selector;
        label.title = elRef.dom_path || elRef.selector;
  
        chip.appendChild(badge);
        chip.appendChild(label);
  
        if (
          this.config.features.screenshot_capture &&
          domNode
        ) {
          const snapBtn = document.createElement("button");
          snapBtn.type = "button";
          snapBtn.className = "cd-chip-action";
          snapBtn.title = "Capture element screenshot";
          snapBtn.setAttribute("aria-label", `Capture screenshot of ${elRef.selector}`);
          snapBtn.innerHTML = ICON_CAMERA;
          snapBtn.addEventListener("click", () => {
            void this.handleElementScreenshot(domNode, elRef.client_ref, elRef.selector);
          });
          chip.appendChild(snapBtn);
        }
  
        const removeBtn = document.createElement("button");
        removeBtn.type = "button";
        removeBtn.className = "cd-chip-remove";
        removeBtn.setAttribute("aria-label", `Remove ${elRef.selector}`);
        removeBtn.innerHTML = ICON_CLOSE;
        removeBtn.addEventListener("click", () => this.removeElementReference(elRef.client_ref));
  
        chip.appendChild(removeBtn);
        this.trayEl.appendChild(chip);
      }
  
      // Render Attachment chips (uploaded images & screenshots)
      for (const att of this.attachments) {
        const chip = document.createElement("div");
        chip.className = "cd-chip";
        chip.setAttribute("data-chip-type", att.attachment_type);
  
        if (att.preview_url) {
          const img = document.createElement("img");
          img.className = "cd-chip-thumb";
          img.src = att.preview_url;
          img.alt = att.label;
          chip.appendChild(img);
        }
  
        const badge = document.createElement("span");
        badge.className = "cd-chip-badge";
        badge.textContent = att.attachment_type === "screenshot" ? "Shot" : "Image";
  
        const label = document.createElement("span");
        label.className = "cd-chip-label";
        label.textContent = att.label;
  
        const removeBtn = document.createElement("button");
        removeBtn.type = "button";
        removeBtn.className = "cd-chip-remove";
        removeBtn.setAttribute("aria-label", `Remove ${att.label}`);
        removeBtn.innerHTML = ICON_CLOSE;
        removeBtn.addEventListener("click", () => this.removeAttachment(att.id));
  
        chip.appendChild(badge);
        chip.appendChild(label);
        chip.appendChild(removeBtn);
        this.trayEl.appendChild(chip);
      }
    }
  
            async handleFilesSelected(files        )                {
      for (const file of files) {
        if (this.attachments.length >= this.config.limits.max_attachments) {
          this.showStatus(`Maximum of ${this.config.limits.max_attachments} attachments reached.`, "error");
          break;
        }
        if (!this.config.limits.allowed_content_types.includes(file.type)) {
          this.showStatus(`Unsupported file type: ${file.type || file.name}`, "error");
          continue;
        }
        if (file.size > this.config.limits.max_attachment_size) {
          this.showStatus(`File ${file.name} exceeds size limit.`, "error");
          continue;
        }
  
        const dataUrl = await this.readFileAsDataUrl(file);
        this.attachments.push({
          id: `att_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          attachment_type: "image",
          label: file.name,
          preview_url: dataUrl,
          blob: file,
          data_url: dataUrl,
          filename: file.name,
          metadata: {
            original_filename: file.name,
            byte_size: file.size
          }
        });
      }
      this.renderTray();
      this.syncUiStates();
    }
  
            handlePaste(event                )       {
      const items = event.clipboardData?.items;
      if (!items) return;
  
      const imageFiles         = [];
      for (let i = 0; i < items.length; i += 1) {
        const item = items[i];
        if (item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (file) imageFiles.push(file);
        }
      }
      if (imageFiles.length > 0) {
        void this.handleFilesSelected(imageFiles);
      }
    }
  
            readFileAsDataUrl(file      )                  {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(new Error("Failed to read image file"));
        reader.readAsDataURL(file);
      });
    }
  
            async handleViewportScreenshot()                {
      if (this.attachments.length >= this.config.limits.max_attachments) {
        this.showStatus(`Maximum of ${this.config.limits.max_attachments} attachments reached.`, "error");
        return;
      }
  
      try {
        const result = await captureViewportScreenshot(this.config.privacy.excluded_selectors);
        this.attachments.push({
          id: `shot_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          attachment_type: "screenshot",
          label: `Viewport (${result.width}×${result.height})`,
          preview_url: result.dataUrl,
          blob: result.blob,
          data_url: result.dataUrl,
          filename: `viewport-${Date.now()}.png`,
          metadata: result.metadata
        });
        this.renderTray();
        this.syncUiStates();
      } catch (err) {
        const message = err instanceof Error ? err.message : "Screenshot capture unavailable.";
        this.showStatus(message, "error");
      }
    }
  
            async handleElementScreenshot(
      element         ,
      elementClientRef        ,
      selectorLabel        
    )                {
      if (this.attachments.length >= this.config.limits.max_attachments) {
        this.showStatus(`Maximum of ${this.config.limits.max_attachments} attachments reached.`, "error");
        return;
      }
  
      try {
        const result = await captureElementScreenshot(
          element,
          this.config.features.element_capture_padding,
          this.config.privacy.excluded_selectors,
          elementClientRef
        );
        this.attachments.push({
          id: `elshot_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          attachment_type: "screenshot",
          label: `Element ${selectorLabel}`,
          preview_url: result.dataUrl,
          blob: result.blob,
          data_url: result.dataUrl,
          filename: `element-${Date.now()}.png`,
          element_reference_ref: elementClientRef,
          metadata: result.metadata
        });
        this.renderTray();
        this.syncUiStates();
      } catch (err) {
        const message = err instanceof Error ? err.message : "Element screenshot failed.";
        this.showStatus(message, "error");
      }
    }
  
           async handleSubmit()                {
      if (this.isSubmitting) return;
  
      const message = (this.textareaEl?.value || "").trim();
      if (
        message.length === 0 &&
        this.attachments.length === 0 &&
        this.elementReferences.length === 0
      ) {
        this.showStatus("Enter a note, pin an element, or attach a screenshot first.", "error");
        return;
      }
  
      this.isSubmitting = true;
      if (this.submitBtn) {
        this.submitBtn.disabled = true;
        this.submitBtn.innerHTML = `<span>Sending...</span>`;
      }
  
      try {
        const submittedElements = [...this.elementReferences];
        const submittedAttachments = this.attachments.map((att) => ({
          id: att.id,
          label: att.label,
          preview_url: att.preview_url,
          attachment_type: att.attachment_type
        }));
  
        const payload                            = {
          message,
          page_url: typeof window !== "undefined" ? window.location.href : "/",
          user_agent: typeof navigator !== "undefined" ? navigator.userAgent : "",
          metadata: {
            ...this.customMetadata,
            viewport: {
              width: typeof window !== "undefined" ? window.innerWidth : 0,
              height: typeof window !== "undefined" ? window.innerHeight : 0
            },
            locale: typeof navigator !== "undefined" ? navigator.language : "en"
          },
          element_references: this.elementReferences,
          attachments: this.attachments.map((att) => ({
            attachment_type: att.attachment_type,
            filename: att.filename,
            signed_blob_id: att.signed_blob_id,
            data_url: att.signed_blob_id ? undefined : att.data_url,
            element_reference_ref: att.element_reference_ref,
            metadata: att.metadata
          }))
        };
  
        const res = await this.apiClient.submitFeedback(payload);
  
        const now = new Date();
        const timeLabel = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
        this.sessionHistory.push({
          id: res?.id ?? this.sessionHistory.length + 1,
          message: message || "(Context drop without text)",
          createdAt: timeLabel,
          elements: submittedElements,
          attachments: submittedAttachments
        });
  
        if (this.textareaEl) {
          this.textareaEl.value = "";
        }
        this.elementReferences = [];
        this.elementDomNodes.clear();
        this.attachments = [];
        this.picker?.hideExternalPreview();
        this.renderTray();
        this.renderChatThread();
        this.syncUiStates();
        this.showStatus("Context drop saved.", "success");
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Failed to submit feedback.";
        this.showStatus(msg, "error");
      } finally {
        this.isSubmitting = false;
        if (this.submitBtn) {
          this.submitBtn.disabled = false;
          this.submitBtn.innerHTML = `${ICON_SEND}<span>Send</span>`;
        }
      }
    }
  
            showStatus(text        , kind                     )       {
      if (!this.statusEl) return;
      this.statusEl.textContent = text;
      this.statusEl.className = `cd-status ${kind}`;
      this.statusEl.hidden = false;
    }
  }
  function registerContextDropWidget()       {
    if (typeof customElements !== "undefined" && !customElements.get("context-drop-widget")) {
      customElements.define("context-drop-widget", ContextDropWidgetElement);
    }
  }

  // --- Module: index.ts ---
  registerContextDropWidget();
})();
