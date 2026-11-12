/**
 * ContextDrop Browser Widget Bundle (v0.2.0)
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
        if (children.length === 0) {
          const directText = (childEl                                       ).textContent || "";
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
  
  function isInteractiveSmartNode(el         )          {
    const tag = (el.tagName || "").toLowerCase();
    if (INTERACTIVE_SMART_TAGS.has(tag)) return true;
    const role = (el.getAttribute("role") || "").trim().toLowerCase();
    return role.length > 0 && INTERACTIVE_SMART_ROLES.has(role);
  }
  
  function hasComponentBoundarySignal(el         )          {
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
  
  function isOversizedPageShell(el         )          {
    const tag = (el.tagName || "").toLowerCase();
    if (tag === "main" || tag === "body" || tag === "html") return true;
  
    const vw = typeof window !== "undefined" ? window.innerWidth || 1280 : 1280;
    const vh = typeof window !== "undefined" ? window.innerHeight || 800 : 800;
    const rect = computeBoundingRect(el);
    return rect.width >= vw * 0.92 && rect.height >= vh * 0.82;
  }
  
  function findFirstHeadingText(
    root         ,
    customSelectors           = [],
    maxDepth         = 4
  )                {
    const selectors = buildExcludedSelectorList(customSelectors);
    const headingTags = new Set(["H1", "H2", "H3", "H4", "H5", "H6", "LEGEND", "CAPTION", "SUMMARY"]);
  
    function search(node         , depth        )                {
      if (depth > maxDepth) return null;
      const children = (node                                               ).childNodes || [];
      for (let i = 0; i < children.length; i += 1) {
        const child = children[i];
        if (!child || child.nodeType !== 1) continue;
        const childEl = child           ;
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
  
  function humanizeIdentifierToken(raw        )                {
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
  
  function inferFriendlyComponentKind(el         )         {
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
  
  function truncateCleanPhrase(raw        , maxLen         = 32)         {
    const normalized = raw.replace(/\s+/g, " ").trim();
    if (normalized.length <= maxLen) return normalized;
    return `${normalized.slice(0, maxLen - 1).trimEnd()}…`;
  }
  
  /**
   * Resolves a hovered/clicked DOM leaf into a meaningful, human-recognizable UI component
   * for Production ("smart") mode so non-technical users never wrestle with tiny `<span>`/`<svg>`
   * fragments or overlapping DevTools layer lists.
   */
  function resolveSmartComponent(
    primaryTarget                ,
    customSelectors           = []
  )                 {
    if (!primaryTarget || !isSelectableElement(primaryTarget, customSelectors)) {
      return null;
    }
  
    // 1. If the user is pointing inside an interactive control (button, link, input, tab, menuitem),
    //    snap cleanly to that control rather than an inner <span> or <svg>.
    let cursor                 = primaryTarget;
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
    let fallbackSection                 = null;
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
  function describeSmartComponent(
    el         ,
    customSelectors           = [],
    originalLeaf                 
  )                            {
    const kind = inferFriendlyComponentKind(el);
    let name                = null;
  
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
  function computeFriendlyComponentLabel(
    el         ,
    customSelectors           = []
  )         {
    return describeSmartComponent(el, customSelectors).label;
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
    clientRef         ,
    extraMetadata                          
  )                                  {
    if (isElementExcluded(el, customSelectors)) {
      return null;
    }
  
    const boundingRect = computeBoundingRect(el);
    const smart = describeSmartComponent(el, customSelectors);
  
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
      metadata: {
        friendly_label: smart.label,
        component_kind: smart.kind,
        ...(extraMetadata || {})
      },
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
  const ICON_SCROLL_VERTICAL = `<svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="5.25 5.75 8 3 10.75 5.75"/><polyline points="5.25 10.25 8 13 10.75 10.25"/></svg>`;
  const ICON_CAMERA = `<svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6.5h2.5l1.4-2h6.2l1.4 2H17a1.5 1.5 0 0 1 1.5 1.5v7.5A1.5 1.5 0 0 1 17 17H3a1.5 1.5 0 0 1-1.5-1.5V8A1.5 1.5 0 0 1 3 6.5z"/><circle cx="10" cy="11.5" r="2.75"/></svg>`;
  const ICON_IMAGE = `<svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2.5" y="3.5" width="15" height="13" rx="2"/><circle cx="7" cy="8" r="1.3"/><path d="M17.5 13.2l-3.8-3.7L6 16.5"/></svg>`;
  const ICON_SEND = `<svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.85" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 16V4"/><polyline points="5 9 10 4 15 9"/></svg>`;
  const ICON_CLOSE = `<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="4" y1="4" x2="12" y2="12"/><line x1="12" y1="4" x2="4" y2="12"/></svg>`;
  const ICON_MINIMIZE = `<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="3.5" y1="8" x2="12.5" y2="8"/></svg>`;
  const ICON_EXPAND = `<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 3.5 12.5 3.5 12.5 10"/><line x1="12.5" y1="3.5" x2="3.5" y2="12.5"/></svg>`;
  const ICON_GRIP = `<svg viewBox="0 0 12 16" width="10" height="14" fill="currentColor" aria-hidden="true"><circle cx="3.5" cy="4" r="1.1"/><circle cx="8.5" cy="4" r="1.1"/><circle cx="3.5" cy="8" r="1.1"/><circle cx="8.5" cy="8" r="1.1"/><circle cx="3.5" cy="12" r="1.1"/><circle cx="8.5" cy="12" r="1.1"/></svg>`;
  const ICON_CHECK = `<svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3.5 8.5 6.5 11.5 12.5 4.5"/></svg>`;
  const ICON_CHAT = `<svg viewBox="0 0 20 20" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 4h12a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H8l-4 3v-3H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"/></svg>`;
  const ICON_SIDEBAR = `<svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2.5" y="3.5" width="15" height="13" rx="2"/><line x1="12" y1="3.5" x2="12" y2="16.5"/></svg>`;
  const ICON_CODE_PROMPT = `<svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2.5" y="3.5" width="15" height="13" rx="2"/><polyline points="6.5 8 9.2 10 6.5 12"/><line x1="10.8" y1="12" x2="13.8" y2="12"/></svg>`;
  const ICON_KEY = `<svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="7" cy="12" r="3.5"/><path d="M9.6 9.4L16.5 2.5"/><path d="M14 5l2.2 2.2"/><path d="M12 7l1.8 1.8"/></svg>`;
  const ICON_FILE_CODE = `<svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11.5 2.5H5.5a1.5 1.5 0 0 0-1.5 1.5v12a1.5 1.5 0 0 0 1.5 1.5h9a1.5 1.5 0 0 0 1.5-1.5V7l-4.5-4.5z"/><polyline points="11.5 2.5 11.5 7 16 7"/><polyline points="8.2 10.5 6.5 12 8.2 13.5"/><polyline points="11.8 10.5 13.5 12 11.8 13.5"/></svg>`;
  const ICON_SEARCH = `<svg viewBox="0 0 20 20" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="9" r="5.5"/><line x1="13" y1="13" x2="17" y2="17"/></svg>`;
  const ICON_PLUS = `<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="8" y1="3.5" x2="8" y2="12.5"/><line x1="3.5" y1="8" x2="12.5" y2="8"/></svg>`;
  const ICON_UNDO = `<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="5.5 4.5 2.5 7.5 5.5 10.5"/><path d="M2.5 7.5h7.2a3.8 3.8 0 0 1 0 7.6H8.5"/></svg>`;
  const ICON_INBOX = `<svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3.5 11.5L5.2 4.5h9.6l1.7 7v4a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1v-4z"/><path d="M3.5 11.5h3.8l1.2 2h3l1.2-2h3.8"/></svg>`;
  const ICON_SHIELD = `<svg viewBox="0 0 20 20" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 2.5l6 2.3v4.7c0 4.1-2.6 6.8-6 8-3.4-1.2-6-3.9-6-8V4.8l6-2.3z"/></svg>`;
  const ICON_PUSH_LAYOUT = `<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="2.5" width="12" height="11" rx="1.8"/><line x1="9.5" y1="2.5" x2="9.5" y2="13.5"/><polyline points="6.5 6.2 4.7 8 6.5 9.8"/></svg>`;
  const ICON_SUN = `<svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="10" cy="10" r="3.75"/><line x1="10" y1="2" x2="10" y2="4"/><line x1="10" y1="16" x2="10" y2="18"/><line x1="2" y1="10" x2="4" y2="10"/><line x1="16" y1="10" x2="18" y2="10"/><line x1="4.34" y1="4.34" x2="5.75" y2="5.75"/><line x1="14.25" y1="14.25" x2="15.66" y2="15.66"/><line x1="4.34" y1="15.66" x2="5.75" y2="14.25"/><line x1="14.25" y1="5.75" x2="15.66" y2="4.34"/></svg>`;
  const ICON_MOON = `<svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17.2 12.8A7.5 7.5 0 0 1 7.2 2.8a7.5 7.5 0 1 0 10 10z"/></svg>`;

  // --- Module: markdown.ts ---
  /**
   * Safe, zero-dependency Markdown and unified-diff renderer for ContextDrop Agent responses.
   * Escapes all HTML entities before formatting inline code, bold text, lists, and code blocks.
   */
  function escapeHtml(raw        )         {
    return String(raw)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }
  
  function formatInlineMarkdown(escapedLine        )         {
    const codeTokens           = [];
    const withCodePlaceholders = escapedLine.replace(/`([^`]+)`/g, (_match, code) => {
      const idx = codeTokens.length;
      codeTokens.push(`<code class="cd-md-code">${code}</code>`);
      return `\u0000CDCODE${idx}\u0000`;
    });
  
    const withBold = withCodePlaceholders.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  
    return withBold.replace(/\u0000CDCODE(\d+)\u0000/g, (_m, idxStr) => {
      const idx = Number(idxStr);
      return codeTokens[idx] ?? "";
    });
  }
  function renderSafeMarkdown(markdown        )         {
    const source = String(markdown || "").replace(/\r\n/g, "\n").trim();
    if (!source) return "";
  
    const fenceParts = source.split(/```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g);
    const htmlBlocks           = [];
  
    for (let i = 0; i < fenceParts.length; i += 3) {
      const proseChunk = fenceParts[i] || "";
      if (proseChunk.trim().length > 0) {
        htmlBlocks.push(renderProseBlocks(proseChunk));
      }
  
      if (i + 2 < fenceParts.length) {
        const lang = escapeHtml((fenceParts[i + 1] || "").trim());
        const codeBody = escapeHtml((fenceParts[i + 2] || "").replace(/\n$/, ""));
        const langAttr = lang ? ` data-lang="${lang}"` : "";
        htmlBlocks.push(
          `<pre class="cd-md-pre"${langAttr}><code class="cd-md-code-block">${codeBody}</code></pre>`
        );
      }
    }
  
    return htmlBlocks.join("");
  }
  
  function renderProseBlocks(prose        )         {
    const lines = prose.split("\n");
    const out           = [];
    let paragraphLines           = [];
    let listItems           = [];
    let listTag                     = null;
  
    const flushParagraph = ()       => {
      if (paragraphLines.length === 0) return;
      out.push(`<p class="cd-md-p">${paragraphLines.join("<br>")}</p>`);
      paragraphLines = [];
    };
  
    const flushList = ()       => {
      if (!listTag || listItems.length === 0) return;
      out.push(`<${listTag} class="cd-md-list">${listItems.join("")}</${listTag}>`);
      listItems = [];
      listTag = null;
    };
  
    for (const rawLine of lines) {
      const trimmed = rawLine.trim();
      if (!trimmed) {
        flushParagraph();
        flushList();
        continue;
      }
  
      const headingMatch = trimmed.match(/^(#{1,3})\s+(.+)$/);
      if (headingMatch) {
        flushParagraph();
        flushList();
        out.push(
          `<p class="cd-md-heading">${formatInlineMarkdown(escapeHtml(headingMatch[2]))}</p>`
        );
        continue;
      }
  
      const bulletMatch = trimmed.match(/^[-*]\s+(.+)$/);
      if (bulletMatch) {
        flushParagraph();
        if (listTag && listTag !== "ul") flushList();
        listTag = "ul";
        listItems.push(`<li>${formatInlineMarkdown(escapeHtml(bulletMatch[1]))}</li>`);
        continue;
      }
  
      const orderedMatch = trimmed.match(/^\d+\.\s+(.+)$/);
      if (orderedMatch) {
        flushParagraph();
        if (listTag && listTag !== "ol") flushList();
        listTag = "ol";
        listItems.push(`<li>${formatInlineMarkdown(escapeHtml(orderedMatch[1]))}</li>`);
        continue;
      }
  
      flushList();
      paragraphLines.push(formatInlineMarkdown(escapeHtml(trimmed)));
    }
  
    flushParagraph();
    flushList();
    return out.join("");
  }
  function buildUnifiedDiffElement(doc          , diffText        )                 {
    const container = doc.createElement("div");
    container.className = "cd-diff-lines";
  
    const lines = String(diffText || "").replace(/\r\n/g, "\n").split("\n");
    for (const line of lines) {
      if (line.startsWith("--- ") || line.startsWith("+++ ")) {
        continue;
      }
      const row = doc.createElement("div");
      if (line.startsWith("@@")) {
        row.className = "cd-diff-line cd-diff-hunk";
      } else if (line.startsWith("+")) {
        row.className = "cd-diff-line cd-diff-add";
      } else if (line.startsWith("-")) {
        row.className = "cd-diff-line cd-diff-del";
      } else {
        row.className = "cd-diff-line cd-diff-ctx";
      }
      row.textContent = line.length > 0 ? line : " ";
      container.appendChild(row);
    }
  
    return container;
  }

  // --- Module: styles.ts ---
  const WIDGET_SHADOW_STYLES = `
  :host {
    all: initial;
    --cd-ink: #111318;
    --cd-ink-secondary: #4b5262;
    --cd-ink-subtle: #525a6e;
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
    --cd-shadow-pin: 0 12px 24px -6px rgba(17, 19, 24, 0.26), 0 4px 10px -3px rgba(17, 19, 24, 0.14);
    --cd-shadow-sidebar: -16px 0 38px -14px rgba(17, 19, 24, 0.16);
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
  
  :host([data-theme="dark"]),
  .cd-root[data-theme="dark"],
  .cd-composer[data-theme="dark"],
  .cd-agent-sidebar[data-theme="dark"],
  .cd-compact-bar[data-theme="dark"] {
    --cd-ink: #f8fafc;
    --cd-ink-secondary: #94a3b8;
    --cd-ink-subtle: #64748b;
    --cd-surface: #0f1117;
    --cd-surface-recessed: #181b22;
    --cd-surface-elevated: #212631;
    --cd-border: #333947;
    --cd-border-subtle: #242935;
    --cd-pin: #ea580c;
    --cd-pin-hover: #f97316;
    --cd-pin-soft: rgba(234, 88, 12, 0.22);
    --cd-accent: #3b82f6;
    --cd-accent-hover: #60a5fa;
    --cd-accent-soft: rgba(59, 130, 246, 0.20);
    --cd-danger: #ef4444;
    --cd-danger-soft: rgba(239, 68, 68, 0.22);
    --cd-success: #22c55e;
    --cd-success-soft: rgba(34, 197, 94, 0.22);
    --cd-shadow-float: 0 24px 48px -12px rgba(0, 0, 0, 0.70), 0 8px 22px -6px rgba(0, 0, 0, 0.50);
    --cd-shadow-pin: 0 14px 28px -6px rgba(0, 0, 0, 0.65), 0 4px 12px -3px rgba(0, 0, 0, 0.45);
    --cd-shadow-sidebar: -16px 0 42px -10px rgba(0, 0, 0, 0.65);
  }
  
  :host([data-theme="dark"]) .cd-corner-flap,
  .cd-root[data-theme="dark"] .cd-corner-flap {
    fill: #181b22;
    stroke: #333947;
  }
  
  :host([data-theme="dark"]) .cd-icon-btn:hover:not(:disabled),
  .cd-agent-sidebar[data-theme="dark"] .cd-icon-btn:hover:not(:disabled),
  .cd-composer[data-theme="dark"] .cd-icon-btn:hover:not(:disabled) {
    background: rgba(255, 255, 255, 0.09);
    color: var(--cd-ink);
  }
  
  :host([data-theme="dark"]) .cd-starter-btn:hover,
  .cd-agent-sidebar[data-theme="dark"] .cd-starter-btn:hover {
    background: #282f3d;
    border-color: var(--cd-accent);
  }
  
  :host([data-theme="dark"]) .cd-btn-primary:hover:not(:disabled),
  .cd-agent-sidebar[data-theme="dark"] .cd-btn-primary:hover:not(:disabled),
  .cd-composer[data-theme="dark"] .cd-btn-primary:hover:not(:disabled) {
    background: #e2e8f0;
    border-color: #e2e8f0;
  }
  
  :host([data-theme="dark"]) .cd-md-pre,
  .cd-agent-sidebar[data-theme="dark"] .cd-md-pre,
  .cd-composer[data-theme="dark"] .cd-md-pre {
    background: #090b0e;
    color: #e2e8f0;
    border-color: #242935;
  }
  
  :host([data-theme="dark"]) .cd-mode-btn.is-active,
  .cd-agent-sidebar[data-theme="dark"] .cd-mode-btn.is-active,
  .cd-composer[data-theme="dark"] .cd-mode-btn.is-active {
    background: #242935;
    color: #f8fafc;
    border-color: #3b4252;
  }
  
  *, *::before, *::after {
    box-sizing: border-box;
  }
  
  ::selection {
    background: var(--cd-pin-soft);
    color: var(--cd-ink);
  }
  
  /* Focus states across all interactive controls */
  button:focus-visible,
  textarea:focus-visible,
  input:focus-visible,
  select:focus-visible {
    outline: 2px solid var(--cd-accent);
    outline-offset: 2px;
  }
  
  /* Custom themed scrollbars */
  .cd-chat-thread::-webkit-scrollbar,
  .cd-agent-stream::-webkit-scrollbar,
  .cd-tray::-webkit-scrollbar,
  .cd-diff-lines::-webkit-scrollbar,
  .cd-feedbacks-list::-webkit-scrollbar {
    width: 6px;
    height: 6px;
  }
  
  .cd-chat-thread::-webkit-scrollbar-track,
  .cd-agent-stream::-webkit-scrollbar-track,
  .cd-tray::-webkit-scrollbar-track,
  .cd-diff-lines::-webkit-scrollbar-track,
  .cd-feedbacks-list::-webkit-scrollbar-track {
    background: transparent;
  }
  
  .cd-chat-thread::-webkit-scrollbar-thumb,
  .cd-agent-stream::-webkit-scrollbar-thumb,
  .cd-tray::-webkit-scrollbar-thumb,
  .cd-diff-lines::-webkit-scrollbar-thumb,
  .cd-feedbacks-list::-webkit-scrollbar-thumb {
    background: var(--cd-border);
    border-radius: 9999px;
  }
  
  /* Floating Anchor Container for Composer & Compact Bar */
  .cd-root {
    position: fixed;
    z-index: 2147483640;
    display: flex;
    flex-direction: column;
    pointer-events: none;
    max-width: calc(100vw - 24px);
  }
  
  .cd-root.pos-top_left {
    top: 16px;
    left: 16px;
    align-items: flex-start;
  }
  
  .cd-root.pos-top_right {
    top: 16px;
    right: 16px;
    align-items: flex-end;
  }
  
  .cd-root.pos-bottom_left {
    bottom: 16px;
    left: 16px;
    align-items: flex-start;
  }
  
  .cd-root.pos-bottom_right {
    bottom: 16px;
    right: 16px;
    align-items: flex-end;
  }
  
  .cd-root.is-free-positioned {
    bottom: auto;
    right: auto;
    align-items: flex-start;
  }
  
  /* ==========================================================================
     1. BOOK-CORNER LAUNCHER & PEEL-TO-PIN MORPH
     ========================================================================== */
  
  .cd-book-corner {
    appearance: none;
    position: fixed;
    z-index: 2147483641;
    width: 48px;
    height: 48px;
    padding: 0;
    margin: 0;
    border: 0;
    background: transparent;
    cursor: grab;
    pointer-events: auto;
    user-select: none;
    touch-action: none;
    display: flex;
    align-items: flex-start;
    justify-content: flex-start;
    transition: opacity 0.16s var(--cd-ease), transform 0.18s var(--cd-ease);
  }
  
  .cd-book-corner[hidden] {
    display: none !important;
  }
  
  .cd-book-corner:active {
    cursor: grabbing;
  }
  
  .cd-book-corner.corner-top_left {
    top: 0;
    left: 0;
  }
  
  .cd-book-corner.corner-top_right {
    top: 0;
    right: 0;
    justify-content: flex-end;
  }
  
  .cd-book-corner.corner-bottom_left {
    bottom: 0;
    left: 0;
    align-items: flex-end;
  }
  
  .cd-book-corner.corner-bottom_right {
    bottom: 0;
    right: 0;
    align-items: flex-end;
    justify-content: flex-end;
  }
  
  .cd-book-corner.is-peeled {
    opacity: 0;
    transform: scale(0.45);
    pointer-events: none;
  }
  
  .cd-book-corner-art {
    position: relative;
    width: 40px;
    height: 40px;
    display: block;
    transform-origin: top left;
    transition: transform 0.2s var(--cd-ease), filter 0.2s var(--cd-ease);
    filter: drop-shadow(0 3px 6px rgba(17, 19, 24, 0.20));
  }
  
  .cd-book-corner.corner-top_right .cd-book-corner-art {
    transform: scaleX(-1);
    transform-origin: center;
  }
  
  .cd-book-corner.corner-bottom_left .cd-book-corner-art {
    transform: scaleY(-1);
    transform-origin: center;
  }
  
  .cd-book-corner.corner-bottom_right .cd-book-corner-art {
    transform: scale(-1, -1);
    transform-origin: center;
  }
  
  .cd-book-corner:hover .cd-book-corner-art,
  .cd-book-corner:focus-visible .cd-book-corner-art {
    filter: drop-shadow(0 6px 12px rgba(17, 19, 24, 0.28));
  }
  
  .cd-book-corner.corner-top_left:hover .cd-book-corner-art,
  .cd-book-corner.corner-top_left:focus-visible .cd-book-corner-art {
    transform: scale(1.12);
  }
  
  .cd-book-corner.corner-top_right:hover .cd-book-corner-art,
  .cd-book-corner.corner-top_right:focus-visible .cd-book-corner-art {
    transform: scale(-1.12, 1.12);
  }
  
  .cd-book-corner.corner-bottom_left:hover .cd-book-corner-art,
  .cd-book-corner.corner-bottom_left:focus-visible .cd-book-corner-art {
    transform: scale(1.12, -1.12);
  }
  
  .cd-book-corner.corner-bottom_right:hover .cd-book-corner-art,
  .cd-book-corner.corner-bottom_right:focus-visible .cd-book-corner-art {
    transform: scale(-1.12, -1.12);
  }
  
  .cd-book-corner-svg {
    display: block;
    width: 40px;
    height: 40px;
  }
  
  .cd-corner-flap {
    transition: transform 0.2s var(--cd-ease);
    transform-origin: 20px 20px;
  }
  
  .cd-book-corner:hover .cd-corner-flap,
  .cd-book-corner:focus-visible .cd-corner-flap {
    transform: translate(1.5px, 1.5px);
  }
  
  /* Context count badge on Book Corner */
  .cd-corner-count {
    position: absolute;
    z-index: 2;
    min-width: 17px;
    height: 17px;
    padding: 0 4px;
    border-radius: 9999px;
    background: var(--cd-ink);
    color: var(--cd-surface);
    border: 1.5px solid var(--cd-surface);
    font-family: var(--cd-font);
    font-size: 10px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 2px 6px rgba(17, 19, 24, 0.25);
  }
  
  .cd-book-corner.corner-top_left .cd-corner-count {
    top: 22px;
    left: 22px;
  }
  
  .cd-book-corner.corner-top_right .cd-corner-count {
    top: 22px;
    right: 22px;
  }
  
  .cd-book-corner.corner-bottom_left .cd-corner-count {
    bottom: 22px;
    left: 22px;
  }
  
  .cd-book-corner.corner-bottom_right .cd-corner-count {
    bottom: 22px;
    right: 22px;
  }
  
  /* Local Agent Mode Dot on Book Corner */
  .cd-corner-agent-dot {
    position: absolute;
    z-index: 2;
    width: 8px;
    height: 8px;
    border-radius: 9999px;
    background: var(--cd-accent);
    border: 1.5px solid var(--cd-surface);
  }
  
  .cd-book-corner.corner-top_left .cd-corner-agent-dot {
    top: 5px;
    left: 27px;
  }
  
  .cd-book-corner.corner-top_right .cd-corner-agent-dot {
    top: 5px;
    right: 27px;
  }
  
  .cd-book-corner.corner-bottom_left .cd-corner-agent-dot {
    bottom: 5px;
    left: 27px;
  }
  
  .cd-book-corner.corner-bottom_right .cd-corner-agent-dot {
    bottom: 5px;
    right: 27px;
  }
  
  /* Subtle hover micro-coach next to book corner */
  .cd-corner-hint {
    position: absolute;
    pointer-events: none;
    white-space: nowrap;
    padding: 4px 8px;
    border-radius: 7px;
    background: var(--cd-ink);
    color: var(--cd-surface);
    font-family: var(--cd-font);
    font-size: 11px;
    font-weight: 500;
    opacity: 0;
    box-shadow: 0 8px 18px -4px rgba(17, 19, 24, 0.28);
    transition: opacity 0.15s var(--cd-ease), transform 0.15s var(--cd-ease);
  }
  
  .cd-book-corner.corner-top_left .cd-corner-hint {
    top: 8px;
    left: 46px;
    transform: translateX(-4px);
  }
  
  .cd-book-corner.corner-top_right .cd-corner-hint {
    top: 8px;
    right: 46px;
    transform: translateX(4px);
  }
  
  .cd-book-corner.corner-bottom_left .cd-corner-hint {
    bottom: 8px;
    left: 46px;
    transform: translateX(-4px);
  }
  
  .cd-book-corner.corner-bottom_right .cd-corner-hint {
    bottom: 8px;
    right: 46px;
    transform: translateX(4px);
  }
  
  .cd-book-corner:hover .cd-corner-hint,
  .cd-book-corner:focus-visible .cd-corner-hint {
    opacity: 1;
    transform: translateX(0);
  }
  
  /* Morphing Drag Pushpin (Book-Corner Peel -> Pushpin) */
  @keyframes cd-peel-to-pin {
    0% {
      border-radius: 3px 14px 3px 3px;
      background: var(--cd-surface);
      color: var(--cd-pin);
      transform: translate3d(-4px, -10px, 0) rotate(-22deg) scale(0.76);
    }
    55% {
      border-radius: 18px 18px 18px 3px;
      background: var(--cd-pin);
      color: var(--cd-surface);
      transform: translate3d(-6px, -30px, 0) rotate(-6deg) scale(1.08);
    }
    100% {
      border-radius: 9999px 9999px 9999px 3px;
      background: var(--cd-pin);
      color: var(--cd-surface);
      transform: translate3d(-6px, -28px, 0) rotate(0deg) scale(1);
    }
  }
  
  .cd-drag-pin {
    position: fixed;
    left: 0;
    top: 0;
    z-index: 2147483647;
    pointer-events: none;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 34px;
    height: 34px;
    will-change: transform;
  }
  
  .cd-drag-pin[hidden] {
    display: none !important;
  }
  
  .cd-drag-pin-head {
    width: 34px;
    height: 34px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 9999px 9999px 9999px 3px;
    background: var(--cd-pin);
    color: var(--cd-surface);
    border: 2px solid var(--cd-surface);
    box-shadow: var(--cd-shadow-pin);
    transform: translate3d(-6px, -28px, 0);
    animation: cd-peel-to-pin 0.22s var(--cd-ease) both;
    transition: background-color 0.14s var(--cd-ease), border-radius 0.16s var(--cd-ease), transform 0.14s var(--cd-ease);
  }
  
  .cd-drag-pin.has-target .cd-drag-pin-head {
    transform: translate3d(-6px, -30px, 0) rotate(-8deg) scale(1.06);
  }
  
  .cd-drag-pin.is-snapping-corner .cd-drag-pin-head {
    border-radius: 4px 14px 4px 4px;
    background: var(--cd-accent);
    transform: translate3d(-14px, -14px, 0) scale(0.94);
  }
  
  /* Corner Snap Target Ghost when re-docking Book Corner */
  .cd-corner-snap-ghost {
    position: fixed;
    z-index: 2147483646;
    pointer-events: none;
    width: 52px;
    height: 52px;
    border: 2px dashed var(--cd-accent);
    background: rgba(29, 78, 216, 0.12);
    display: flex;
    align-items: center;
    justify-content: center;
    transition: opacity 0.14s var(--cd-ease), transform 0.14s var(--cd-ease);
  }
  
  .cd-corner-snap-ghost[hidden] {
    display: none !important;
  }
  
  .cd-corner-snap-ghost.corner-top_left {
    top: 0;
    left: 0;
    border-radius: 0 0 16px 0;
  }
  
  .cd-corner-snap-ghost.corner-top_right {
    top: 0;
    right: 0;
    border-radius: 0 0 0 16px;
  }
  
  .cd-corner-snap-ghost.corner-bottom_left {
    bottom: 0;
    left: 0;
    border-radius: 0 16px 0 0;
  }
  
  .cd-corner-snap-ghost.corner-bottom_right {
    bottom: 0;
    right: 0;
    border-radius: 16px 0 0 0;
  }
  
  /* ==========================================================================
     2. SHARED CONTROLS, BADGES & COMPACT PINNING COACH BAR
     ========================================================================== */
  
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
  
  .cd-env-pill {
    display: inline-flex;
    align-items: center;
    padding: 1px 6px;
    border-radius: 5px;
    font-family: var(--cd-mono);
    font-size: 10.5px;
    font-weight: 600;
    background: var(--cd-surface-elevated);
    border: 1px solid var(--cd-border);
    color: var(--cd-ink-secondary);
    flex-shrink: 0;
  }
  
  .cd-env-pill.is-local {
    background: var(--cd-accent-soft);
    border-color: rgba(29, 78, 216, 0.26);
    color: var(--cd-accent-hover);
  }
  
  .cd-mode-switch {
    display: inline-flex;
    align-items: center;
    padding: 2px;
    border-radius: 8px;
    background: var(--cd-surface-elevated);
    border: 1px solid var(--cd-border);
    gap: 2px;
    flex-shrink: 0;
  }
  
  .cd-mode-btn {
    appearance: none;
    border: 0;
    background: transparent;
    color: var(--cd-ink-secondary);
    font-family: var(--cd-font);
    font-size: 11.5px;
    font-weight: 600;
    padding: 3px 8px;
    border-radius: 6px;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 4px;
    transition: background-color 0.14s var(--cd-ease), color 0.14s var(--cd-ease);
  }
  
  .cd-mode-btn:hover {
    color: var(--cd-ink);
  }
  
  .cd-mode-btn.is-active {
    background: var(--cd-ink);
    color: var(--cd-surface);
  }
  
  .cd-pin-dock-grip {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 4px 3px 4px 5px;
    color: var(--cd-ink-secondary);
    cursor: grab;
  }
  
  .cd-pin-dock-grip:active {
    cursor: grabbing;
  }
  
  .cd-compact-bar {
    pointer-events: auto;
    display: flex;
    align-items: center;
    gap: 8px;
    width: max-content;
    min-width: 390px;
    max-width: min(560px, calc(100vw - 24px));
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
  
  .cd-compact-bar.is-smart-mode {
    min-width: 280px;
    padding: 6px 9px;
  }
  
  .cd-compact-status {
    display: flex;
    align-items: center;
    gap: 7px;
    flex: 1;
    min-width: 0;
    overflow: hidden;
  }
  
  .cd-compact-coach-text {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-size: 12px;
    color: var(--cd-ink-secondary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  
  .cd-compact-coach-text strong {
    color: var(--cd-ink);
    font-weight: 600;
  }
  
  .cd-compact-wheel-icon {
    display: inline-flex;
    align-items: center;
    color: var(--cd-accent);
    flex-shrink: 0;
  }
  
  .cd-compact-pinned-pill {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 2px 5px 2px 6px;
    background: var(--cd-surface-elevated);
    border: 1px solid var(--cd-border);
    border-radius: 7px;
    min-width: 0;
    max-width: 220px;
  }
  
  .cd-compact-pinned-count {
    font-size: 10.5px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    padding: 1px 5px;
    border-radius: 4px;
    background: var(--cd-pin-soft);
    color: var(--cd-pin-hover);
    flex-shrink: 0;
  }
  
  .cd-compact-pinned-selector {
    font-family: var(--cd-mono);
    font-size: 11px;
    color: var(--cd-ink);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  
  .cd-compact-step-group {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    flex-shrink: 0;
  }
  
  .cd-kbd {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-family: var(--cd-mono);
    font-size: 10px;
    font-weight: 600;
    line-height: 1.1;
    padding: 2px 5px;
    border-radius: 4px;
    background: var(--cd-surface-recessed);
    border: 1px solid var(--cd-border);
    color: var(--cd-ink-secondary);
  }
  
  .cd-btn-primary .cd-kbd {
    background: rgba(250, 249, 246, 0.16);
    border-color: rgba(250, 249, 246, 0.26);
    color: var(--cd-surface);
  }
  
  /* ==========================================================================
     3. FLOATING FEEDBACK CHATBOX COMPOSER (.cd-composer)
     ========================================================================== */
  
  .cd-composer {
    pointer-events: auto;
    width: 404px;
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
  
  .cd-composer.is-smart-mode {
    width: 356px;
  }
  
  .cd-composer.is-smart-mode .cd-textarea {
    min-height: 60px;
  }
  
  .cd-composer.is-dragging-over,
  .cd-agent-sidebar.is-dragging-over {
    border-color: var(--cd-accent);
  }
  
  .cd-composer-header,
  .cd-sidebar-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 9px 12px;
    background: var(--cd-surface-recessed);
    border-bottom: 1px solid var(--cd-border);
    user-select: none;
    flex-shrink: 0;
  }
  
  .cd-composer-header {
    cursor: grab;
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
    flex: 0 1 auto;
  }
  
  .cd-sidebar-header .cd-header-left {
    flex: 0 0 auto;
    flex-shrink: 0;
  }
  
  .cd-sidebar-header .cd-composer-title {
    flex-shrink: 0;
    overflow: visible;
    text-overflow: clip;
  }
  
  .cd-pin-corner-btn {
    appearance: none;
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 5px 9px;
    border-radius: 11px 11px 11px 3px;
    border: 1px solid rgba(194, 65, 12, 0.25);
    background: var(--cd-pin);
    color: var(--cd-surface);
    font-family: var(--cd-font);
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    flex-shrink: 0;
    box-shadow: 0 4px 10px -2px rgba(194, 65, 12, 0.26);
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
    flex-shrink: 0;
  }
  
  .cd-header-actions {
    display: flex;
    align-items: center;
    gap: 3px;
    flex-shrink: 0;
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
    transition: background-color 0.12s ease, color 0.12s ease, border-color 0.12s ease;
  }
  
  .cd-icon-btn:hover:not(:disabled) {
    background: rgba(17, 19, 24, 0.06);
    color: var(--cd-ink);
  }
  
  .cd-icon-btn.is-active {
    background: var(--cd-accent-soft);
    color: var(--cd-accent-hover);
    border-color: rgba(29, 78, 216, 0.25);
  }
  
  .cd-icon-btn:disabled {
    opacity: 0.36;
    cursor: not-allowed;
  }
  
  /* Conversational Chat Thread (Standard Feedback Mode) */
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
  
  .cd-chat-thread[hidden] {
    display: none !important;
  }
  
  .cd-composer.is-smart-mode .cd-chat-thread {
    padding: 10px 12px;
    max-height: 190px;
  }
  
  .cd-chat-empty {
    display: flex;
    flex-direction: column;
    gap: 7px;
    padding: 10px 12px;
    background: var(--cd-surface-recessed);
    border: 1px solid var(--cd-border-subtle);
    border-radius: var(--cd-radius-md);
    color: var(--cd-ink-secondary);
    font-size: 12.5px;
  }
  
  .cd-chat-empty.is-smart {
    gap: 3px;
    padding: 8px 10px;
    font-size: 12px;
  }
  
  .cd-chat-empty-text {
    margin: 0;
    color: var(--cd-ink);
    font-weight: 600;
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
  
  .cd-chat-msg-pill.is-friendly {
    font-family: var(--cd-font);
    font-size: 11px;
    font-weight: 500;
  }
  
  /* ==========================================================================
     4. LOCAL BYOK AGENTIC CODING SIDEBAR (.cd-agent-sidebar)
     ========================================================================== */
  
  .cd-agent-sidebar {
    position: fixed;
    top: 0;
    bottom: 0;
    height: 100dvh;
    width: var(--cd-sidebar-width, 560px);
    min-width: 360px;
    max-width: 100vw;
    z-index: 2147483642;
    pointer-events: auto;
    background: var(--cd-surface);
    display: flex;
    flex-direction: column;
    box-shadow: var(--cd-shadow-sidebar);
    transition: transform 0.2s var(--cd-ease), opacity 0.18s var(--cd-ease);
  }
  
  .cd-agent-sidebar[hidden] {
    display: none !important;
  }
  
  .cd-agent-sidebar.side-right {
    right: 0;
    border-left: 1px solid var(--cd-border);
  }
  
  .cd-agent-sidebar.side-left {
    left: 0;
    border-right: 1px solid var(--cd-border);
    box-shadow: 16px 0 38px -14px rgba(17, 19, 24, 0.16);
  }
  
  .cd-sidebar-resizer {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 6px;
    cursor: col-resize;
    z-index: 4;
    touch-action: none;
    transition: background-color 0.14s ease;
  }
  
  .cd-agent-sidebar.side-right .cd-sidebar-resizer {
    left: -3px;
  }
  
  .cd-agent-sidebar.side-left .cd-sidebar-resizer {
    right: -3px;
  }
  
  .cd-sidebar-resizer:hover,
  .cd-sidebar-resizer.is-resizing {
    background: rgba(29, 78, 216, 0.35);
  }
  
  /* Provider + BYOK Vault + Cross-Env Feedbacks Control Strip */
  .cd-agent-subbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
    padding: 6px 11px;
    background: var(--cd-surface-elevated);
    border-bottom: 1px solid var(--cd-border-subtle);
    flex-wrap: wrap;
  }
  
  .cd-provider-pill-btn {
    appearance: none;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 4px 8px;
    border-radius: 7px;
    border: 1px solid var(--cd-border);
    background: var(--cd-surface);
    color: var(--cd-ink);
    font-family: var(--cd-font);
    font-size: 11.5px;
    font-weight: 500;
    cursor: pointer;
    min-width: 0;
    max-width: 260px;
    transition: background-color 0.12s ease, border-color 0.12s ease;
  }
  
  .cd-provider-pill-btn:hover {
    background: var(--cd-surface-recessed);
    border-color: var(--cd-ink-secondary);
  }
  
  .cd-key-dot {
    width: 7px;
    height: 7px;
    border-radius: 9999px;
    background: var(--cd-pin);
    flex-shrink: 0;
  }
  
  .cd-key-dot.is-ready {
    background: var(--cd-success);
  }
  
  .cd-provider-pill-label {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-family: var(--cd-mono);
    font-size: 11px;
  }
  
  .cd-subbar-right {
    display: flex;
    align-items: center;
    gap: 5px;
  }
  
  /* Inline Collapsible Drawers (BYOK Vault & Cross-Env Feedbacks) */
  .cd-inline-drawer {
    display: flex;
    flex-direction: column;
    gap: 9px;
    padding: 11px 12px;
    background: var(--cd-surface-recessed);
    border-bottom: 1px solid var(--cd-border);
  }
  
  .cd-inline-drawer[hidden] {
    display: none !important;
  }
  
  .cd-vault-security-note {
    display: flex;
    align-items: flex-start;
    gap: 6px;
    padding: 6px 8px;
    border-radius: 7px;
    background: var(--cd-surface-elevated);
    border: 1px solid var(--cd-border-subtle);
    font-size: 11px;
    line-height: 1.35;
    color: var(--cd-ink-secondary);
  }
  
  .cd-vault-security-note svg {
    color: var(--cd-success);
    flex-shrink: 0;
    margin-top: 1px;
  }
  
  .cd-form-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }
  
  .cd-field {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  
  .cd-field.is-full {
    grid-column: 1 / -1;
  }
  
  .cd-field-label {
    font-size: 11px;
    font-weight: 600;
    color: var(--cd-ink-secondary);
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
  }
  
  .cd-key-source-badge {
    font-family: var(--cd-mono);
    font-size: 10px;
    font-weight: 600;
    padding: 1px 5px;
    border-radius: 4px;
    background: var(--cd-success-soft);
    color: var(--cd-success);
  }
  
  .cd-input,
  .cd-select {
    width: 100%;
    padding: 6px 8px;
    border-radius: 7px;
    border: 1px solid var(--cd-border);
    background: var(--cd-surface-elevated);
    color: var(--cd-ink);
    font-family: var(--cd-font);
    font-size: 12px;
  }
  
  .cd-input.is-mono {
    font-family: var(--cd-mono);
    font-size: 11.5px;
  }
  
  .cd-drawer-actions {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }
  
  /* Cross-Environment Feedbacks Inbox Drawer */
  .cd-env-filter-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
    flex-wrap: wrap;
  }
  
  .cd-env-tabs {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    flex-wrap: wrap;
  }
  
  .cd-env-tab {
    appearance: none;
    border: 1px solid var(--cd-border);
    background: var(--cd-surface-elevated);
    color: var(--cd-ink-secondary);
    font-family: var(--cd-mono);
    font-size: 10.5px;
    font-weight: 600;
    padding: 3px 7px;
    border-radius: 6px;
    cursor: pointer;
  }
  
  .cd-env-tab.is-active {
    background: var(--cd-ink);
    border-color: var(--cd-ink);
    color: var(--cd-surface);
  }
  
  .cd-feedbacks-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
    max-height: 210px;
    overflow-y: auto;
  }
  
  .cd-feedback-row {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 7px 9px;
    border-radius: 8px;
    background: var(--cd-surface-elevated);
    border: 1px solid var(--cd-border);
  }
  
  .cd-feedback-row-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
  }
  
  .cd-feedback-row-id {
    font-family: var(--cd-mono);
    font-size: 10.5px;
    font-weight: 600;
    color: var(--cd-accent-hover);
    font-variant-numeric: tabular-nums;
  }
  
  .cd-feedback-row-msg {
    margin: 0;
    font-size: 12px;
    color: var(--cd-ink);
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  
  /* Agent Conversation Stream */
  .cd-agent-stream {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 14px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    background: var(--cd-surface);
    scrollbar-width: thin;
  }
  
  .cd-agent-empty {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 13px;
    background: var(--cd-surface-recessed);
    border: 1px solid var(--cd-border-subtle);
    border-radius: var(--cd-radius-md);
  }
  
  .cd-agent-empty-title {
    margin: 0;
    font-size: 13.5px;
    font-weight: 600;
    color: var(--cd-ink);
  }
  
  .cd-agent-empty-desc {
    margin: 0;
    font-size: 12px;
    color: var(--cd-ink-secondary);
  }
  
  .cd-starter-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  
  .cd-starter-btn {
    appearance: none;
    text-align: left;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 8px 10px;
    border-radius: 8px;
    border: 1px solid var(--cd-border);
    background: var(--cd-surface-elevated);
    color: var(--cd-ink);
    font-family: var(--cd-font);
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    transition: border-color 0.14s ease, background-color 0.14s ease;
  }
  
  .cd-starter-btn:hover {
    border-color: var(--cd-accent);
    background: var(--cd-surface-elevated);
  }
  
  .cd-agent-msg {
    display: flex;
    flex-direction: column;
    gap: 7px;
    max-width: 100%;
  }
  
  .cd-agent-msg.is-user {
    align-self: flex-end;
    max-width: 92%;
    padding: 9px 11px;
    background: var(--cd-surface-elevated);
    border: 1px solid var(--cd-border);
    border-radius: 12px 12px 3px 12px;
  }
  
  .cd-agent-msg.is-assistant {
    align-self: stretch;
    padding: 10px 12px;
    background: var(--cd-surface-recessed);
    border: 1px solid var(--cd-border-subtle);
    border-radius: 12px 12px 12px 3px;
  }
  
  /* Tool Call Trace Rows */
  .cd-tool-traces {
    display: flex;
    flex-direction: column;
    gap: 3px;
    padding-bottom: 6px;
    border-bottom: 1px solid var(--cd-border-subtle);
  }
  
  .cd-tool-trace {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    color: var(--cd-ink-secondary);
  }
  
  .cd-tool-trace-badge {
    font-family: var(--cd-mono);
    font-size: 10px;
    padding: 1px 5px;
    border-radius: 4px;
    background: var(--cd-surface-elevated);
    border: 1px solid var(--cd-border);
    color: var(--cd-ink);
    flex-shrink: 0;
  }
  
  .cd-tool-trace.is-error .cd-tool-trace-badge {
    background: var(--cd-danger-soft);
    border-color: rgba(185, 28, 28, 0.25);
    color: var(--cd-danger);
  }
  
  .cd-tool-trace-summary {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  
  /* Formatted Safe Markdown Body */
  .cd-md-body {
    display: flex;
    flex-direction: column;
    gap: 7px;
    font-size: 13px;
    line-height: 1.5;
    color: var(--cd-ink);
    word-break: break-word;
  }
  
  .cd-md-p {
    margin: 0;
  }
  
  .cd-md-heading {
    margin: 2px 0 0;
    font-size: 13px;
    font-weight: 700;
    color: var(--cd-ink);
  }
  
  .cd-md-list {
    margin: 0;
    padding-left: 18px;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  
  .cd-md-code {
    font-family: var(--cd-mono);
    font-size: 11.5px;
    padding: 1px 5px;
    border-radius: 4px;
    background: var(--cd-surface-elevated);
    border: 1px solid var(--cd-border);
    color: var(--cd-ink);
  }
  
  .cd-md-pre {
    margin: 0;
    padding: 9px 10px;
    border-radius: var(--cd-radius-sm);
    background: var(--cd-ink);
    color: var(--cd-surface);
    overflow-x: auto;
    border: 1px solid rgba(17, 19, 24, 0.2);
  }
  
  .cd-md-code-block {
    font-family: var(--cd-mono);
    font-size: 11.5px;
    line-height: 1.45;
    white-space: pre;
  }
  
  /* Proposed File Edit Diff Cards */
  .cd-diff-card {
    display: flex;
    flex-direction: column;
    border-radius: 10px;
    border: 1px solid var(--cd-border);
    background: var(--cd-surface-elevated);
    overflow: hidden;
    margin-top: 4px;
  }
  
  .cd-diff-card-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 7px 10px;
    background: var(--cd-surface);
    border-bottom: 1px solid var(--cd-border-subtle);
  }
  
  .cd-diff-path-group {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
  }
  
  .cd-diff-path {
    font-family: var(--cd-mono);
    font-size: 11.5px;
    font-weight: 600;
    color: var(--cd-ink);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  
  .cd-diff-stats {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-family: var(--cd-mono);
    font-size: 10.5px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    flex-shrink: 0;
  }
  
  .cd-diff-stat-add {
    color: var(--cd-success);
  }
  
  .cd-diff-stat-del {
    color: var(--cd-danger);
  }
  
  .cd-diff-summary {
    padding: 5px 10px;
    font-size: 11.5px;
    color: var(--cd-ink-secondary);
    border-bottom: 1px solid var(--cd-border-subtle);
  }
  
  .cd-diff-lines {
    font-family: var(--cd-mono);
    font-size: 11px;
    line-height: 1.45;
    max-height: 210px;
    overflow: auto;
    background: var(--cd-surface);
    padding: 4px 0;
  }
  
  .cd-diff-line {
    padding: 0 10px;
    white-space: pre;
  }
  
  .cd-diff-hunk {
    color: var(--cd-accent-hover);
    background: rgba(29, 78, 216, 0.07);
    font-weight: 600;
  }
  
  .cd-diff-add {
    background: var(--cd-success-soft);
    color: var(--cd-success);
  }
  
  .cd-diff-del {
    background: var(--cd-danger-soft);
    color: var(--cd-danger);
  }
  
  .cd-diff-ctx {
    color: var(--cd-ink-secondary);
  }
  
  .cd-diff-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 7px 10px;
    background: var(--cd-surface);
    border-top: 1px solid var(--cd-border-subtle);
  }
  
  .cd-diff-status-pill {
    font-size: 11px;
    font-weight: 600;
    color: var(--cd-ink-secondary);
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }
  
  .cd-diff-status-pill.is-applied {
    color: var(--cd-success);
  }
  
  .cd-diff-status-pill.is-rejected {
    color: var(--cd-danger);
  }
  
  .cd-diff-btn-group {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
  
  .cd-btn-apply {
    background: var(--cd-success);
    border-color: var(--cd-success);
    color: var(--cd-surface-elevated);
    font-weight: 600;
  }
  
  .cd-btn-apply:hover:not(:disabled) {
    background: var(--cd-ink);
    border-color: var(--cd-ink);
  }
  
  .cd-btn-danger-outline {
    color: var(--cd-danger);
    border-color: rgba(185, 28, 28, 0.32);
  }
  
  .cd-btn-danger-outline:hover:not(:disabled) {
    background: var(--cd-danger-soft);
    border-color: var(--cd-danger);
  }
  
  /* Loading Skeleton in Agent Stream */
  @keyframes cd-shimmer {
    0% { opacity: 0.45; }
    50% { opacity: 0.9; }
    100% { opacity: 0.45; }
  }
  
  .cd-agent-thinking {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 10px 12px;
    border-radius: 10px;
    background: var(--cd-surface-recessed);
    border: 1px solid var(--cd-border-subtle);
  }
  
  .cd-thinking-label {
    font-size: 11.5px;
    font-weight: 600;
    color: var(--cd-ink-secondary);
  }
  
  .cd-skeleton-bar {
    height: 8px;
    border-radius: 9999px;
    background: var(--cd-border);
    animation: cd-shimmer 1.3s ease-in-out infinite;
  }
  
  .cd-skeleton-bar.is-short {
    width: 62%;
  }
  
  /* ==========================================================================
     5. SHARED CONTEXT TRAY, STATUS BANNER & PROMPT SHELL
     ========================================================================== */
  
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
  
  /* Merged Smart Component + Surrounding Context Card (Production Smart Mode) */
  .cd-smart-card {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    padding: 7px 8px;
    background: var(--cd-surface-elevated);
    border: 1px solid var(--cd-border);
    border-radius: 10px;
    transition: border-color 0.14s var(--cd-ease);
  }
  
  .cd-smart-card:hover {
    border-color: var(--cd-pin);
  }
  
  .cd-smart-card-thumb {
    width: 52px;
    height: 38px;
    border-radius: 6px;
    object-fit: cover;
    border: 1px solid var(--cd-border);
    background: var(--cd-surface-recessed);
    flex-shrink: 0;
  }
  
  .cd-smart-card-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 34px;
    height: 34px;
    border-radius: 7px;
    background: var(--cd-pin-soft);
    color: var(--cd-pin-hover);
    flex-shrink: 0;
  }
  
  .cd-smart-card-body {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  
  .cd-smart-card-title {
    font-family: var(--cd-font);
    font-size: 12px;
    font-weight: 600;
    color: var(--cd-ink);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  
  .cd-smart-card-sub {
    font-family: var(--cd-font);
    font-size: 11px;
    color: var(--cd-ink-secondary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
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
    transition: background-color 0.12s ease, border-color 0.12s ease, color 0.12s ease;
  }
  
  .cd-btn:hover:not(:disabled) {
    background: var(--cd-surface-recessed);
    border-color: var(--cd-ink-secondary);
  }
  
  .cd-btn.is-active {
    background: var(--cd-accent-soft);
    border-color: rgba(29, 78, 216, 0.35);
    color: var(--cd-accent-hover);
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
  
  @media (max-width: 560px) {
    .cd-composer,
    .cd-compact-bar {
      width: calc(100vw - 20px);
      min-width: 0;
    }
  
    .cd-compact-bar {
      flex-wrap: wrap;
    }
  
    .cd-agent-sidebar {
      width: 100vw !important;
      min-width: 0;
    }
  
    .cd-form-grid {
      grid-template-columns: 1fr;
    }
  }
  
  @media (prefers-reduced-motion: reduce) {
    .cd-book-corner,
    .cd-book-corner-art,
    .cd-corner-flap,
    .cd-drag-pin-head,
    .cd-composer,
    .cd-agent-sidebar,
    .cd-skeleton-bar {
      animation: none !important;
      transition: none !important;
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
  
            buildJsonHeaders(csrfToken               )                         {
      const headers                         = {
        "Content-Type": "application/json",
        Accept: "application/json"
      };
      if (csrfToken) {
        headers["X-CSRF-Token"] = csrfToken;
      }
      return headers;
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
      const makeRequest = async (csrfToken               ) =>
        fetch(`${this.baseUrl}/feedback`, {
          method: "POST",
          credentials: "same-origin",
          headers: this.buildJsonHeaders(csrfToken),
          body: JSON.stringify({ feedback: payload })
        });
  
      return this.executeWithCsrfRetry(makeRequest, "Submission failed");
    }
  
           async fetchAgentStatus()                               {
      const response = await fetch(`${this.baseUrl}/agent/status`, {
        method: "GET",
        credentials: "same-origin",
        headers: {
          Accept: "application/json"
        }
      });
  
      if (!response.ok) {
        const errBody = await response.json().catch(() => ({}));
        throw new Error(
          (errBody                      ).error || `Failed to load agent status (${response.status})`
        );
      }
  
      return (await response.json())                       ;
    }
  
           async saveAgentKeys(payload                        )                                   {
      const makeRequest = async (csrfToken               ) =>
        fetch(`${this.baseUrl}/agent/keys`, {
          method: "POST",
          credentials: "same-origin",
          headers: this.buildJsonHeaders(csrfToken),
          body: JSON.stringify(payload)
        });
  
      return this.executeWithCsrfRetry(makeRequest, "Failed to save BYOK settings");
    }
  
           async deleteAgentKeys(provider         = "all")                                   {
      const makeRequest = async (csrfToken               ) =>
        fetch(`${this.baseUrl}/agent/keys?provider=${encodeURIComponent(provider)}`, {
          method: "DELETE",
          credentials: "same-origin",
          headers: this.buildJsonHeaders(csrfToken)
        });
  
      return this.executeWithCsrfRetry(makeRequest, "Failed to clear BYOK key");
    }
  
           async fetchAgentFeedbacks(
      environment         = "all",
      status         = "new"
    )                                        {
      const qs = `environment=${encodeURIComponent(environment)}&status=${encodeURIComponent(status)}`;
      const response = await fetch(`${this.baseUrl}/agent/feedbacks?${qs}`, {
        method: "GET",
        credentials: "same-origin",
        headers: {
          Accept: "application/json"
        }
      });
  
      if (!response.ok) {
        const errBody = await response.json().catch(() => ({}));
        throw new Error(
          (errBody                      ).error || `Failed to load feedbacks (${response.status})`
        );
      }
  
      return (await response.json())                                ;
    }
  
           async sendAgentChat(payload                         )                             {
      const makeRequest = async (csrfToken               ) =>
        fetch(`${this.baseUrl}/agent/chat`, {
          method: "POST",
          credentials: "same-origin",
          headers: this.buildJsonHeaders(csrfToken),
          body: JSON.stringify(payload)
        });
  
      return this.executeWithCsrfRetry(makeRequest, "Agent request failed");
    }
  
           async applyEdit(editId        )                                      {
      const makeRequest = async (csrfToken               ) =>
        fetch(`${this.baseUrl}/agent/edits/${encodeURIComponent(editId)}/apply`, {
          method: "POST",
          credentials: "same-origin",
          headers: this.buildJsonHeaders(csrfToken)
        });
  
      return this.executeWithCsrfRetry(makeRequest, "Failed to apply file edit");
    }
  
           async rejectEdit(editId        )                                      {
      const makeRequest = async (csrfToken               ) =>
        fetch(`${this.baseUrl}/agent/edits/${encodeURIComponent(editId)}/reject`, {
          method: "POST",
          credentials: "same-origin",
          headers: this.buildJsonHeaders(csrfToken)
        });
  
      return this.executeWithCsrfRetry(makeRequest, "Failed to reject file edit");
    }
  
           async revertEdit(editId        )                                      {
      const makeRequest = async (csrfToken               ) =>
        fetch(`${this.baseUrl}/agent/edits/${encodeURIComponent(editId)}/revert`, {
          method: "POST",
          credentials: "same-origin",
          headers: this.buildJsonHeaders(csrfToken)
        });
  
      return this.executeWithCsrfRetry(makeRequest, "Failed to revert file edit");
    }
  }

  // --- Module: screenshot.ts ---
  function collectRedactionRects(customExcludedSelectors           = [])                         {
    if (typeof document === "undefined" || typeof document.querySelectorAll !== "function") return [];
  
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
    cropRegion                       ,
    options                         
  )                                   {
    if (typeof document === "undefined" || typeof window === "undefined") {
      throw new Error("Screenshot capture is only available in a browser environment.");
    }
  
    const widgets =
      typeof document.querySelectorAll === "function"
        ? (Array.from(document.querySelectorAll("context-drop-widget, [data-context-drop-ui]"))                 )
        : [];
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
      const ctx = typeof canvas.getContext === "function" ? canvas.getContext("2d") : null;
  
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
      const visibleNodes =
        document.body && typeof document.body.querySelectorAll === "function"
          ? Array.from(document.body.querySelectorAll("*"))
          : [];
      for (const node of visibleNodes) {
        if (
          (typeof node.closest === "function" &&
            (node.closest("context-drop-widget") || node.closest("[data-context-drop-ui]"))) ||
          node.hasAttribute("data-context-drop-ui")
        ) {
          continue;
        }
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
  
          // Render leaf text labels so surrounding-context previews are legible
          if (node.children && node.children.length === 0 && typeof ctx.fillText === "function") {
            const text = (node.textContent || "").replace(/\s+/g, " ").trim();
            if (text.length > 0 && r.height >= 10) {
              ctx.fillStyle = style.color || "#111318";
              const fontSize = Math.min(18, Math.max(10, parseFloat(style.fontSize || "12") || 12));
              ctx.font = `${style.fontWeight || "400"} ${Math.round(fontSize)}px sans-serif`;
              ctx.fillText(text.slice(0, 48), rx + 4, ry + Math.min(r.height - 3, fontSize + 3));
            }
          }
        }
      }
  
      // Optional visual callout box highlighting the selected component inside surrounding context
      if (options?.highlightRect) {
        const hr = options.highlightRect;
        const hx = hr.x - region.x;
        const hy = hr.y - region.y;
        ctx.strokeStyle = "#c2410c";
        ctx.lineWidth = 2;
        ctx.strokeRect(
          Math.max(1, hx),
          Math.max(1, hy),
          Math.min(region.width - 2, hr.width),
          Math.min(region.height - 2, hr.height)
        );
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
  
  /**
   * Captures a privacy-redacted screenshot of a selected component together with generous
   * surrounding page context (used automatically in Production "smart" mode) and frames the
   * selected component inside the captured region.
   */
  async function captureSurroundingContextScreenshot(
    element         ,
    padding         = 84,
    customExcludedSelectors           = [],
    elementClientRef         
  )                                   {
    if (isElementExcluded(element, customExcludedSelectors)) {
      throw new Error("Cannot capture screenshot of an excluded or sensitive DOM element.");
    }
  
    const vw = typeof window !== "undefined" ? Math.max(window.innerWidth || 1024, 1) : 1024;
    const vh = typeof window !== "undefined" ? Math.max(window.innerHeight || 768, 1) : 768;
    const r = element.getBoundingClientRect();
    const baseX = r.x ?? r.left ?? 0;
    const baseY = r.y ?? r.top ?? 0;
    const pad = Math.max(32, padding);
  
    // Ensure a comfortable minimum surrounding neighborhood (340x220px) around small controls
    const desiredWidth = Math.min(vw, Math.max(r.width + pad * 2, 340));
    const desiredHeight = Math.min(vh, Math.max(r.height + pad * 2, 220));
    const centerX = baseX + r.width / 2;
    const centerY = baseY + r.height / 2;
  
    const cropX = Math.max(0, Math.min(centerX - desiredWidth / 2, vw - desiredWidth));
    const cropY = Math.max(0, Math.min(centerY - desiredHeight / 2, vh - desiredHeight));
  
    const cropRegion                       = {
      x: cropX,
      y: cropY,
      width: desiredWidth,
      height: desiredHeight
    };
  
    const targetRect                       = {
      x: baseX,
      y: baseY,
      width: r.width,
      height: r.height
    };
  
    const result = await captureViewportScreenshot(customExcludedSelectors, cropRegion, {
      highlightRect: targetRect
    });
    result.metadata.capture_type = "surrounding_context";
    result.metadata.context_padding = pad;
    result.metadata.highlighted_rect = targetRect;
    if (elementClientRef) {
      result.metadata.element_attachment_ref = elementClientRef;
    }
    return result;
  }

  // --- Module: element-picker.ts ---
  const WHEEL_STEP_THRESHOLD = 26;
  const WHEEL_STEP_COOLDOWN_MS = 80;
  const SCRUB_JITTER_LOCK_PX = 28;
  const MAX_VISIBLE_STACK_ROWS = 5;
  
  function isDomElementNode(node         )                  {
    if (!node || typeof node !== "object") return false;
    if (typeof window !== "undefined" && node === window) return false;
    if ((node                         ).nodeType !== 1) return false;
    const tag = ((node                        ).tagName || "").toUpperCase();
    return tag.length > 0 && tag !== "WINDOW";
  }
  
  function formatCandidateLabel(tagName        , selector        )         {
    if (selector.startsWith(tagName)) {
      return selector;
    }
    if (selector.startsWith("#") || selector.startsWith(".")) {
      return `${tagName}${selector}`;
    }
    return selector;
  }
  
  function isPointInsideRect(
    x        ,
    y        ,
    rect                                                                                        ,
    tolerance         = 2
  )          {
    const left = (rect.left ?? rect.x ?? 0) - tolerance;
    const top = (rect.top ?? rect.y ?? 0) - tolerance;
    return x >= left && x <= left + rect.width + tolerance * 2 && y >= top && y <= top + rect.height + tolerance * 2;
  }
  class ElementPicker {
            active          = false;
            suppressCursorPin          = false;
            isScrubbingLayers          = false;
            scrubOriginX         = 0;
            scrubOriginY         = 0;
            lastPointerX         = 0;
            lastPointerY         = 0;
            wheelAccumulator         = 0;
            lastWheelStepAt         = 0;
  
            callbacks                        ;
            overlayEl                        = null;
            leafOutlineEl                        = null;
            hudEl                        = null;
            pinMarkerEl                        = null;
            pinnedMarkersContainerEl                        = null;
            toastEl                        = null;
            previewOverlayEl                        = null;
  
            pulseTimer                                       = null;
            nudgeTimer                                       = null;
            toastTimer                                       = null;
  
            candidateStack                         = [];
            activeCandidateIndex         = 0;
            leafElement                 = null;
            lastAction                                                           = null;
            previousCursor         = "";
  
            boundMouseMove                         ;
            boundClickCapture                         ;
            boundPointerCapture                    ;
            boundBlurSuppression                    ;
            boundWheelCapture                         ;
            boundKeyDown                            ;
            boundScrollOrResize            ;
  
    constructor(callbacks                        ) {
      this.callbacks = callbacks;
      this.boundMouseMove = this.handleMouseMove.bind(this);
      this.boundClickCapture = this.handleClickCapture.bind(this);
      this.boundPointerCapture = this.handlePointerSuppression.bind(this);
      this.boundBlurSuppression = this.handleBlurSuppression.bind(this);
      this.boundWheelCapture = this.handleWheelCapture.bind(this);
      this.boundKeyDown = this.handleKeyDown.bind(this);
      this.boundScrollOrResize = this.handleViewportScrollOrResize.bind(this);
    }
  
           isActive()          {
      return this.active;
    }
  
           isAnchored()          {
      return false;
    }
  
           isScrubbing()          {
      return this.isScrubbingLayers;
    }
  
            isSmartMode()          {
      return (this.callbacks.getSelectionMode ? this.callbacks.getSelectionMode() : "verbose") === "smart";
    }
  
           getActiveCandidate()                              {
      return this.candidateStack[this.activeCandidateIndex] || null;
    }
  
           getCandidateStack()                         {
      return [...this.candidateStack];
    }
  
           start(options                                  )       {
      if (this.active || typeof document === "undefined" || typeof window === "undefined") {
        return;
      }
      this.active = true;
      this.suppressCursorPin = Boolean(options?.suppressCursorPin);
      this.isScrubbingLayers = false;
      this.wheelAccumulator = 0;
      this.lastWheelStepAt = 0;
      this.candidateStack = [];
      this.activeCandidateIndex = 0;
      this.leafElement = null;
      this.lastAction = null;
  
      this.hideExternalPreview();
  
      this.previousCursor = document.body ? document.body.style.cursor : "";
      if (document.body) {
        document.body.style.cursor = this.suppressCursorPin ? "grabbing" : "crosshair";
      }
  
      this.mountSelectionUi();
      this.refreshPinnedMarkers();
      this.notifyStateChange();
  
      window.addEventListener("mousemove", this.boundMouseMove, { capture: true, passive: true });
      window.addEventListener("pointerdown", this.boundPointerCapture, { capture: true });
      window.addEventListener("mousedown", this.boundPointerCapture, { capture: true });
      window.addEventListener("mouseup", this.boundPointerCapture, { capture: true });
      window.addEventListener("click", this.boundClickCapture, { capture: true });
      window.addEventListener("blur", this.boundBlurSuppression, { capture: true });
      window.addEventListener("focusout", this.boundBlurSuppression, { capture: true });
      window.addEventListener("wheel", this.boundWheelCapture, { capture: true, passive: false });
      window.addEventListener("keydown", this.boundKeyDown, { capture: true });
      window.addEventListener("scroll", this.boundScrollOrResize, { capture: true, passive: true });
      window.addEventListener("resize", this.boundScrollOrResize, { passive: true });
    }
  
           stop(options                       )       {
      if (!this.active) return;
      this.active = false;
      this.suppressCursorPin = false;
      this.isScrubbingLayers = false;
      this.wheelAccumulator = 0;
      this.candidateStack = [];
      this.activeCandidateIndex = 0;
      this.leafElement = null;
      this.lastAction = null;
      this.clearTimers();
  
      if (typeof document !== "undefined" && document.body) {
        document.body.style.cursor = this.previousCursor;
      }
  
      if (typeof window !== "undefined") {
        window.removeEventListener("mousemove", this.boundMouseMove, { capture: true });
        window.removeEventListener("pointerdown", this.boundPointerCapture, { capture: true });
        window.removeEventListener("mousedown", this.boundPointerCapture, { capture: true });
        window.removeEventListener("mouseup", this.boundPointerCapture, { capture: true });
        window.removeEventListener("click", this.boundClickCapture, { capture: true });
        window.removeEventListener("blur", this.boundBlurSuppression, { capture: true });
        window.removeEventListener("focusout", this.boundBlurSuppression, { capture: true });
        window.removeEventListener("wheel", this.boundWheelCapture, { capture: true });
        window.removeEventListener("keydown", this.boundKeyDown, { capture: true });
        window.removeEventListener("scroll", this.boundScrollOrResize, { capture: true });
        window.removeEventListener("resize", this.boundScrollOrResize);
      }
  
      this.unmountSelectionUi();
      this.notifyStateChange();
      if (!options?.silent) {
        this.callbacks.onExit();
      }
    }
  
           highlightAtPoint(x        , y        , event        )       {
      if (!this.active || typeof document === "undefined") return;
      this.lastPointerX = x;
      this.lastPointerY = y;
      this.updateCandidatesFromPoint(x, y, event);
      this.updateOverlayPosition();
      this.notifyStateChange();
    }
  
           clearCandidateHighlight()       {
      if (!this.active) return;
      this.leafElement = null;
      this.candidateStack = [];
      this.activeCandidateIndex = 0;
      this.isScrubbingLayers = false;
      if (this.overlayEl) this.overlayEl.style.display = "none";
      if (this.hudEl) this.hudEl.style.display = "none";
      if (this.leafOutlineEl) this.leafOutlineEl.style.display = "none";
      if (this.pinMarkerEl) this.pinMarkerEl.style.display = "none";
      this.notifyStateChange();
    }
  
           commitActiveCandidate(x         , y         )          {
      if (!this.active) return false;
      const candidate = this.getActiveCandidate();
      if (!candidate) return false;
      this.commitCandidateSelection(
        candidate.element,
        x ?? this.lastPointerX ?? 80,
        y ?? this.lastPointerY ?? 80
      );
      return true;
    }
  
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
  
      this.isScrubbingLayers = this.candidateStack.length > 1;
      this.scrubOriginX = this.lastPointerX;
      this.scrubOriginY = this.lastPointerY;
      this.updateOverlayPosition();
      this.notifyStateChange();
    }
  
           selectElementDirectly(el         )          {
      const excluded = this.callbacks.getExcludedSelectors();
      const snapshot = captureElementSnapshot(el, excluded);
      if (!snapshot) return false;
  
      this.callbacks.onSelect(snapshot, el);
      this.lastAction = { kind: "pinned", selector: snapshot.selector };
      this.isScrubbingLayers = false;
      this.refreshPinnedMarkers();
  
      if (!this.callbacks.canSelectMore()) {
        this.stop();
      } else {
        this.updateOverlayPosition();
        this.notifyStateChange();
      }
      return true;
    }
  
           refreshPinnedMarkers()       {
      if (!this.active || !this.pinnedMarkersContainerEl) return;
      this.pinnedMarkersContainerEl.innerHTML = "";
  
      const pinnedEntries = this.callbacks.getPinnedElements ? this.callbacks.getPinnedElements() : [];
      pinnedEntries.forEach((entry, index) => {
        if (!entry.element || typeof entry.element.getBoundingClientRect !== "function") return;
        const rect = entry.element.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return;
  
        const markerFrame = document.createElement("div");
        markerFrame.setAttribute("data-context-drop-ui", "pinned-badge");
        markerFrame.style.cssText = [
          "position: fixed",
          "pointer-events: none",
          `left: ${rect.left}px`,
          `top: ${rect.top}px`,
          `width: ${rect.width}px`,
          `height: ${rect.height}px`,
          "border: 1.5px dashed rgba(194, 65, 12, 0.72)",
          "background: rgba(194, 65, 12, 0.04)",
          "border-radius: 6px"
        ].join(";");
  
        const badge = document.createElement("div");
        const badgeTop = rect.top < 26 ? "4px" : "-22px";
        const smartMode = this.isSmartMode();
        badge.style.cssText = [
          "position: absolute",
          `top: ${badgeTop}`,
          "right: -1px",
          "display: inline-flex",
          "align-items: center",
          "gap: 4px",
          "padding: 2px 7px",
          "border-radius: 9999px",
          "background: #c2410c",
          "color: #faf9f6",
          "border: 1px solid #faf9f6",
          smartMode
            ? "font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
            : "font-family: ui-monospace, SFMono-Regular, Menlo, monospace",
          "font-size: 10px",
          "font-weight: 600",
          "font-variant-numeric: tabular-nums",
          "line-height: 1.2",
          "max-width: 180px",
          "overflow: hidden",
          "text-overflow: ellipsis",
          "white-space: nowrap",
          "box-shadow: 0 4px 10px -2px rgba(17, 19, 24, 0.25)"
        ].join(";");
        badge.textContent = smartMode
          ? entry.friendlyLabel || "Selected area"
          : `#${index + 1} ${entry.selector}`;
  
        markerFrame.appendChild(badge);
        this.pinnedMarkersContainerEl?.appendChild(markerFrame);
      });
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
  
           cycleDepth(delta        , revealStack          = true)       {
      if (!this.active || this.candidateStack.length <= 1) return;
  
      const wasScrubbing = this.isScrubbingLayers;
      if (revealStack) {
        this.isScrubbingLayers = true;
        this.scrubOriginX = this.lastPointerX;
        this.scrubOriginY = this.lastPointerY;
      }
  
      const next = Math.max(
        0,
        Math.min(this.candidateStack.length - 1, this.activeCandidateIndex + delta)
      );
  
      if (next !== this.activeCandidateIndex) {
        this.activeCandidateIndex = next;
        this.updateOverlayPosition();
        this.notifyStateChange();
      } else if (!wasScrubbing && this.isScrubbingLayers) {
        this.updateOverlayPosition();
        this.triggerHudBoundaryNudge(delta < 0 ? -3 : 3);
        this.notifyStateChange();
      } else {
        this.triggerHudBoundaryNudge(delta < 0 ? -3 : 3);
      }
    }
  
            clearTimers()       {
      if (this.pulseTimer !== null) {
        clearTimeout(this.pulseTimer);
        this.pulseTimer = null;
      }
      if (this.nudgeTimer !== null) {
        clearTimeout(this.nudgeTimer);
        this.nudgeTimer = null;
      }
      if (this.toastTimer !== null) {
        clearTimeout(this.toastTimer);
        this.toastTimer = null;
      }
    }
  
            findPinnedIndex(el         )                                                      {
      if (!this.callbacks.getPinnedElements) return null;
      const pinned = this.callbacks.getPinnedElements();
      for (let i = 0; i < pinned.length; i += 1) {
        if (pinned[i].element === el) {
          return { index: i, entry: pinned[i] };
        }
      }
      return null;
    }
  
            notifyStateChange()       {
      if (!this.callbacks.onStateChange) return;
      const activeCandidate = this.getActiveCandidate();
      const ancestors = activeCandidate
        ? resolveAncestorChain(activeCandidate.element, this.callbacks.getExcludedSelectors())
        : [];
      this.callbacks.onStateChange({
        active: this.active,
        anchored: false,
        scrubbing: this.isScrubbingLayers,
        activeCandidate,
        candidateStack: [...this.candidateStack],
        ancestors,
        lastAction: this.lastAction
      });
    }
  
            mountSelectionUi()       {
      if (typeof document === "undefined" || !document.body) return;
  
      const pinnedMarkers = document.createElement("div");
      pinnedMarkers.setAttribute("data-context-drop-ui", "pinned-markers");
      pinnedMarkers.style.cssText = [
        "position: fixed",
        "inset: 0",
        "pointer-events: none",
        "z-index: 2147483643"
      ].join(";");
  
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
        "transition: left 0.06s cubic-bezier(0.22, 1, 0.36, 1), top 0.06s cubic-bezier(0.22, 1, 0.36, 1), width 0.06s cubic-bezier(0.22, 1, 0.36, 1), height 0.06s cubic-bezier(0.22, 1, 0.36, 1), border-color 0.16s ease, background-color 0.16s ease"
      ].join(";");
  
      // Viewport-clamped Floating HUD (Compact 2-line coach on hover, inline 5-row wheel-scrubbed stack on scroll)
      const hud = document.createElement("div");
      hud.setAttribute("data-context-drop-ui", "label");
      hud.style.cssText = [
        "position: fixed",
        "z-index: 2147483646",
        "background: #111318",
        "color: #faf9f6",
        "border: 1px solid rgba(250, 249, 246, 0.16)",
        "border-radius: 10px",
        "pointer-events: none",
        "display: none",
        "overflow: hidden",
        "font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
        "font-size: 11.5px",
        "line-height: 1.35",
        "box-shadow: 0 16px 34px -8px rgba(17, 19, 24, 0.40), 0 6px 14px -4px rgba(17, 19, 24, 0.22)",
        "transition: transform 0.12s cubic-bezier(0.22, 1, 0.36, 1)"
      ].join(";");
  
      // Floating Pin marker that follows the pointer
      const pinMarker = document.createElement("div");
      pinMarker.setAttribute("data-context-drop-ui", "pin-marker");
      pinMarker.style.cssText = [
        "position: fixed",
        "pointer-events: none",
        "z-index: 2147483647",
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
  
      // Tactile floating confirmation pill near cursor on pin / unpin
      const toast = document.createElement("div");
      toast.setAttribute("data-context-drop-ui", "pin-toast");
      toast.style.cssText = [
        "position: fixed",
        "pointer-events: none",
        "z-index: 2147483647",
        "display: none",
        "align-items: center",
        "gap: 6px",
        "padding: 6px 10px",
        "border-radius: 9999px",
        "background: #111318",
        "color: #faf9f6",
        "border: 1px solid rgba(250, 249, 246, 0.18)",
        "font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
        "font-size: 11.5px",
        "font-weight: 500",
        "white-space: nowrap",
        "box-shadow: 0 12px 24px -6px rgba(17, 19, 24, 0.34)"
      ].join(";");
  
      document.body.appendChild(pinnedMarkers);
      document.body.appendChild(leafOutline);
      document.body.appendChild(overlay);
      document.body.appendChild(hud);
      document.body.appendChild(pinMarker);
      document.body.appendChild(toast);
  
      this.pinnedMarkersContainerEl = pinnedMarkers;
      this.leafOutlineEl = leafOutline;
      this.overlayEl = overlay;
      this.hudEl = hud;
      this.pinMarkerEl = pinMarker;
      this.toastEl = toast;
    }
  
            unmountSelectionUi()       {
      for (const el of [
        this.pinnedMarkersContainerEl,
        this.leafOutlineEl,
        this.overlayEl,
        this.hudEl,
        this.pinMarkerEl,
        this.toastEl
      ]) {
        if (el && el.parentNode) {
          el.parentNode.removeChild(el);
        }
      }
      this.pinnedMarkersContainerEl = null;
      this.leafOutlineEl = null;
      this.overlayEl = null;
      this.hudEl = null;
      this.pinMarkerEl = null;
      this.toastEl = null;
    }
  
            isInternalUiEvent(event       )          {
      const path = typeof event.composedPath === "function" ? event.composedPath() : [];
      for (const node of path) {
        if (isDomElementNode(node)) {
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
      const rawTarget = isDomElementNode(event.target) ? event.target : null;
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
            if (isDomElementNode(el)) {
              results.push(el);
            }
          }
        } catch {
          // Fallback to composedPath below
        }
      }
      if (event && typeof event.composedPath === "function") {
        for (const node of event.composedPath()) {
          if (isDomElementNode(node) && !results.includes(node)) {
            results.push(node);
          }
        }
      }
      if (event && isDomElementNode(event.target) && !results.includes(event.target)) {
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
        this.isScrubbingLayers = false;
        return;
      }
  
      if (this.isSmartMode()) {
        const smartComponent = resolveSmartComponent(primary, excluded) || primary;
        if (
          this.leafElement === primary &&
          this.candidateStack.length === 1 &&
          this.candidateStack[0].element === smartComponent
        ) {
          return;
        }
        this.leafElement = primary;
        this.candidateStack = [describeElementCandidate(smartComponent, "target", 0, excluded)];
        this.activeCandidateIndex = 0;
        this.isScrubbingLayers = false;
        return;
      }
  
      // Preserve depth & inline stack when pointer stays inside the exact same primary leaf element
      if (this.leafElement === primary && this.candidateStack.length > 0) {
        return;
      }
  
      // Pointer-jitter lock: if user scrubbed to a specific layer and nudges the mouse slightly (<=28px)
      // across child boundaries inside that selected element right before clicking, keep it locked.
      if (this.isScrubbingLayers && this.candidateStack.length > 0) {
        const lockedCandidate = this.getActiveCandidate();
        const travel = Math.hypot(clientX - this.scrubOriginX, clientY - this.scrubOriginY);
        if (
          lockedCandidate &&
          travel <= SCRUB_JITTER_LOCK_PX &&
          (pointElements.includes(lockedCandidate.element) ||
            isPointInsideRect(clientX, clientY, lockedCandidate.element.getBoundingClientRect()))
        ) {
          return;
        }
      }
  
      this.leafElement = primary;
      this.candidateStack = resolveCandidateStack(primary, pointElements, excluded, 10);
      this.activeCandidateIndex = 0;
      this.isScrubbingLayers = false;
    }
  
            handleViewportScrollOrResize()       {
      this.refreshPinnedMarkers();
      this.updateOverlayPosition();
    }
  
            handleMouseMove(event            )       {
      if (!this.active) return;
  
      this.lastPointerX = event.clientX;
      this.lastPointerY = event.clientY;
  
      if (this.isInternalUiEvent(event)) {
        if (this.overlayEl) this.overlayEl.style.display = "none";
        if (this.hudEl) this.hudEl.style.display = "none";
        if (this.leafOutlineEl) this.leafOutlineEl.style.display = "none";
        if (this.pinMarkerEl) this.pinMarkerEl.style.display = "none";
        return;
      }
  
      if (this.pinMarkerEl) {
        if (this.suppressCursorPin) {
          this.pinMarkerEl.style.display = "none";
        } else {
          this.pinMarkerEl.style.display = "inline-flex";
          this.pinMarkerEl.style.left = `${event.clientX}px`;
          this.pinMarkerEl.style.top = `${event.clientY}px`;
        }
      }
  
      this.updateCandidatesFromPoint(event.clientX, event.clientY, event);
      this.updateOverlayPosition();
      this.notifyStateChange();
    }
  
            createSpanEl(text        )                  {
      const span = document.createElement("span");
      span.textContent = text;
      return span;
    }
  
            createKbdEl(text        )              {
      const kbd = document.createElement("kbd");
      kbd.textContent = text;
      kbd.style.cssText = [
        "font-family: ui-monospace, SFMono-Regular, Menlo, monospace",
        "font-size: 10px",
        "font-weight: 600",
        "line-height: 1.1",
        "padding: 1px 4px",
        "border-radius: 4px",
        "background: rgba(250, 249, 246, 0.14)",
        "border: 1px solid rgba(250, 249, 246, 0.24)",
        "color: #faf9f6"
      ].join(";");
      return kbd;
    }
  
            renderSmartHudContent(currentCandidate                      )       {
      if (!this.hudEl) return;
      this.hudEl.innerHTML = "";
      this.hudEl.style.width = "auto";
      this.hudEl.style.maxWidth = "min(360px, calc(100vw - 20px))";
      this.hudEl.style.borderRadius = "9999px";
  
      const pinnedInfo = this.findPinnedIndex(currentCandidate.element);
      const pill = document.createElement("div");
      pill.setAttribute("data-context-drop-ui", "smart-hud-pill");
      pill.style.cssText = [
        "display: inline-flex",
        "align-items: center",
        "gap: 7px",
        "padding: 6px 12px",
        "white-space: nowrap"
      ].join(";");
  
      const iconDot = document.createElement("span");
      iconDot.style.cssText = [
        "display: inline-flex",
        "align-items: center",
        "justify-content: center",
        "width: 14px",
        "height: 14px",
        "color: #ffedd5",
        "flex-shrink: 0"
      ].join(";");
      iconDot.innerHTML = ICON_PIN;
      pill.appendChild(iconDot);
  
      const nameSpan = document.createElement("span");
      nameSpan.textContent = currentCandidate.friendlyLabel || "Page area";
      nameSpan.style.cssText = [
        "font-size: 12px",
        "font-weight: 600",
        "color: #faf9f6",
        "max-width: 210px",
        "overflow: hidden",
        "text-overflow: ellipsis",
        "white-space: nowrap"
      ].join(";");
      pill.appendChild(nameSpan);
  
      const actionHint = document.createElement("span");
      actionHint.textContent = this.suppressCursorPin
        ? pinnedInfo
          ? "· Release to remove"
          : "· Release to select"
        : pinnedInfo
          ? "· Click to remove"
          : "· Click to select";
      actionHint.style.cssText = "font-size: 11px; color: #cbd5e1; flex-shrink: 0;";
      pill.appendChild(actionHint);
  
      this.hudEl.appendChild(pill);
    }
  
            renderCompactHudContent(
      currentCandidate                      ,
      rect                                   
    )       {
      if (!this.hudEl) return;
      this.hudEl.innerHTML = "";
      this.hudEl.style.width = "auto";
      this.hudEl.style.maxWidth = "min(440px, calc(100vw - 20px))";
      this.hudEl.style.borderRadius = "10px";
  
      const total = this.candidateStack.length;
      const pos = this.activeCandidateIndex + 1;
      const dims = `${Math.round(rect.width)}×${Math.round(rect.height)}`;
      const pinnedInfo = this.findPinnedIndex(currentCandidate.element);
      const hasOverlap = this.candidateStack.some((c) => c.relation === "overlap");
  
      // Top Row: Identity + Dimensions + Layer Count
      const topRow = document.createElement("div");
      topRow.style.cssText = [
        "display: flex",
        "align-items: center",
        "gap: 6px",
        "padding: 6px 9px 5px",
        "white-space: nowrap"
      ].join(";");
  
      if (pinnedInfo) {
        const pinnedPill = document.createElement("span");
        pinnedPill.textContent = `#${pinnedInfo.index + 1} Pinned`;
        pinnedPill.style.cssText = [
          "padding: 1px 5px",
          "border-radius: 4px",
          "background: #c2410c",
          "color: #faf9f6",
          "font-family: ui-monospace, SFMono-Regular, Menlo, monospace",
          "font-size: 10px",
          "font-weight: 700",
          "font-variant-numeric: tabular-nums",
          "flex-shrink: 0"
        ].join(";");
        topRow.appendChild(pinnedPill);
      }
  
      const selectorSpan = document.createElement("span");
      selectorSpan.textContent = formatCandidateLabel(
        currentCandidate.tagName,
        currentCandidate.selector
      );
      selectorSpan.style.cssText = [
        "font-family: ui-monospace, SFMono-Regular, Menlo, monospace",
        "font-size: 11.5px",
        "font-weight: 600",
        "color: #faf9f6",
        "max-width: 230px",
        "overflow: hidden",
        "text-overflow: ellipsis",
        "white-space: nowrap"
      ].join(";");
      topRow.appendChild(selectorSpan);
  
      const dimsSpan = document.createElement("span");
      dimsSpan.textContent = dims;
      dimsSpan.style.cssText = [
        "font-family: ui-monospace, SFMono-Regular, Menlo, monospace",
        "font-size: 10.5px",
        "font-variant-numeric: tabular-nums",
        "color: #cbd5e1",
        "flex-shrink: 0"
      ].join(";");
      topRow.appendChild(dimsSpan);
  
      if (total > 1) {
        const layerPill = document.createElement("span");
        layerPill.style.cssText = [
          "display: inline-flex",
          "align-items: center",
          "gap: 3px",
          "padding: 1px 6px",
          "border-radius: 9999px",
          "background: rgba(29, 78, 216, 0.36)",
          "border: 1px solid rgba(96, 165, 250, 0.45)",
          "color: #dbeafe",
          "font-family: ui-monospace, SFMono-Regular, Menlo, monospace",
          "font-size: 10px",
          "font-weight: 600",
          "font-variant-numeric: tabular-nums",
          "flex-shrink: 0"
        ].join(";");
        const iconWrap = document.createElement("span");
        iconWrap.style.cssText = "display: inline-flex; width: 11px; height: 11px; align-items: center;";
        iconWrap.innerHTML = ICON_LAYERS;
        const countText = document.createElement("span");
        countText.textContent = `${pos}/${total}`;
        layerPill.appendChild(iconWrap);
        layerPill.appendChild(countText);
        topRow.appendChild(layerPill);
      }
  
      this.hudEl.appendChild(topRow);
  
      // Bottom Row: Action Coaching Strip
      const coachRow = document.createElement("div");
      coachRow.style.cssText = [
        "display: flex",
        "align-items: center",
        "gap: 8px",
        "padding: 4px 9px 5px",
        "background: rgba(250, 249, 246, 0.05)",
        "border-top: 1px solid rgba(250, 249, 246, 0.10)",
        "font-size: 10.5px",
        "color: #cbd5e1",
        "white-space: nowrap"
      ].join(";");
  
      const clickHint = document.createElement("span");
      clickHint.style.cssText = "display: inline-flex; align-items: center; gap: 4px;";
      if (this.suppressCursorPin) {
        const releaseStrong = document.createElement("strong");
        releaseStrong.style.cssText = pinnedInfo
          ? "color: #ffedd5; font-weight: 600;"
          : "color: #faf9f6; font-weight: 600;";
        releaseStrong.textContent = "Release";
        clickHint.appendChild(releaseStrong);
        clickHint.appendChild(this.createSpanEl(pinnedInfo ? " to unpin" : " to pin"));
      } else {
        clickHint.appendChild(this.createKbdEl("Space"));
        clickHint.appendChild(this.createSpanEl("or"));
        const clickStrong = document.createElement("strong");
        clickStrong.style.cssText = pinnedInfo
          ? "color: #ffedd5; font-weight: 600;"
          : "color: #faf9f6; font-weight: 600;";
        clickStrong.textContent = "Click";
        clickHint.appendChild(clickStrong);
        clickHint.appendChild(this.createSpanEl(pinnedInfo ? " to unpin" : " to pin"));
      }
      coachRow.appendChild(clickHint);
  
      if (total > 1) {
        const scrollHint = document.createElement("span");
        scrollHint.style.cssText = "display: inline-flex; align-items: center; gap: 3px;";
        const wheelIcon = document.createElement("span");
        wheelIcon.style.cssText = "display: inline-flex; color: #dbeafe;";
        wheelIcon.innerHTML = ICON_SCROLL_VERTICAL;
        const scrollStrong = document.createElement("strong");
        scrollStrong.style.cssText = hasOverlap
          ? "color: #dbeafe; font-weight: 600;"
          : "color: #faf9f6; font-weight: 600;";
        scrollStrong.textContent = "Scroll wheel";
        scrollHint.appendChild(wheelIcon);
        scrollHint.appendChild(scrollStrong);
        scrollHint.appendChild(
          this.createSpanEl(hasOverlap ? " for element behind" : ` for ${total} layers`)
        );
        coachRow.appendChild(scrollHint);
      }
  
      const escHint = document.createElement("span");
      escHint.style.cssText = "display: inline-flex; align-items: center; gap: 4px;";
      escHint.appendChild(this.createKbdEl("⌥⇧P"));
      escHint.appendChild(this.createSpanEl("freeze · "));
      escHint.appendChild(this.createKbdEl("Esc"));
      escHint.appendChild(this.createSpanEl("done"));
      coachRow.appendChild(escHint);
  
      this.hudEl.appendChild(coachRow);
    }
  
            renderScrubbingHudContent(
      currentCandidate                      ,
      rect                                   
    )       {
      if (!this.hudEl) return;
      this.hudEl.innerHTML = "";
      this.hudEl.style.width = "320px";
      this.hudEl.style.maxWidth = "calc(100vw - 20px)";
  
      const total = this.candidateStack.length;
      const pos = this.activeCandidateIndex + 1;
  
      // Header Strip
      const header = document.createElement("div");
      header.style.cssText = [
        "display: flex",
        "align-items: center",
        "justify-content: space-between",
        "gap: 8px",
        "padding: 6px 10px",
        "background: rgba(250, 249, 246, 0.05)",
        "border-bottom: 1px solid rgba(250, 249, 246, 0.12)"
      ].join(";");
  
      const headerLeft = document.createElement("div");
      headerLeft.style.cssText =
        "display: inline-flex; align-items: center; gap: 5px; font-size: 11px; font-weight: 600; color: #faf9f6;";
      const layersIcon = document.createElement("span");
      layersIcon.style.cssText = "display: inline-flex; color: #60a5fa;";
      layersIcon.innerHTML = ICON_LAYERS;
      const headerTitle = document.createElement("span");
      headerTitle.textContent = "Select Layer";
      headerLeft.appendChild(layersIcon);
      headerLeft.appendChild(headerTitle);
  
      const headerRight = document.createElement("div");
      headerRight.style.cssText =
        "display: inline-flex; align-items: center; gap: 5px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 10.5px; font-variant-numeric: tabular-nums; color: #cbd5e1;";
      const wheelSpan = document.createElement("span");
      wheelSpan.style.cssText = "display: inline-flex; color: #dbeafe;";
      wheelSpan.innerHTML = ICON_SCROLL_VERTICAL;
      const ratioSpan = document.createElement("span");
      ratioSpan.textContent = `${pos}/${total}`;
      headerRight.appendChild(wheelSpan);
      headerRight.appendChild(ratioSpan);
  
      header.appendChild(headerLeft);
      header.appendChild(headerRight);
      this.hudEl.appendChild(header);
  
      // Non-scrolling Sliding Window of Layers (max 5 rows)
      const start =
        total <= MAX_VISIBLE_STACK_ROWS
          ? 0
          : Math.max(0, Math.min(this.activeCandidateIndex - 2, total - MAX_VISIBLE_STACK_ROWS));
      const end = Math.min(total, start + MAX_VISIBLE_STACK_ROWS);
  
      const listWrap = document.createElement("div");
      listWrap.setAttribute("data-context-drop-ui", "hud-layer-list");
      listWrap.style.cssText = [
        "display: flex",
        "flex-direction: column",
        "gap: 2px",
        "padding: 5px"
      ].join(";");
  
      if (start > 0) {
        const aboveHint = document.createElement("div");
        aboveHint.textContent = `${start} inner layer${start > 1 ? "s" : ""} above`;
        aboveHint.style.cssText =
          "font-size: 10px; color: #cbd5e1; padding: 1px 7px; font-variant-numeric: tabular-nums;";
        listWrap.appendChild(aboveHint);
      }
  
      const relationLabels                         = {
        target: "Topmost",
        overlap: "Behind",
        child: "Child",
        ancestor: "Parent"
      };
  
      for (let idx = start; idx < end; idx += 1) {
        const candidate = this.candidateStack[idx];
        const isSelected = idx === this.activeCandidateIndex;
        const candPinned = this.findPinnedIndex(candidate.element);
  
        const row = document.createElement("div");
        row.setAttribute("data-context-drop-layer-index", String(idx));
        if (isSelected) {
          row.setAttribute("data-selected", "true");
        }
        row.style.cssText = [
          "display: flex",
          "align-items: center",
          "justify-content: space-between",
          "gap: 6px",
          "padding: " + (isSelected ? "5px 7px" : "4px 7px"),
          "border-radius: 7px",
          "border: 1px solid " + (isSelected ? "#60a5fa" : "transparent"),
          "background: " + (isSelected ? "rgba(29, 78, 216, 0.34)" : "transparent")
        ].join(";");
  
        const leftGroup = document.createElement("div");
        leftGroup.style.cssText = "display: flex; align-items: center; gap: 5px; min-width: 0; flex: 1;";
  
        const relBadge = document.createElement("span");
        relBadge.textContent = relationLabels[candidate.relation] || "Layer";
        const relBg =
          candidate.relation === "target"
            ? "rgba(255, 237, 213, 0.16)"
            : candidate.relation === "overlap"
              ? "rgba(252, 231, 243, 0.20)"
              : "rgba(226, 232, 240, 0.14)";
        const relColor =
          candidate.relation === "target"
            ? "#ffedd5"
            : candidate.relation === "overlap"
              ? "#fee2e2"
              : "#cbd5e1";
        relBadge.style.cssText = [
          "font-size: 9.5px",
          "font-weight: 600",
          "padding: 1px 5px",
          "border-radius: 4px",
          `background: ${relBg}`,
          `color: ${relColor}`,
          "flex-shrink: 0"
        ].join(";");
  
        const selText = document.createElement("span");
        selText.textContent = formatCandidateLabel(candidate.tagName, candidate.selector);
        selText.style.cssText = [
          "font-family: ui-monospace, SFMono-Regular, Menlo, monospace",
          "font-size: 11px",
          "font-weight: " + (isSelected ? "600" : "500"),
          "color: " + (isSelected ? "#faf9f6" : "#e2e8f0"),
          "overflow: hidden",
          "text-overflow: ellipsis",
          "white-space: nowrap"
        ].join(";");
  
        leftGroup.appendChild(relBadge);
        leftGroup.appendChild(selText);
  
        if (candPinned) {
          const pinTag = document.createElement("span");
          pinTag.textContent = `#${candPinned.index + 1}`;
          pinTag.style.cssText = [
            "padding: 0 4px",
            "border-radius: 4px",
            "background: #c2410c",
            "color: #faf9f6",
            "font-family: ui-monospace, SFMono-Regular, Menlo, monospace",
            "font-size: 9.5px",
            "font-weight: 700",
            "flex-shrink: 0"
          ].join(";");
          leftGroup.appendChild(pinTag);
        }
  
        row.appendChild(leftGroup);
  
        if (isSelected) {
          const actionBadge = document.createElement("span");
          actionBadge.textContent = candPinned ? "Click unpin" : "Click to pin";
          actionBadge.style.cssText = [
            "padding: 1px 6px",
            "border-radius: 4px",
            "background: " + (candPinned ? "rgba(250, 249, 246, 0.18)" : "#c2410c"),
            "color: #faf9f6",
            "font-size: 10px",
            "font-weight: 600",
            "flex-shrink: 0"
          ].join(";");
          row.appendChild(actionBadge);
        } else {
          const rowDims = document.createElement("span");
          rowDims.textContent = `${Math.round(candidate.rect.width)}×${Math.round(candidate.rect.height)}`;
          rowDims.style.cssText = [
            "font-family: ui-monospace, SFMono-Regular, Menlo, monospace",
            "font-size: 10px",
            "font-variant-numeric: tabular-nums",
            "color: #cbd5e1",
            "flex-shrink: 0"
          ].join(";");
          row.appendChild(rowDims);
        }
  
        listWrap.appendChild(row);
      }
  
      if (end < total) {
        const belowHint = document.createElement("div");
        belowHint.textContent = `${total - end} parent layer${total - end > 1 ? "s" : ""} below`;
        belowHint.style.cssText =
          "font-size: 10px; color: #cbd5e1; padding: 1px 7px; font-variant-numeric: tabular-nums;";
        listWrap.appendChild(belowHint);
      }
  
      this.hudEl.appendChild(listWrap);
  
      // Footer Strip
      const footer = document.createElement("div");
      footer.style.cssText = [
        "display: flex",
        "align-items: center",
        "justify-content: space-between",
        "gap: 8px",
        "padding: 5px 10px",
        "background: rgba(250, 249, 246, 0.04)",
        "border-top: 1px solid rgba(250, 249, 246, 0.10)",
        "font-size: 10.5px",
        "color: #cbd5e1"
      ].join(";");
  
      const dimsLabel = document.createElement("span");
      dimsLabel.textContent = `${Math.round(rect.width)}×${Math.round(rect.height)}`;
      dimsLabel.style.cssText =
        "font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 10px; font-variant-numeric: tabular-nums;";
  
      const keysHint = document.createElement("span");
      keysHint.style.cssText = "display: inline-flex; align-items: center; gap: 4px;";
      keysHint.appendChild(this.createKbdEl("Space"));
      keysHint.appendChild(this.createSpanEl("pin · "));
      keysHint.appendChild(this.createKbdEl("⌥⇧P"));
      keysHint.appendChild(this.createSpanEl("freeze · "));
      keysHint.appendChild(this.createKbdEl("Esc"));
      keysHint.appendChild(this.createSpanEl("done"));
  
      footer.appendChild(dimsLabel);
      footer.appendChild(keysHint);
      this.hudEl.appendChild(footer);
    }
  
            positionHudElement(rect                                                              )       {
      if (!this.hudEl || typeof window === "undefined") return;
  
      const vw = window.innerWidth || 1024;
      const vh = window.innerHeight || 768;
      const fallbackWidth = this.isScrubbingLayers ? 320 : 300;
      const visibleRows = Math.min(this.candidateStack.length, MAX_VISIBLE_STACK_ROWS);
      const fallbackHeight = this.isScrubbingLayers ? 66 + visibleRows * 30 : 54;
  
      const hudWidth = (this.hudEl                                       ).offsetWidth || fallbackWidth;
      const hudHeight = (this.hudEl                                        ).offsetHeight || fallbackHeight;
  
      const clampedLeft = Math.max(10, Math.min(rect.left, vw - hudWidth - 10));
      let top = rect.top - hudHeight - 8;
  
      if (top < 10) {
        const belowTop = rect.top + rect.height + 8;
        if (belowTop + hudHeight <= vh - 10) {
          top = belowTop;
        } else {
          // Large container spanning viewport: place near top-left of visible area, stepping below cursor if close
          const insideTop = Math.max(10, rect.top + 8);
          if (
            Math.abs(this.lastPointerY - insideTop) < hudHeight + 18 &&
            this.lastPointerX < clampedLeft + hudWidth + 24
          ) {
            top = Math.min(vh - hudHeight - 10, this.lastPointerY + 22);
          } else {
            top = insideTop;
          }
        }
      }
  
      this.hudEl.style.left = `${Math.round(clampedLeft)}px`;
      this.hudEl.style.top = `${Math.round(Math.max(10, top))}px`;
    }
  
            updateOverlayPosition()       {
      if (!this.overlayEl || !this.hudEl) return;
  
      const currentCandidate = this.getActiveCandidate();
      if (!currentCandidate) {
        this.overlayEl.style.display = "none";
        this.hudEl.style.display = "none";
        if (this.leafOutlineEl) this.leafOutlineEl.style.display = "none";
        return;
      }
  
      const rect = currentCandidate.element.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) {
        this.overlayEl.style.display = "none";
        this.hudEl.style.display = "none";
        return;
      }
  
      this.overlayEl.style.display = "block";
      this.overlayEl.style.left = `${rect.left}px`;
      this.overlayEl.style.top = `${rect.top}px`;
      this.overlayEl.style.width = `${rect.width}px`;
      this.overlayEl.style.height = `${rect.height}px`;
  
      this.hudEl.style.display = "block";
      if (this.isSmartMode()) {
        this.renderSmartHudContent(currentCandidate);
      } else if (this.isScrubbingLayers && this.candidateStack.length > 1) {
        this.hudEl.style.borderRadius = "10px";
        this.renderScrubbingHudContent(currentCandidate, rect);
      } else {
        this.renderCompactHudContent(currentCandidate, rect);
      }
      this.positionHudElement(rect);
  
      // Show ghost leaf outline only in verbose inspector mode when inspecting an ancestor/overlap layer
      if (this.leafOutlineEl) {
        if (
          !this.isSmartMode() &&
          this.activeCandidateIndex > 0 &&
          this.leafElement &&
          this.leafElement !== currentCandidate.element
        ) {
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
  
            triggerHudBoundaryNudge(offsetY        )       {
      if (!this.hudEl) return;
      this.hudEl.style.transform = `translateY(${offsetY}px)`;
      if (this.nudgeTimer !== null) {
        clearTimeout(this.nudgeTimer);
      }
      this.nudgeTimer = setTimeout(() => {
        if (this.hudEl) {
          this.hudEl.style.transform = "translateY(0)";
        }
        this.nudgeTimer = null;
      }, 120);
    }
  
            flashSelectionPulse(kind                       )       {
      if (!this.overlayEl) return;
      if (kind === "pinned") {
        this.overlayEl.style.borderColor = "#15803d";
        this.overlayEl.style.background = "rgba(21, 128, 61, 0.14)";
      } else {
        this.overlayEl.style.borderColor = "#c2410c";
        this.overlayEl.style.background = "rgba(194, 65, 12, 0.12)";
      }
      if (this.pulseTimer !== null) {
        clearTimeout(this.pulseTimer);
      }
      this.pulseTimer = setTimeout(() => {
        if (this.overlayEl) {
          this.overlayEl.style.borderColor = "#1d4ed8";
          this.overlayEl.style.background = "rgba(29, 78, 216, 0.10)";
        }
        this.pulseTimer = null;
      }, 280);
    }
  
            showCursorToast(selector        , kind                       , x        , y        )       {
      if (!this.toastEl || typeof window === "undefined") return;
      this.toastEl.innerHTML = "";
  
      const iconBadge = document.createElement("span");
      iconBadge.style.cssText = [
        "display: inline-flex",
        "align-items: center",
        "justify-content: center",
        "width: 16px",
        "height: 16px",
        "border-radius: 9999px",
        "background: " + (kind === "pinned" ? "#15803d" : "#4b5262"),
        "color: #faf9f6",
        "flex-shrink: 0"
      ].join(";");
      iconBadge.innerHTML = ICON_CHECK;
      this.toastEl.appendChild(iconBadge);
  
      const primaryText = document.createElement("span");
      primaryText.textContent = kind === "pinned" ? "Pinned " : "Removed ";
      this.toastEl.appendChild(primaryText);
  
      const monoSel = document.createElement("span");
      monoSel.textContent = selector;
      monoSel.style.cssText =
        "font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11px; font-weight: 600; color: #faf9f6; max-width: 160px; overflow: hidden; text-overflow: ellipsis;";
      this.toastEl.appendChild(monoSel);
  
      if (kind === "pinned") {
        const nextHint = document.createElement("span");
        nextHint.style.cssText =
          "display: inline-flex; align-items: center; gap: 4px; color: #cbd5e1; font-size: 10.5px; margin-left: 2px;";
        nextHint.appendChild(this.createSpanEl("· Click more or"));
        nextHint.appendChild(this.createKbdEl("Esc"));
        this.toastEl.appendChild(nextHint);
      }
  
      this.toastEl.style.display = "inline-flex";
      const vw = window.innerWidth || 1024;
      const vh = window.innerHeight || 768;
      const left = Math.max(10, Math.min(x + 14, vw - 310));
      const top = Math.max(10, Math.min(y + 16, vh - 44));
      this.toastEl.style.left = `${Math.round(left)}px`;
      this.toastEl.style.top = `${Math.round(top)}px`;
  
      if (this.toastTimer !== null) {
        clearTimeout(this.toastTimer);
      }
      this.toastTimer = setTimeout(() => {
        if (this.toastEl) {
          this.toastEl.style.display = "none";
        }
        this.toastTimer = null;
      }, 1450);
    }
  
            commitCandidateSelection(el         , x        , y        )       {
      const smartMode = this.isSmartMode();
      const existingPinned = this.findPinnedIndex(el);
      if (existingPinned && this.callbacks.onUnselect) {
        this.callbacks.onUnselect(existingPinned.entry.clientRef, el);
        this.lastAction = { kind: "unpinned", selector: existingPinned.entry.selector };
        this.isScrubbingLayers = false;
        this.refreshPinnedMarkers();
        this.flashSelectionPulse("unpinned");
        if (!smartMode) {
          this.showCursorToast(existingPinned.entry.selector, "unpinned", x, y);
        }
        this.updateOverlayPosition();
        this.notifyStateChange();
        return;
      }
  
      const excluded = this.callbacks.getExcludedSelectors();
      const extraMeta                          = {
        selection_mode: smartMode ? "smart" : "verbose"
      };
      if (smartMode && this.leafElement && this.leafElement !== el) {
        extraMeta.original_target_selector = computeSelector(this.leafElement);
      }
      const snapshot = captureElementSnapshot(el, excluded, undefined, extraMeta);
      if (!snapshot) return;
  
      this.callbacks.onSelect(snapshot, el);
      this.lastAction = { kind: "pinned", selector: snapshot.selector };
      this.isScrubbingLayers = false;
      this.refreshPinnedMarkers();
  
      // In Production ("smart") click-select mode, immediately return to the quick feedback card
      // instead of keeping the user inside a multi-pin inspector loop.
      if ((smartMode && !this.suppressCursorPin) || !this.callbacks.canSelectMore()) {
        this.stop();
        return;
      }
  
      this.flashSelectionPulse("pinned");
      if (!smartMode) {
        this.showCursorToast(snapshot.selector, "pinned", x, y);
      }
      this.updateOverlayPosition();
      this.notifyStateChange();
    }
  
            handleWheelCapture(event            )       {
      if (!this.active) return;
      if (this.isSmartMode()) return;
      if (this.isInternalUiEvent(event)) return;
      if (event.altKey || event.ctrlKey || event.metaKey) return;
  
      if (this.candidateStack.length <= 1) {
        return;
      }
  
      event.preventDefault();
      event.stopPropagation();
  
      const normalizedDelta = event.deltaMode === 1 ? event.deltaY * 32 : event.deltaY;
      if (normalizedDelta === 0) return;
  
      // Reset accumulator immediately when the user reverses scroll direction
      if (this.wheelAccumulator * normalizedDelta < 0) {
        this.wheelAccumulator = 0;
      }
  
      this.wheelAccumulator += normalizedDelta;
      if (Math.abs(this.wheelAccumulator) < WHEEL_STEP_THRESHOLD) {
        return;
      }
  
      const now = Date.now();
      if (now - this.lastWheelStepAt < WHEEL_STEP_COOLDOWN_MS) {
        this.wheelAccumulator = 0;
        return;
      }
  
      const step = this.wheelAccumulator > 0 ? 1 : -1;
      this.wheelAccumulator = 0;
      this.lastWheelStepAt = now;
      this.cycleDepth(step, true);
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
  
            handleBlurSuppression(event       )       {
      if (!this.active) return;
      if (this.isInternalUiEvent(event)) {
        return;
      }
  
      // Freeze DOM states: suppress blur / focusout on host elements while picker is active
      // so transient popovers, tooltips, flyout menus, and modals remain open
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
  
      this.lastPointerX = event.clientX;
      this.lastPointerY = event.clientY;
      this.updateCandidatesFromPoint(event.clientX, event.clientY, event);
  
      const activeCandidate = this.getActiveCandidate();
      if (!activeCandidate) return;
  
      this.commitCandidateSelection(activeCandidate.element, event.clientX, event.clientY);
    }
  
            handleKeyDown(event               )       {
      if (!this.active) return;
  
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        this.stop();
        return;
      }
  
      // Alt+Shift+P / Option+Shift+P toggle / exit Freeze & Pin mode
      if (
        event.altKey &&
        event.shiftKey &&
        (event.code === "KeyP" || event.key.toLowerCase() === "p")
      ) {
        event.preventDefault();
        event.stopPropagation();
        this.stop();
        return;
      }
  
      // Space key freezes & pins the currently hovered element without triggering mouse clicks
      if (event.key === " " || event.key === "Spacebar" || event.code === "Space") {
        if (this.isInternalUiEvent(event)) return;
        const candidate = this.getActiveCandidate();
        if (candidate) {
          event.preventDefault();
          event.stopPropagation();
          if (typeof event.stopImmediatePropagation === "function") {
            event.stopImmediatePropagation();
          }
          this.commitCandidateSelection(
            candidate.element,
            this.lastPointerX || 80,
            this.lastPointerY || 80
          );
        }
        return;
      }
  
      if (!this.isSmartMode() && (event.key === "ArrowUp" || event.key === "[")) {
        event.preventDefault();
        event.stopPropagation();
        this.cycleDepth(1, true);
        return;
      }
  
      if (!this.isSmartMode() && (event.key === "ArrowDown" || event.key === "]")) {
        event.preventDefault();
        event.stopPropagation();
        this.cycleDepth(-1, true);
        return;
      }
  
      if (event.key === "Enter") {
        const candidate = this.getActiveCandidate();
        if (candidate) {
          event.preventDefault();
          event.stopPropagation();
          this.commitCandidateSelection(
            candidate.element,
            this.lastPointerX || 80,
            this.lastPointerY || 80
          );
        }
      }
    }
  }

  // --- Module: widget.ts ---
  const CORNER_SNAP_ZONE_PX = 68;
  const PEEL_DRAG_THRESHOLD_PX = 6;
  
  const DEFAULT_PROVIDERS_FALLBACK                      = [
    {
      id: "anthropic",
      label: "Anthropic Claude",
      configured: false,
      source: null,
      env_var_hint: "ANTHROPIC_API_KEY",
      masked_key: null,
      model: "claude-sonnet-4-20250514",
      default_model: "claude-sonnet-4-20250514",
      models: ["claude-sonnet-4-20250514", "claude-3-7-sonnet-latest", "claude-3-5-haiku-latest"],
      supports_base_url: false
    },
    {
      id: "gemini",
      label: "Google Gemini",
      configured: false,
      source: null,
      env_var_hint: "GEMINI_API_KEY",
      masked_key: null,
      model: "gemini-2.5-pro",
      default_model: "gemini-2.5-pro",
      models: ["gemini-2.5-pro", "gemini-2.5-flash"],
      supports_base_url: false
    },
    {
      id: "openai",
      label: "OpenAI",
      configured: false,
      source: null,
      env_var_hint: "OPENAI_API_KEY",
      masked_key: null,
      model: "gpt-4.1",
      default_model: "gpt-4.1",
      models: ["gpt-4.1", "gpt-4.1-mini", "o4-mini"],
      supports_base_url: false
    },
    {
      id: "custom",
      label: "OpenAI-Compatible (OpenRouter / Ollama)",
      configured: false,
      source: null,
      env_var_hint: "CONTEXT_DROP_LLM_API_KEY",
      masked_key: null,
      model: "anthropic/claude-sonnet-4",
      default_model: "anthropic/claude-sonnet-4",
      models: ["anthropic/claude-sonnet-4", "google/gemini-2.5-pro", "llama3.3"],
      supports_base_url: true,
      base_url: "https://openrouter.ai/api/v1"
    }
  ];
  
  const BOOK_CORNER_SVG = `<svg class="cd-book-corner-svg" viewBox="0 0 40 40" fill="none" aria-hidden="true"><polygon points="0,0 36,0 0,36" fill="#c2410c"/><polygon points="0,0 36,0 0,36" fill="rgba(17, 19, 24, 0.08)"/><path d="M12.2 6.2l4.1 4.1-1.7 1.7-1.4-.5-2.5 2.5.5 2-1.3 1.3-2.4-2.4-2.3 2.3 2.3-2.3-2.4-2.4 1.3-1.3 2 .5 2.5-2.5-.5-1.4 1.8-1.6z" stroke="#faf9f6" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round"/><path d="M36 0Q35.5 21 33.5 33.5Q21 35.5 0 36Z" fill="rgba(17, 19, 24, 0.16)"/><path class="cd-corner-flap" d="M36 0Q34.5 18.5 31 31Q18.5 34.5 0 36L36 0Z" fill="#faf9f6" stroke="#d6d3cd" stroke-width="1.2" stroke-linejoin="round"/></svg>`;
  
  const DEFAULT_VERBOSE_PLACEHOLDER = "Describe the issue or drop context from the page...";
  const DEFAULT_SMART_PLACEHOLDER = "Tell us what's happening...";
  const DEFAULT_SIDEBAR_WIDTH = 560;
  
  const DEFAULT_CONFIG               = {
    enabled: true,
    environment: "production",
    position: "bottom_right",
    placeholder: DEFAULT_VERBOSE_PLACEHOLDER,
    agent: {
      enabled: false
    },
    features: {
      element_selection: true,
      screenshot_capture: true,
      element_capture_padding: 16,
      smart_capture_padding: 84
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
           static get observedAttributes()           {
      return ["data-position", "data-config", "data-theme"];
    }
  
           shadow                    = null;
            config               = structuredClone(DEFAULT_CONFIG);
            customMetadata                          = {};
            apiClient                       = new ContextDropApiClient("/context_drop");
            picker                       = null;
  
            isOpen          = false;
            isMinimized          = false;
            isSubmitting          = false;
            isAgentBusy          = false;
            surfaceMode                    = "feedback";
            sidebarSide                   = "right";
            sidebarWidth         = DEFAULT_SIDEBAR_WIDTH;
            currentTheme                   = "light";
            composerThemeToggleBtn                           = null;
            sidebarThemeToggleBtn                           = null;
            pushPageLayout          = false;
            freePos                                       = null;
            isPeelDragging          = false;
            customPlaceholderSet          = false;
            pendingSmartCaptures                     = new Set();
  
            elementReferences                             = [];
            elementDomNodes                       = new Map();
            attachments                          = [];
            sessionHistory                         = [];
  
    // Local Agent state
            agentStatusLoaded          = false;
            agentWorkspaceName         = "rails-app";
            agentMcpEnvironments           = ["local"];
            agentProviders                      = structuredClone(DEFAULT_PROVIDERS_FALLBACK);
            activeProviderId         = "anthropic";
            selectedVaultProviderId         = "anthropic";
            isByokDrawerOpen          = false;
            isFeedbacksDrawerOpen          = false;
            feedbacksEnvFilter         = "all";
            crossEnvFeedbacks                         = [];
            isLoadingFeedbacks          = false;
            agentMessages                     = [];
  
    // Shadow DOM references
            rootContainer                        = null;
            bookCornerBtn                           = null;
            bookCornerCountEl                         = null;
            bookCornerAgentDotEl                         = null;
            bookCornerHintEl                         = null;
            dragPinEl                        = null;
            cornerSnapGhostEl                        = null;
  
            compactBarEl                        = null;
            compactStatusEl                        = null;
            compactStepGroupEl                        = null;
            compactLayerUpBtn                           = null;
            compactLayerDownBtn                           = null;
            compactDoneBtn                           = null;
            compactPinBtn                           = null;
  
    // Floating Feedback Composer elements
            composerEl                        = null;
            composerTitleEl                            = null;
            composerMinBtn                           = null;
            cornerPinBtn                           = null;
            composerModeSwitchWrap                        = null;
            composerToolbarPickBtn                           = null;
            composerToolbarScreenshotBtn                           = null;
            composerToolbarUploadBtn                           = null;
            chatThreadEl                        = null;
            textareaEl                             = null;
            trayEl                        = null;
            statusEl                        = null;
            fileInputEl                          = null;
            submitBtn                           = null;
  
    // Docked Local Agent Sidebar elements
            agentSidebarEl                     = null;
            sidebarPinBtn                           = null;
            sidebarEnvPillEl                         = null;
            sidebarPushBtn                           = null;
            providerPillBtn                           = null;
            keyDotEl                         = null;
            providerPillLabelEl                         = null;
            keysToggleBtn                           = null;
            feedbacksToggleBtn                           = null;
            byokDrawerEl                        = null;
            byokProviderSelect                           = null;
            byokModelInput                          = null;
            byokModelPresetsSelect                           = null;
            byokBaseUrlField                        = null;
            byokBaseUrlInput                          = null;
            byokKeySourceBadge                         = null;
            byokKeyInput                          = null;
            feedbacksDrawerEl                        = null;
            feedbacksTabsEl                        = null;
            feedbacksListEl                        = null;
            agentStreamEl                        = null;
            agentTrayEl                        = null;
            agentStatusEl                        = null;
            agentTextareaEl                             = null;
            agentSendBtn                           = null;
  
            lastPointerX         = 0;
            lastPointerY         = 0;
            boundTrackPointer                           = () => {};
            boundGlobalKeyDown                              = () => {};
            cancelActivePeelDrag                      = null;
  
           attributeChangedCallback(name        , oldValue               , newValue               )       {
      if (oldValue === newValue) return;
      if (name === "data-theme" && (newValue === "dark" || newValue === "light")) {
        this.applyTheme(newValue, false);
      } else if (name === "data-position" && newValue) {
        this.setCornerPosition(newValue                  );
      }
    }
  
           connectedCallback()       {
      if (!this.shadow) {
        this.shadow = this.attachShadow({ mode: "open" });
      }
      this.readDataAttributes();
      this.initTheme();
  
      try {
        const storedWidth =
          typeof localStorage !== "undefined" ? localStorage.getItem("context_drop_sidebar_width") : null;
        if (storedWidth) {
          const parsed = parseInt(storedWidth, 10);
          if (!Number.isNaN(parsed) && parsed >= 360 && parsed <= 920) {
            // If stored width was from the old cramped v0.2-alpha default (<= 440px), upgrade to DEFAULT_SIDEBAR_WIDTH
            this.sidebarWidth = parsed <= 440 ? DEFAULT_SIDEBAR_WIDTH : parsed;
          }
        }
      } catch {
        // Non-fatal
      }
  
      this.surfaceMode = this.config.agent?.enabled ? "agent" : "feedback";
      this.renderShadowDom();
  
      this.boundTrackPointer = (ev            ) => {
        this.lastPointerX = ev.clientX;
        this.lastPointerY = ev.clientY;
      };
  
      this.boundGlobalKeyDown = (ev               ) => {
        if (ev.key === "Escape" && this.isPeelDragging && this.cancelActivePeelDrag) {
          ev.preventDefault();
          ev.stopPropagation();
          this.cancelActivePeelDrag();
          return;
        }
  
        // Alt+Shift+P / Option+Shift+P toggles Freeze & Pin mode in technical/verbose environments
        if (
          !this.isSmartSelectionMode() &&
          ev.altKey &&
          ev.shiftKey &&
          (ev.code === "KeyP" || (typeof ev.key === "string" && ev.key.toLowerCase() === "p"))
        ) {
          ev.preventDefault();
          ev.stopPropagation();
          if (typeof ev.stopImmediatePropagation === "function") {
            ev.stopImmediatePropagation();
          }
          this.togglePinSelection();
        }
      };
  
      if (typeof window !== "undefined") {
        window.addEventListener("mousemove", this.boundTrackPointer, { capture: true, passive: true });
        window.addEventListener("keydown", this.boundGlobalKeyDown, { capture: true });
      }
  
      this.picker = new ElementPicker({
        onSelect: (snapshot, el) => {
          const added = this.addElementReference(snapshot, el);
          if (added) {
            if (this.isSmartSelectionMode()) {
              this.hideStatus();
              if (this.config.features.screenshot_capture) {
                const friendlyLabel = this.getElementFriendlyLabel(snapshot, el);
                void this.captureSmartSurroundingContext(el, snapshot.client_ref, friendlyLabel);
              }
            } else {
              const count = this.elementReferences.length;
              this.showStatus(
                count === 1
                  ? `Pinned ${snapshot.selector}`
                  : `Pinned ${count} elements (latest: ${snapshot.selector})`,
                "success"
              );
            }
          }
          this.syncUiStates();
        },
        onUnselect: (clientRef) => {
          this.removeElementReference(clientRef);
        },
        onExit: () => {
          if (this.isPeelDragging) return;
          this.isMinimized = false;
          this.openComposer();
          this.syncUiStates();
        },
        canSelectMore: () =>
          this.isPeelDragging ||
          this.elementReferences.length < this.config.limits.max_element_references,
        getExcludedSelectors: () => this.config.privacy.excluded_selectors,
        getSelectionMode: () => (this.isSmartSelectionMode() ? "smart" : "verbose"),
        getPinnedElements: () =>
          this.elementReferences
            .map((ref) => {
              const node = this.elementDomNodes.get(ref.client_ref);
              const friendlyLabel =
                typeof ref.metadata?.friendly_label === "string"
                  ? ref.metadata.friendly_label
                  : undefined;
              return node
                ? { clientRef: ref.client_ref, selector: ref.selector, friendlyLabel, element: node }
                : null;
            })
            .filter(
              (
                item
                          
                                  
                                 
                                                  
                                 
              ) => item !== null
            ),
        onStateChange: (state) => {
          this.syncPinActiveIndicators(state.active);
          if (!this.isPeelDragging) {
            this.renderCompactCoachBar(state.active, state.candidateStack.length);
          }
        }
      });
  
      const hasInlineConfig =
        typeof this.hasAttribute === "function" && this.hasAttribute("data-config");
      if (!hasInlineConfig && typeof fetch === "function") {
        void this.hydrateConfigFromServer();
      }
    }
  
           disconnectedCallback()       {
      if (this.cancelActivePeelDrag) {
        this.cancelActivePeelDrag();
      }
      if (this.picker && this.picker.isActive()) {
        this.picker.stop({ silent: true });
      }
      this.picker?.hideExternalPreview();
      this.syncHostPagePushMargin(false);
  
      if (typeof window !== "undefined") {
        window.removeEventListener("mousemove", this.boundTrackPointer, { capture: true });
        window.removeEventListener("keydown", this.boundGlobalKeyDown, { capture: true });
      }
    }
  
           getConfig()               {
      return this.config;
    }
  
           setWidgetConfig(partial                       )       {
      const wasAgentEnabled = Boolean(this.config.agent?.enabled);
      if (
        typeof partial.placeholder === "string" &&
        partial.placeholder !== DEFAULT_VERBOSE_PLACEHOLDER &&
        partial.placeholder !== DEFAULT_SMART_PLACEHOLDER
      ) {
        this.customPlaceholderSet = true;
      }
      this.config = {
        ...this.config,
        ...partial,
        agent: { ...(this.config.agent || { enabled: false }), ...(partial.agent || {}) },
        features: { ...this.config.features, ...(partial.features || {}) },
        limits: { ...this.config.limits, ...(partial.limits || {}) },
        privacy: { ...this.config.privacy, ...(partial.privacy || {}) }
      };
      if (partial.csrf_token) {
        this.apiClient.setCsrfToken(partial.csrf_token);
      }
      if (partial.position) {
        this.setCornerPosition(partial.position);
      }
      const nowAgentEnabled = Boolean(this.config.agent?.enabled);
      if (nowAgentEnabled && !wasAgentEnabled) {
        this.surfaceMode = "agent";
        if (this.isOpen) {
          void this.ensureAgentStatusLoaded();
        }
      } else if (!nowAgentEnabled) {
        this.surfaceMode = "feedback";
      }
      this.renderTray();
      this.renderChatThread();
      this.syncUiStates();
    }
  
           getSurfaceMode()                    {
      return this.isAgentModeActive() ? "agent" : "feedback";
    }
  
           setSurfaceMode(mode                   )       {
      if (mode === "agent" && !this.config.agent?.enabled) {
        return;
      }
      this.surfaceMode = mode;
      if (mode === "agent" && this.isOpen) {
        void this.ensureAgentStatusLoaded();
      }
      this.renderTray();
      this.renderChatThread();
      this.syncUiStates();
      this.focusActiveInput();
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
  
           getAgentMessages()                     {
      return [...this.agentMessages];
    }
  
           isAgentModeActive()          {
      return Boolean(this.config.agent?.enabled) && this.surfaceMode === "agent";
    }
  
           isSmartSelectionMode()          {
      if (this.isAgentModeActive()) {
        return false;
      }
      if (this.config.features.selection_mode === "smart") {
        return true;
      }
      if (this.config.features.selection_mode === "verbose") {
        return false;
      }
      return (this.config.environment || "").toLowerCase() === "production";
    }
  
            getElementFriendlyLabel(ref                          , domNode          )         {
      const metaLabel = ref.metadata?.friendly_label;
      if (typeof metaLabel === "string" && metaLabel.trim().length > 0) {
        return metaLabel.trim();
      }
      if (domNode) {
        return describeSmartComponent(domNode).label;
      }
      return ref.tag_name ? `Selected ${ref.tag_name} area` : "Selected page area";
    }
  
           openComposer()       {
      this.isOpen = true;
      this.isMinimized = false;
      if (this.isAgentModeActive()) {
        void this.ensureAgentStatusLoaded();
      }
      this.syncUiStates();
      this.focusActiveInput();
    }
  
           closeComposer()       {
      this.isOpen = false;
      this.isMinimized = false;
      if (this.picker && this.picker.isActive()) {
        this.picker.stop({ silent: true });
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
        this.picker.stop({ silent: true });
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
      this.picker.start({ suppressCursorPin: false });
      if (this.lastPointerX > 0 && this.lastPointerY > 0) {
        this.picker.highlightAtPoint(this.lastPointerX, this.lastPointerY);
      }
      this.syncUiStates();
    }
  
           togglePinSelection()       {
      if (this.picker && this.picker.isActive()) {
        this.picker.stop();
      } else {
        this.startPinSelection();
      }
    }
  
           getTheme()                   {
      return this.currentTheme;
    }
  
           setTheme(theme                  )       {
      this.applyTheme(theme, true);
    }
  
           toggleTheme()       {
      const next = this.currentTheme === "dark" ? "light" : "dark";
      this.applyTheme(next, true);
    }
  
            initTheme()       {
      let theme                   = "light";
      try {
        const stored =
          typeof localStorage !== "undefined" ? localStorage.getItem("context_drop_theme") : null;
        if (stored === "dark" || stored === "light") {
          theme = stored;
        } else {
          const attr = this.getAttribute("data-theme");
          if (attr === "dark" || attr === "light") {
            theme = attr;
          } else if (
            typeof window !== "undefined" &&
            window.matchMedia &&
            window.matchMedia("(prefers-color-scheme: dark)").matches
          ) {
            theme = "dark";
          }
        }
      } catch {
        // Non-fatal if localStorage is restricted
      }
      this.applyTheme(theme, false);
  
      if (typeof window !== "undefined" && window.matchMedia) {
        try {
          const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
          mediaQuery.addEventListener?.("change", (e) => {
            try {
              if (!localStorage.getItem("context_drop_theme")) {
                this.applyTheme(e.matches ? "dark" : "light", false);
              }
            } catch {
              // ignore
            }
          });
        } catch {
          // ignore
        }
      }
    }
  
            applyTheme(theme                  , persist          = true)       {
      this.currentTheme = theme;
      if (persist) {
        try {
          localStorage.setItem("context_drop_theme", theme);
        } catch {
          // Non-fatal
        }
      }
  
      if (typeof this.setAttribute === "function") {
        this.setAttribute("data-theme", theme);
      }
      this.rootContainer?.setAttribute("data-theme", theme);
      this.agentSidebarEl?.setAttribute("data-theme", theme);
      this.composerEl?.setAttribute("data-theme", theme);
      this.compactBarEl?.setAttribute("data-theme", theme);
  
      if (this.composerThemeToggleBtn) {
        this.updateThemeToggleBtn(this.composerThemeToggleBtn);
      }
      if (this.sidebarThemeToggleBtn) {
        this.updateThemeToggleBtn(this.sidebarThemeToggleBtn);
      }
  
      if (typeof this.dispatchEvent === "function") {
        try {
          this.dispatchEvent(
            new CustomEvent("contextdrop:themechange", {
              bubbles: true,
              composed: true,
              detail: { theme }
            })
          );
        } catch {
          // ignore
        }
      }
    }
  
            buildThemeToggleBtn()                    {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "cd-icon-btn cd-theme-toggle";
      this.updateThemeToggleBtn(btn);
      btn.addEventListener("click", () => {
        this.toggleTheme();
      });
      return btn;
    }
  
            updateThemeToggleBtn(btn                   )       {
      const isDark = this.currentTheme === "dark";
      btn.title = isDark ? "Switch to light theme" : "Switch to dark theme";
      btn.setAttribute("aria-label", isDark ? "Switch to light theme" : "Switch to dark theme");
      btn.innerHTML = isDark ? ICON_SUN : ICON_MOON;
    }
  
           setCornerPosition(position                )       {
      if (!["top_left", "top_right", "bottom_left", "bottom_right"].includes(position)) {
        return;
      }
      this.config.position = position;
      this.freePos = null;
      if (this.rootContainer) {
        this.rootContainer.className = `cd-root pos-${position}`;
        this.rootContainer.style.left = "";
        this.rootContainer.style.top = "";
      }
      if (this.bookCornerBtn) {
        this.bookCornerBtn.className = `cd-book-corner corner-${position}`;
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
      this.picker?.refreshPinnedMarkers();
      this.renderTray();
      this.syncUiStates();
      return true;
    }
  
           removeElementReference(clientRef        )       {
      this.elementReferences = this.elementReferences.filter((el) => el.client_ref !== clientRef);
      this.elementDomNodes.delete(clientRef);
      this.attachments = this.attachments.filter(
        (att) =>
          !(att.element_reference_ref === clientRef && att.metadata?.auto_smart_context === true)
      );
      this.picker?.hideExternalPreview();
      this.picker?.refreshPinnedMarkers();
      this.renderTray();
      this.syncUiStates();
    }
  
           removeAttachment(attachmentId        )       {
      this.attachments = this.attachments.filter((att) => att.id !== attachmentId);
      this.renderTray();
      this.syncUiStates();
    }
  
            focusActiveInput()       {
      if (this.isAgentModeActive()) {
        this.agentTextareaEl?.focus();
      } else {
        this.textareaEl?.focus();
      }
    }
  
            async hydrateConfigFromServer()                {
      try {
        const remoteConfig = await this.apiClient.fetchConfig();
        if (remoteConfig && typeof remoteConfig === "object") {
          const posOverride = this.getAttribute("data-position")                         ;
          this.setWidgetConfig({
            ...remoteConfig,
            position: posOverride || remoteConfig.position || this.config.position
          });
        }
      } catch {
        // Non-fatal in static/offline environments
      }
    }
  
            readDataAttributes()       {
      const endpoint = this.getAttribute("data-endpoint") || "/context_drop";
      this.apiClient = new ContextDropApiClient(endpoint);
  
      const rawConfig = this.getAttribute("data-config");
      if (rawConfig) {
        try {
          const parsed = JSON.parse(rawConfig)                         ;
          if (
            typeof parsed.placeholder === "string" &&
            parsed.placeholder !== DEFAULT_VERBOSE_PLACEHOLDER &&
            parsed.placeholder !== DEFAULT_SMART_PLACEHOLDER
          ) {
            this.customPlaceholderSet = true;
          }
          this.config = {
            ...this.config,
            ...parsed,
            agent: { ...(this.config.agent || { enabled: false }), ...(parsed.agent || {}) },
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
        this.customPlaceholderSet = true;
      }
  
      const rawMetadata = this.getAttribute("data-metadata");
      if (rawMetadata) {
        try {
          this.customMetadata = JSON.parse(rawMetadata)                           ;
        } catch {
          this.customMetadata = {};
        }
      }
  
      const themeOverride = this.getAttribute("data-theme");
      if (themeOverride === "dark" || themeOverride === "light") {
        this.currentTheme = themeOverride;
      }
    }
  
            detectViewportSnapCorner(
      clientX        ,
      clientY        ,
      originCorner                ,
      leftOriginZone         
    )                        {
      if (typeof window === "undefined") return null;
      const vw = window.innerWidth || 1024;
      const vh = window.innerHeight || 768;
  
      let candidate                        = null;
      if (clientX <= CORNER_SNAP_ZONE_PX && clientY <= CORNER_SNAP_ZONE_PX) {
        candidate = "top_left";
      } else if (clientX >= vw - CORNER_SNAP_ZONE_PX && clientY <= CORNER_SNAP_ZONE_PX) {
        candidate = "top_right";
      } else if (clientX <= CORNER_SNAP_ZONE_PX && clientY >= vh - CORNER_SNAP_ZONE_PX) {
        candidate = "bottom_left";
      } else if (clientX >= vw - CORNER_SNAP_ZONE_PX && clientY >= vh - CORNER_SNAP_ZONE_PX) {
        candidate = "bottom_right";
      }
  
      if (!candidate) return null;
      if (candidate === originCorner && !leftOriginZone) return null;
      return candidate;
    }
  
            isOutsideCornerZone(clientX        , clientY        , corner                )          {
      if (typeof window === "undefined") return true;
      const vw = window.innerWidth || 1024;
      const vh = window.innerHeight || 768;
      const exitRadius = CORNER_SNAP_ZONE_PX + 10;
  
      switch (corner) {
        case "top_left":
          return clientX > exitRadius || clientY > exitRadius;
        case "top_right":
          return clientX < vw - exitRadius || clientY > exitRadius;
        case "bottom_left":
          return clientX > exitRadius || clientY < vh - exitRadius;
        case "bottom_right":
          return clientX < vw - exitRadius || clientY < vh - exitRadius;
      }
    }
  
            attachBookCornerLauncher(cornerBtn                   )       {
      let startX = 0;
      let startY = 0;
      let pointerActive = false;
      let peeled = false;
      let leftOriginZone = false;
      let activeSnapCorner                        = null;
      let suppressNextClick = false;
      let suppressTimer                                       = null;
  
      const clearSuppress = ()       => {
        suppressNextClick = false;
        if (suppressTimer !== null) {
          clearTimeout(suppressTimer);
          suppressTimer = null;
        }
      };
  
      const updateDragPinPosition = (x        , y        )       => {
        if (!this.dragPinEl) return;
        this.dragPinEl.style.transform = `translate3d(${Math.round(x)}px, ${Math.round(y)}px, 0)`;
      };
  
      const finishPeelVisuals = ()       => {
        pointerActive = false;
        this.isPeelDragging = false;
        this.cancelActivePeelDrag = null;
        cornerBtn.classList.remove("is-peeled");
        if (this.dragPinEl) {
          this.dragPinEl.hidden = true;
          this.dragPinEl.classList.remove("has-target", "is-snapping-corner");
        }
        if (this.cornerSnapGhostEl) {
          this.cornerSnapGhostEl.hidden = true;
        }
        if (typeof window !== "undefined") {
          window.removeEventListener("pointermove", onPointerMove);
          window.removeEventListener("pointerup", onPointerUp);
          window.removeEventListener("pointercancel", onPointerCancel);
        }
      };
  
      cornerBtn.addEventListener("click", (ev            ) => {
        if (suppressNextClick) {
          clearSuppress();
          ev.preventDefault();
          ev.stopPropagation();
          return;
        }
        this.openComposer();
      });
  
      const onPointerMove = (ev              )       => {
        if (!pointerActive) return;
        this.lastPointerX = ev.clientX;
        this.lastPointerY = ev.clientY;
  
        const travel = Math.hypot(ev.clientX - startX, ev.clientY - startY);
        if (!peeled && travel > PEEL_DRAG_THRESHOLD_PX) {
          peeled = true;
          this.isPeelDragging = true;
          cornerBtn.classList.add("is-peeled");
  
          if (this.dragPinEl) {
            this.dragPinEl.hidden = false;
            updateDragPinPosition(ev.clientX, ev.clientY);
          }
  
          if (
            this.config.features.element_selection &&
            this.picker &&
            this.elementReferences.length < this.config.limits.max_element_references
          ) {
            this.picker.start({ suppressCursorPin: true });
          }
        }
  
        if (!peeled) return;
  
        updateDragPinPosition(ev.clientX, ev.clientY);
  
        if (!leftOriginZone && this.isOutsideCornerZone(ev.clientX, ev.clientY, this.config.position)) {
          leftOriginZone = true;
        }
  
        activeSnapCorner = this.detectViewportSnapCorner(
          ev.clientX,
          ev.clientY,
          this.config.position,
          leftOriginZone
        );
  
        if (activeSnapCorner) {
          this.picker?.clearCandidateHighlight();
          if (this.cornerSnapGhostEl) {
            this.cornerSnapGhostEl.className = `cd-corner-snap-ghost corner-${activeSnapCorner}`;
            this.cornerSnapGhostEl.hidden = false;
          }
          if (this.dragPinEl) {
            this.dragPinEl.classList.add("is-snapping-corner");
            this.dragPinEl.classList.remove("has-target");
          }
        } else {
          if (this.cornerSnapGhostEl) {
            this.cornerSnapGhostEl.hidden = true;
          }
          if (this.dragPinEl) {
            this.dragPinEl.classList.remove("is-snapping-corner");
          }
          this.picker?.highlightAtPoint(ev.clientX, ev.clientY, ev);
          const hasTarget = Boolean(this.picker?.getActiveCandidate());
          this.dragPinEl?.classList.toggle("has-target", hasTarget);
        }
      };
  
      const armClickSuppression = ()       => {
        suppressNextClick = true;
        if (suppressTimer !== null) {
          clearTimeout(suppressTimer);
        }
        suppressTimer = setTimeout(() => {
          suppressNextClick = false;
          suppressTimer = null;
        }, 40);
      };
  
      const onPointerUp = (ev              )       => {
        if (!pointerActive) return;
        const wasPeeled = peeled;
        const snapTarget = activeSnapCorner;
        peeled = false;
        activeSnapCorner = null;
  
        if (!wasPeeled) {
          finishPeelVisuals();
          return;
        }
  
        armClickSuppression();
  
        if (snapTarget) {
          this.picker?.stop({ silent: true });
          finishPeelVisuals();
          this.setCornerPosition(snapTarget);
          this.syncUiStates();
          return;
        }
  
        this.picker?.highlightAtPoint(ev.clientX, ev.clientY, ev);
        const committed = this.picker ? this.picker.commitActiveCandidate(ev.clientX, ev.clientY) : false;
        this.picker?.stop({ silent: true });
        finishPeelVisuals();
  
        if (committed) {
          this.openComposer();
        } else {
          this.syncUiStates();
        }
      };
  
      const onPointerCancel = ()       => {
        if (!pointerActive) return;
        peeled = false;
        activeSnapCorner = null;
        this.picker?.stop({ silent: true });
        finishPeelVisuals();
        clearSuppress();
        this.syncUiStates();
      };
  
      cornerBtn.addEventListener("pointerdown", (ev              ) => {
        if (ev.button !== 0 || typeof window === "undefined") return;
        startX = ev.clientX;
        startY = ev.clientY;
        pointerActive = true;
        peeled = false;
        leftOriginZone = false;
        activeSnapCorner = null;
        clearSuppress();
  
        this.cancelActivePeelDrag = () => {
          armClickSuppression();
          onPointerCancel();
        };
  
        window.addEventListener("pointermove", onPointerMove);
        window.addEventListener("pointerup", onPointerUp);
        window.addEventListener("pointercancel", onPointerCancel);
      });
    }
  
            attachDragHandle(handleEl             )       {
      let startX = 0;
      let startY = 0;
      let initialLeft = 0;
      let initialTop = 0;
      let dragging = false;
      let moved = false;
  
      const onPointerMove = (ev              )       => {
        if (!dragging) return;
        const dx = ev.clientX - startX;
        const dy = ev.clientY - startY;
        if (!moved && Math.hypot(dx, dy) > 5) {
          moved = true;
        }
        if (moved) {
          this.setFreePosition(initialLeft + dx, initialTop + dy);
        }
      };
  
      const cleanupDrag = ()       => {
        dragging = false;
        window.removeEventListener("pointermove", onPointerMove);
        window.removeEventListener("pointerup", cleanupDrag);
        window.removeEventListener("pointercancel", cleanupDrag);
      };
  
      handleEl.addEventListener("pointerdown", (ev              ) => {
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
  
        window.addEventListener("pointermove", onPointerMove);
        window.addEventListener("pointerup", cleanupDrag);
        window.addEventListener("pointercancel", cleanupDrag);
      });
    }
  
            attachSidebarResizer(resizerEl                )       {
      let startX = 0;
      let startWidth = this.sidebarWidth;
      let active = false;
  
      const onPointerMove = (ev              )       => {
        if (!active || typeof window === "undefined") return;
        const delta = this.sidebarSide === "right" ? startX - ev.clientX : ev.clientX - startX;
        const maxAllowed = Math.max(360, (window.innerWidth || 1024) - 80);
        this.sidebarWidth = Math.max(360, Math.min(Math.min(920, maxAllowed), startWidth + delta));
        if (this.agentSidebarEl) {
          this.agentSidebarEl.style.width = `${Math.round(this.sidebarWidth)}px`;
        }
        if (this.pushPageLayout && this.isOpen && !this.isMinimized && this.isAgentModeActive()) {
          this.syncHostPagePushMargin(true);
        }
      };
  
      const stopResize = ()       => {
        active = false;
        resizerEl.classList.remove("is-resizing");
        try {
          localStorage.setItem("context_drop_sidebar_width", String(Math.round(this.sidebarWidth)));
        } catch {
          // Non-fatal
        }
        window.removeEventListener("pointermove", onPointerMove);
        window.removeEventListener("pointerup", stopResize);
        window.removeEventListener("pointercancel", stopResize);
      };
  
      resizerEl.addEventListener("pointerdown", (ev              ) => {
        if (ev.button !== 0 || typeof window === "undefined") return;
        ev.preventDefault();
        active = true;
        startX = ev.clientX;
        startWidth = this.sidebarWidth;
        resizerEl.classList.add("is-resizing");
        window.addEventListener("pointermove", onPointerMove);
        window.addEventListener("pointerup", stopResize);
        window.addEventListener("pointercancel", stopResize);
      });
    }
  
            syncHostPagePushMargin(shouldPush         )       {
      if (typeof document === "undefined" || !document.documentElement) return;
      const htmlEl = document.documentElement;
      if (!shouldPush) {
        if (htmlEl.getAttribute("data-context-drop-pushed") === "true") {
          htmlEl.style.marginRight = "";
          htmlEl.style.marginLeft = "";
          if (typeof htmlEl.removeAttribute === "function") {
            htmlEl.removeAttribute("data-context-drop-pushed");
          } else {
            htmlEl.setAttribute("data-context-drop-pushed", "");
          }
        }
        return;
      }
  
      htmlEl.setAttribute("data-context-drop-pushed", "true");
      if (this.sidebarSide === "right") {
        htmlEl.style.marginLeft = "";
        htmlEl.style.marginRight = `${Math.round(this.sidebarWidth)}px`;
      } else {
        htmlEl.style.marginRight = "";
        htmlEl.style.marginLeft = `${Math.round(this.sidebarWidth)}px`;
      }
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
      const compactBar = this.buildCompactBarDom();
      root.appendChild(compactBar);
  
      // 2. Standard Floating Feedback Chatbox Composer
      const composer = this.buildFeedbackComposerDom();
      root.appendChild(composer);
  
      this.shadow.appendChild(root);
  
      // 3. Docked Local BYOK Agentic Coding Sidebar (active in local development mode)
      const sidebar = this.buildAgentSidebarDom();
      this.shadow.appendChild(sidebar);
  
      // 4. Book-Corner Fold Launcher (flush at viewport corner, peels into pushpin on drag)
      const bookCorner = document.createElement("button");
      bookCorner.type = "button";
      bookCorner.className = `cd-book-corner corner-${this.config.position}`;
      bookCorner.setAttribute(
        "aria-label",
        "Open ContextDrop chatbox, or drag corner to pin an element on the page"
      );
      bookCorner.setAttribute("aria-expanded", String(this.isOpen));
  
      const cornerArt = document.createElement("span");
      cornerArt.className = "cd-book-corner-art";
      cornerArt.innerHTML = BOOK_CORNER_SVG;
      bookCorner.appendChild(cornerArt);
  
      const agentDot = document.createElement("span");
      agentDot.className = "cd-corner-agent-dot";
      agentDot.hidden = true;
      this.bookCornerAgentDotEl = agentDot;
      bookCorner.appendChild(agentDot);
  
      const countBadge = document.createElement("span");
      countBadge.className = "cd-corner-count";
      countBadge.hidden = true;
      this.bookCornerCountEl = countBadge;
      bookCorner.appendChild(countBadge);
  
      const hoverHint = document.createElement("span");
      hoverHint.className = "cd-corner-hint";
      hoverHint.setAttribute("aria-hidden", "true");
      hoverHint.textContent = "Click to chat · Drag to pin";
      this.bookCornerHintEl = hoverHint;
      bookCorner.appendChild(hoverHint);
  
      this.attachBookCornerLauncher(bookCorner);
      this.bookCornerBtn = bookCorner;
      this.shadow.appendChild(bookCorner);
  
      // 5. Morphing Drag Pushpin + Viewport Corner Snap Ghost
      const snapGhost = document.createElement("div");
      snapGhost.className = `cd-corner-snap-ghost corner-${this.config.position}`;
      snapGhost.hidden = true;
      this.cornerSnapGhostEl = snapGhost;
      this.shadow.appendChild(snapGhost);
  
      const dragPin = document.createElement("div");
      dragPin.className = "cd-drag-pin";
      dragPin.hidden = true;
      const dragPinHead = document.createElement("div");
      dragPinHead.className = "cd-drag-pin-head";
      dragPinHead.innerHTML = ICON_PIN;
      dragPin.appendChild(dragPinHead);
      this.dragPinEl = dragPin;
      this.shadow.appendChild(dragPin);
  
      this.applyTheme(this.currentTheme, false);
      this.syncUiStates();
    }
  
            buildCompactBarDom()                 {
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
      compactPinBtn.title = "Toggle Freeze & Pin (⌥⇧P)";
      compactPinBtn.setAttribute("aria-label", "Toggle element pin mode (Option+Shift+P)");
      compactPinBtn.innerHTML = `${ICON_PIN}<span>Pinning</span>`;
      compactPinBtn.addEventListener("click", () => this.togglePinSelection());
      this.compactPinBtn = compactPinBtn;
      compactBar.appendChild(compactPinBtn);
  
      const compactStatus = document.createElement("div");
      compactStatus.className = "cd-compact-status";
      this.compactStatusEl = compactStatus;
      compactBar.appendChild(compactStatus);
  
      const compactStepGroup = document.createElement("div");
      compactStepGroup.className = "cd-compact-step-group";
      this.compactStepGroupEl = compactStepGroup;
  
      const compactLayerDown = document.createElement("button");
      compactLayerDown.type = "button";
      compactLayerDown.className = "cd-icon-btn";
      compactLayerDown.title = "Step to inner/child element (Down arrow)";
      compactLayerDown.setAttribute("aria-label", "Step to child element");
      compactLayerDown.innerHTML = ICON_CHEVRON_DOWN;
      compactLayerDown.addEventListener("click", () => this.picker?.cycleDepth(-1, true));
      this.compactLayerDownBtn = compactLayerDown;
      compactStepGroup.appendChild(compactLayerDown);
  
      const compactLayerUp = document.createElement("button");
      compactLayerUp.type = "button";
      compactLayerUp.className = "cd-icon-btn";
      compactLayerUp.title = "Step to outer/parent element (Up arrow)";
      compactLayerUp.setAttribute("aria-label", "Step to parent element");
      compactLayerUp.innerHTML = ICON_CHEVRON_UP;
      compactLayerUp.addEventListener("click", () => this.picker?.cycleDepth(1, true));
      this.compactLayerUpBtn = compactLayerUp;
      compactStepGroup.appendChild(compactLayerUp);
  
      compactBar.appendChild(compactStepGroup);
  
      const expandBtn = document.createElement("button");
      expandBtn.type = "button";
      expandBtn.className = "cd-btn";
      expandBtn.setAttribute("aria-label", "Cancel pinning and return to chatbox");
      expandBtn.innerHTML = `<span>Cancel</span><kbd class="cd-kbd">Esc</kbd>`;
      expandBtn.addEventListener("click", () => this.expandFromCompactBar());
      this.compactDoneBtn = expandBtn;
      compactBar.appendChild(expandBtn);
  
      return compactBar;
    }
  
            buildModeSwitchDom(activeMode                   )                 {
      const wrap = document.createElement("div");
      wrap.className = "cd-mode-switch";
      wrap.setAttribute("role", "tablist");
      wrap.setAttribute("aria-label", "ContextDrop mode");
  
      const agentBtn = document.createElement("button");
      agentBtn.type = "button";
      agentBtn.className = `cd-mode-btn${activeMode === "agent" ? " is-active" : ""}`;
      agentBtn.setAttribute("aria-selected", String(activeMode === "agent"));
      agentBtn.innerHTML = `${ICON_CODE_PROMPT}<span>Agent</span>`;
      agentBtn.addEventListener("click", () => this.setSurfaceMode("agent"));
  
      const feedbackBtn = document.createElement("button");
      feedbackBtn.type = "button";
      feedbackBtn.className = `cd-mode-btn${activeMode === "feedback" ? " is-active" : ""}`;
      feedbackBtn.setAttribute("aria-selected", String(activeMode === "feedback"));
      feedbackBtn.textContent = "Feedback";
      feedbackBtn.addEventListener("click", () => this.setSurfaceMode("feedback"));
  
      wrap.appendChild(agentBtn);
      wrap.appendChild(feedbackBtn);
      return wrap;
    }
  
            buildFeedbackComposerDom()                 {
      const composer = document.createElement("div");
      composer.className = "cd-composer";
      composer.setAttribute("role", "dialog");
      composer.setAttribute("aria-label", "ContextDrop Feedback Chatbox");
      composer.hidden = true;
      this.composerEl = composer;
  
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
  
      const header = document.createElement("div");
      header.className = "cd-composer-header";
      this.attachDragHandle(header);
  
      const headerLeft = document.createElement("div");
      headerLeft.className = "cd-header-left";
  
      if (this.config.features.element_selection) {
        const cornerPinBtn = document.createElement("button");
        cornerPinBtn.type = "button";
        cornerPinBtn.className = "cd-pin-corner-btn";
        cornerPinBtn.title = "Freeze & Pin element (⌥⇧P)";
        cornerPinBtn.setAttribute("aria-label", "Select DOM element on page (Option+Shift+P)");
        cornerPinBtn.innerHTML = `${ICON_PIN}<span>Pin Element</span>`;
        cornerPinBtn.addEventListener("click", () => this.startPinSelection());
        this.cornerPinBtn = cornerPinBtn;
        headerLeft.appendChild(cornerPinBtn);
      }
  
      const title = document.createElement("h2");
      title.className = "cd-composer-title";
      title.textContent = "ContextDrop";
      this.composerTitleEl = title;
      headerLeft.appendChild(title);
  
      const headerActions = document.createElement("div");
      headerActions.className = "cd-header-actions";
  
      const modeSwitchHolder = document.createElement("div");
      modeSwitchHolder.className = "cd-composer-mode-switch-wrap";
      modeSwitchHolder.hidden = !this.config.agent?.enabled;
      modeSwitchHolder.appendChild(this.buildModeSwitchDom("feedback"));
      this.composerModeSwitchWrap = modeSwitchHolder;
      headerActions.appendChild(modeSwitchHolder);
  
      const themeBtn = this.buildThemeToggleBtn();
      this.composerThemeToggleBtn = themeBtn;
      headerActions.appendChild(themeBtn);
  
      const minBtn = document.createElement("button");
      minBtn.type = "button";
      minBtn.className = "cd-icon-btn";
      minBtn.title = "Minimize to compact bar";
      minBtn.setAttribute("aria-label", "Minimize chatbox to compact bar");
      minBtn.innerHTML = ICON_MINIMIZE;
      minBtn.addEventListener("click", () => this.minimizeToCompactBar());
      this.composerMinBtn = minBtn;
  
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
  
      const chatThread = document.createElement("div");
      chatThread.className = "cd-chat-thread";
      chatThread.setAttribute("aria-live", "polite");
      this.chatThreadEl = chatThread;
      composer.appendChild(chatThread);
      this.renderChatThread();
  
      const tray = document.createElement("div");
      tray.className = "cd-tray";
      tray.setAttribute("aria-label", "Attached context items");
      this.trayEl = tray;
      composer.appendChild(tray);
  
      const status = document.createElement("div");
      status.className = "cd-status";
      status.setAttribute("role", "status");
      status.hidden = true;
      this.statusEl = status;
      composer.appendChild(status);
  
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
  
      const toolbar = document.createElement("div");
      toolbar.className = "cd-toolbar";
  
      const actions = this.buildPromptToolbarActions(false);
  
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
  
      return composer;
    }
  
            buildPromptToolbarActions(forAgentSidebar          = false)                 {
      const actions = document.createElement("div");
      actions.className = "cd-toolbar-actions";
  
      if (this.config.features.element_selection) {
        const pickBtn = document.createElement("button");
        pickBtn.type = "button";
        pickBtn.className = "cd-btn";
        pickBtn.title = "Freeze & Pin element (⌥⇧P)";
        pickBtn.setAttribute("aria-label", "Pin HTML element as context (Option+Shift+P)");
        pickBtn.innerHTML = `${ICON_PIN}<span>Pin</span><kbd class="cd-kbd">⌥⇧P</kbd>`;
        pickBtn.addEventListener("click", () => this.startPinSelection());
        if (!forAgentSidebar) {
          this.composerToolbarPickBtn = pickBtn;
        }
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
        if (!forAgentSidebar) {
          this.composerToolbarScreenshotBtn = screenshotBtn;
        }
        actions.appendChild(screenshotBtn);
      }
  
      const uploadBtn = document.createElement("button");
      uploadBtn.type = "button";
      uploadBtn.className = "cd-btn";
      uploadBtn.setAttribute("aria-label", "Upload image attachment");
      uploadBtn.innerHTML = `${ICON_IMAGE}<span>Image</span>`;
      uploadBtn.addEventListener("click", () => this.fileInputEl?.click());
      if (!forAgentSidebar) {
        this.composerToolbarUploadBtn = uploadBtn;
      }
      actions.appendChild(uploadBtn);
  
      return actions;
    }
  
            buildAgentSidebarDom()              {
      const sidebar = document.createElement("aside");
      sidebar.className = `cd-agent-sidebar side-${this.sidebarSide}`;
      sidebar.setAttribute("role", "dialog");
      sidebar.setAttribute("aria-label", "ContextDrop Local Coding Agent Sidebar");
      sidebar.style.width = `${this.sidebarWidth}px`;
      sidebar.hidden = true;
      this.agentSidebarEl = sidebar;
  
      sidebar.addEventListener("dragover", (ev) => {
        ev.preventDefault();
        sidebar.classList.add("is-dragging-over");
      });
      sidebar.addEventListener("dragleave", () => {
        sidebar.classList.remove("is-dragging-over");
      });
      sidebar.addEventListener("drop", (ev) => {
        ev.preventDefault();
        sidebar.classList.remove("is-dragging-over");
        const files = ev.dataTransfer?.files;
        if (files && files.length > 0) {
          void this.handleFilesSelected(Array.from(files));
        }
      });
  
      const resizer = document.createElement("div");
      resizer.className = "cd-sidebar-resizer";
      resizer.title = "Drag edge to resize sidebar";
      this.attachSidebarResizer(resizer);
      sidebar.appendChild(resizer);
  
      // 1. Sidebar Header
      const header = document.createElement("div");
      header.className = "cd-sidebar-header";
  
      const headerLeft = document.createElement("div");
      headerLeft.className = "cd-header-left";
  
      if (this.config.features.element_selection) {
        const pinBtn = document.createElement("button");
        pinBtn.type = "button";
        pinBtn.className = "cd-pin-corner-btn";
        pinBtn.title = "Freeze & Pin element (⌥⇧P)";
        pinBtn.setAttribute("aria-label", "Pin DOM element for agent (Option+Shift+P)");
        pinBtn.innerHTML = `${ICON_PIN}<span>Pin</span>`;
        pinBtn.addEventListener("click", () => this.startPinSelection());
        this.sidebarPinBtn = pinBtn;
        headerLeft.appendChild(pinBtn);
      }
  
      const title = document.createElement("h2");
      title.className = "cd-composer-title";
      title.textContent = "ContextDrop";
      headerLeft.appendChild(title);
  
      const envPill = document.createElement("span");
      envPill.className = "cd-env-pill is-local";
      envPill.textContent = this.getShortEnvironmentSlug();
      this.sidebarEnvPillEl = envPill;
      headerLeft.appendChild(envPill);
  
      const headerActions = document.createElement("div");
      headerActions.className = "cd-header-actions";
  
      headerActions.appendChild(this.buildModeSwitchDom("agent"));
  
      const themeBtn = this.buildThemeToggleBtn();
      this.sidebarThemeToggleBtn = themeBtn;
      headerActions.appendChild(themeBtn);
  
      const newThreadBtn = document.createElement("button");
      newThreadBtn.type = "button";
      newThreadBtn.className = "cd-icon-btn";
      newThreadBtn.title = "New agent conversation";
      newThreadBtn.setAttribute("aria-label", "Start new agent conversation");
      newThreadBtn.innerHTML = ICON_PLUS;
      newThreadBtn.addEventListener("click", () => {
        this.agentMessages = [];
        this.renderAgentStream();
        this.agentTextareaEl?.focus();
      });
  
      const pushLayoutBtn = document.createElement("button");
      pushLayoutBtn.type = "button";
      pushLayoutBtn.className = "cd-icon-btn";
      pushLayoutBtn.title = "Toggle pushing page layout alongside sidebar";
      pushLayoutBtn.setAttribute("aria-label", "Toggle push page layout");
      pushLayoutBtn.innerHTML = ICON_PUSH_LAYOUT;
      pushLayoutBtn.addEventListener("click", () => {
        this.pushPageLayout = !this.pushPageLayout;
        this.syncUiStates();
      });
      this.sidebarPushBtn = pushLayoutBtn;
  
      const flipSideBtn = document.createElement("button");
      flipSideBtn.type = "button";
      flipSideBtn.className = "cd-icon-btn";
      flipSideBtn.title = "Dock sidebar on left or right";
      flipSideBtn.setAttribute("aria-label", "Switch sidebar dock side");
      flipSideBtn.innerHTML = ICON_SIDEBAR;
      flipSideBtn.addEventListener("click", () => {
        this.sidebarSide = this.sidebarSide === "right" ? "left" : "right";
        sidebar.className = `cd-agent-sidebar side-${this.sidebarSide}`;
        this.syncUiStates();
      });
  
      const minBtn = document.createElement("button");
      minBtn.type = "button";
      minBtn.className = "cd-icon-btn";
      minBtn.title = "Minimize sidebar";
      minBtn.setAttribute("aria-label", "Minimize agent sidebar");
      minBtn.innerHTML = ICON_MINIMIZE;
      minBtn.addEventListener("click", () => this.minimizeToCompactBar());
  
      const closeBtn = document.createElement("button");
      closeBtn.type = "button";
      closeBtn.className = "cd-icon-btn";
      closeBtn.title = "Close sidebar (Esc)";
      closeBtn.setAttribute("aria-label", "Close agent sidebar");
      closeBtn.innerHTML = ICON_CLOSE;
      closeBtn.addEventListener("click", () => this.closeComposer());
  
      headerActions.appendChild(newThreadBtn);
      headerActions.appendChild(pushLayoutBtn);
      headerActions.appendChild(flipSideBtn);
      headerActions.appendChild(minBtn);
      headerActions.appendChild(closeBtn);
  
      header.appendChild(headerLeft);
      header.appendChild(headerActions);
      sidebar.appendChild(header);
  
      // 2. Provider + BYOK Vault + Cross-Environment Feedbacks Subbar
      const subbar = document.createElement("div");
      subbar.className = "cd-agent-subbar";
  
      const providerPill = document.createElement("button");
      providerPill.type = "button";
      providerPill.className = "cd-provider-pill-btn";
      providerPill.title = "Configure BYOK provider & model";
      providerPill.setAttribute("aria-label", "Configure BYOK provider and model");
      const keyDot = document.createElement("span");
      keyDot.className = "cd-key-dot";
      this.keyDotEl = keyDot;
      const providerLabel = document.createElement("span");
      providerLabel.className = "cd-provider-pill-label";
      providerLabel.textContent = "claude-sonnet-4 · BYOK";
      this.providerPillLabelEl = providerLabel;
      providerPill.appendChild(keyDot);
      providerPill.appendChild(providerLabel);
      providerPill.addEventListener("click", () => this.toggleByokDrawer());
      this.providerPillBtn = providerPill;
  
      const subbarRight = document.createElement("div");
      subbarRight.className = "cd-subbar-right";
  
      const keysBtn = document.createElement("button");
      keysBtn.type = "button";
      keysBtn.className = "cd-btn";
      keysBtn.setAttribute("aria-label", "Open BYOK API key settings");
      keysBtn.innerHTML = `${ICON_KEY}<span>BYOK</span>`;
      keysBtn.addEventListener("click", () => this.toggleByokDrawer());
      this.keysToggleBtn = keysBtn;
  
      const feedbacksBtn = document.createElement("button");
      feedbacksBtn.type = "button";
      feedbacksBtn.className = "cd-btn";
      feedbacksBtn.setAttribute("aria-label", "Browse feedbacks across environments");
      feedbacksBtn.innerHTML = `${ICON_INBOX}<span>Feedbacks</span>`;
      feedbacksBtn.addEventListener("click", () => this.toggleFeedbacksDrawer());
      this.feedbacksToggleBtn = feedbacksBtn;
  
      subbarRight.appendChild(keysBtn);
      subbarRight.appendChild(feedbacksBtn);
      subbar.appendChild(providerPill);
      subbar.appendChild(subbarRight);
      sidebar.appendChild(subbar);
  
      // 3. Inline BYOK Vault Drawer
      sidebar.appendChild(this.buildByokDrawerDom());
  
      // 4. Inline Cross-Environment Feedbacks Drawer
      sidebar.appendChild(this.buildFeedbacksDrawerDom());
  
      // 5. Agent Conversation Stream
      const stream = document.createElement("div");
      stream.className = "cd-agent-stream";
      stream.setAttribute("aria-live", "polite");
      this.agentStreamEl = stream;
      sidebar.appendChild(stream);
      this.renderAgentStream();
  
      // 6. Shared Context Tray + Status + Prompt Input Shell
      const agentTray = document.createElement("div");
      agentTray.className = "cd-tray";
      agentTray.setAttribute("aria-label", "Pinned DOM context for agent");
      this.agentTrayEl = agentTray;
      sidebar.appendChild(agentTray);
  
      const agentStatus = document.createElement("div");
      agentStatus.className = "cd-status";
      agentStatus.setAttribute("role", "status");
      agentStatus.hidden = true;
      this.agentStatusEl = agentStatus;
      sidebar.appendChild(agentStatus);
  
      const promptShell = document.createElement("div");
      promptShell.className = "cd-prompt-shell";
  
      const textarea = document.createElement("textarea");
      textarea.className = "cd-textarea";
      textarea.placeholder =
        "Ask the local agent to inspect pinned DOM elements, read Rails views, or propose a fix...";
      textarea.setAttribute("aria-label", "Agent prompt");
      textarea.addEventListener("keydown", (ev) => {
        if ((ev.metaKey || ev.ctrlKey) && ev.key === "Enter") {
          ev.preventDefault();
          void this.handleAgentSubmit();
        } else if (ev.key === "Escape") {
          ev.preventDefault();
          this.closeComposer();
        }
      });
      textarea.addEventListener("paste", (ev) => this.handlePaste(ev));
      this.agentTextareaEl = textarea;
      promptShell.appendChild(textarea);
  
      const toolbar = document.createElement("div");
      toolbar.className = "cd-toolbar";
      toolbar.appendChild(this.buildPromptToolbarActions(true));
  
      const sendBtn = document.createElement("button");
      sendBtn.type = "button";
      sendBtn.className = "cd-btn cd-btn-primary";
      sendBtn.setAttribute("aria-label", "Send prompt to local agent");
      sendBtn.innerHTML = `${ICON_SEND}<span>Ask Agent</span>`;
      sendBtn.addEventListener("click", () => {
        void this.handleAgentSubmit();
      });
      this.agentSendBtn = sendBtn;
  
      toolbar.appendChild(sendBtn);
      promptShell.appendChild(toolbar);
      sidebar.appendChild(promptShell);
  
      this.syncProviderControls();
      return sidebar;
    }
  
            buildByokDrawerDom()                 {
      const drawer = document.createElement("div");
      drawer.className = "cd-inline-drawer cd-byok-drawer";
      drawer.hidden = true;
      this.byokDrawerEl = drawer;
  
      const securityNote = document.createElement("div");
      securityNote.className = "cd-vault-security-note";
      securityNote.innerHTML = `${ICON_SHIELD}<span>Keys stay encrypted on disk in <code>tmp/context_drop_byok.enc</code> (AES-256-GCM) or read from server ENV—never stored in browser storage.</span>`;
      drawer.appendChild(securityNote);
  
      const grid = document.createElement("div");
      grid.className = "cd-form-grid";
  
      // Provider field
      const provField = document.createElement("div");
      provField.className = "cd-field";
      const provLabel = document.createElement("label");
      provLabel.className = "cd-field-label";
      provLabel.textContent = "Provider";
      const provSelect = document.createElement("select");
      provSelect.className = "cd-select";
      provSelect.setAttribute("aria-label", "LLM Provider");
      provSelect.addEventListener("change", () => {
        this.selectedVaultProviderId = provSelect.value;
        this.syncByokDrawerFields();
      });
      this.byokProviderSelect = provSelect;
      provField.appendChild(provLabel);
      provField.appendChild(provSelect);
      grid.appendChild(provField);
  
      // Preset model picker
      const presetField = document.createElement("div");
      presetField.className = "cd-field";
      const presetLabel = document.createElement("label");
      presetLabel.className = "cd-field-label";
      presetLabel.textContent = "Preset";
      const presetSelect = document.createElement("select");
      presetSelect.className = "cd-select";
      presetSelect.setAttribute("aria-label", "Model preset");
      presetSelect.addEventListener("change", () => {
        if (this.byokModelInput && presetSelect.value) {
          this.byokModelInput.value = presetSelect.value;
        }
      });
      this.byokModelPresetsSelect = presetSelect;
      presetField.appendChild(presetLabel);
      presetField.appendChild(presetSelect);
      grid.appendChild(presetField);
  
      // Editable model ID
      const modelField = document.createElement("div");
      modelField.className = "cd-field is-full";
      const modelLabel = document.createElement("label");
      modelLabel.className = "cd-field-label";
      modelLabel.textContent = "Model ID";
      const modelInput = document.createElement("input");
      modelInput.type = "text";
      modelInput.className = "cd-input is-mono";
      modelInput.setAttribute("aria-label", "Model identifier");
      this.byokModelInput = modelInput;
      modelField.appendChild(modelLabel);
      modelField.appendChild(modelInput);
      grid.appendChild(modelField);
  
      // Optional Base URL field (for custom OpenAI-compatible provider)
      const baseUrlField = document.createElement("div");
      baseUrlField.className = "cd-field is-full";
      baseUrlField.hidden = true;
      const baseUrlLabel = document.createElement("label");
      baseUrlLabel.className = "cd-field-label";
      baseUrlLabel.textContent = "OpenAI-Compatible Base URL";
      const baseUrlInput = document.createElement("input");
      baseUrlInput.type = "url";
      baseUrlInput.className = "cd-input is-mono";
      baseUrlInput.placeholder = "https://openrouter.ai/api/v1 or http://localhost:11434/v1";
      baseUrlInput.setAttribute("aria-label", "Custom OpenAI-compatible Base URL");
      this.byokBaseUrlInput = baseUrlInput;
      baseUrlField.appendChild(baseUrlLabel);
      baseUrlField.appendChild(baseUrlInput);
      this.byokBaseUrlField = baseUrlField;
      grid.appendChild(baseUrlField);
  
      // API Key field
      const keyField = document.createElement("div");
      keyField.className = "cd-field is-full";
      const keyLabel = document.createElement("label");
      keyLabel.className = "cd-field-label";
      const keyLabelText = document.createElement("span");
      keyLabelText.textContent = "API Key";
      const keyBadge = document.createElement("span");
      keyBadge.className = "cd-key-source-badge";
      keyBadge.hidden = true;
      this.byokKeySourceBadge = keyBadge;
      keyLabel.appendChild(keyLabelText);
      keyLabel.appendChild(keyBadge);
  
      const keyInput = document.createElement("input");
      keyInput.type = "password";
      keyInput.autocomplete = "off";
      keyInput.className = "cd-input is-mono";
      keyInput.placeholder = "Paste API key (leave blank to keep existing key)";
      keyInput.setAttribute("aria-label", "Provider API Key");
      this.byokKeyInput = keyInput;
      keyField.appendChild(keyLabel);
      keyField.appendChild(keyInput);
      grid.appendChild(keyField);
  
      drawer.appendChild(grid);
  
      const actions = document.createElement("div");
      actions.className = "cd-drawer-actions";
  
      const clearBtn = document.createElement("button");
      clearBtn.type = "button";
      clearBtn.className = "cd-btn cd-btn-danger-outline";
      clearBtn.textContent = "Clear Vault Key";
      clearBtn.addEventListener("click", () => {
        void this.handleClearByokKey();
      });
  
      const rightGroup = document.createElement("div");
      rightGroup.className = "cd-diff-btn-group";
  
      const closeBtn = document.createElement("button");
      closeBtn.type = "button";
      closeBtn.className = "cd-btn";
      closeBtn.textContent = "Close";
      closeBtn.addEventListener("click", () => {
        this.isByokDrawerOpen = false;
        this.syncUiStates();
      });
  
      const saveBtn = document.createElement("button");
      saveBtn.type = "button";
      saveBtn.className = "cd-btn cd-btn-primary";
      saveBtn.textContent = "Use & Save";
      saveBtn.addEventListener("click", () => {
        void this.handleSaveByokSettings();
      });
  
      rightGroup.appendChild(closeBtn);
      rightGroup.appendChild(saveBtn);
      actions.appendChild(clearBtn);
      actions.appendChild(rightGroup);
      drawer.appendChild(actions);
  
      return drawer;
    }
  
            buildFeedbacksDrawerDom()                 {
      const drawer = document.createElement("div");
      drawer.className = "cd-inline-drawer cd-feedbacks-drawer";
      drawer.hidden = true;
      this.feedbacksDrawerEl = drawer;
  
      const filterRow = document.createElement("div");
      filterRow.className = "cd-env-filter-row";
  
      const tabs = document.createElement("div");
      tabs.className = "cd-env-tabs";
      this.feedbacksTabsEl = tabs;
      filterRow.appendChild(tabs);
  
      const refreshBtn = document.createElement("button");
      refreshBtn.type = "button";
      refreshBtn.className = "cd-btn";
      refreshBtn.textContent = "Refresh";
      refreshBtn.addEventListener("click", () => {
        void this.loadCrossEnvFeedbacks(this.feedbacksEnvFilter);
      });
      filterRow.appendChild(refreshBtn);
      drawer.appendChild(filterRow);
  
      const list = document.createElement("div");
      list.className = "cd-feedbacks-list";
      this.feedbacksListEl = list;
      drawer.appendChild(list);
  
      return drawer;
    }
  
            getShortEnvironmentSlug()         {
      const raw = (this.config.environment || "development").toLowerCase();
      if (raw === "development") return "dev";
      if (raw === "production") return "prod";
      return raw;
    }
  
            toggleByokDrawer()       {
      this.isByokDrawerOpen = !this.isByokDrawerOpen;
      if (this.isByokDrawerOpen) {
        this.isFeedbacksDrawerOpen = false;
        this.selectedVaultProviderId = this.activeProviderId;
        this.syncProviderControls();
      }
      this.syncUiStates();
    }
  
            toggleFeedbacksDrawer()       {
      this.isFeedbacksDrawerOpen = !this.isFeedbacksDrawerOpen;
      if (this.isFeedbacksDrawerOpen) {
        this.isByokDrawerOpen = false;
        void this.loadCrossEnvFeedbacks(this.feedbacksEnvFilter);
      }
      this.syncUiStates();
    }
  
            async ensureAgentStatusLoaded()                {
      if (this.agentStatusLoaded) return;
      try {
        const status                      = await this.apiClient.fetchAgentStatus();
        this.agentStatusLoaded = true;
        this.agentWorkspaceName = status.workspace_name || this.agentWorkspaceName;
        if (Array.isArray(status.mcp_environments) && status.mcp_environments.length > 0) {
          this.agentMcpEnvironments = status.mcp_environments.map((e) => e.name);
        }
        if (Array.isArray(status.providers) && status.providers.length > 0) {
          this.agentProviders = status.providers;
        }
        if (status.active_provider) {
          this.activeProviderId = status.active_provider;
          this.selectedVaultProviderId = status.active_provider;
        }
        this.syncProviderControls();
        this.renderAgentStream();
      } catch {
        // Keep fallback provider definitions if offline
      }
    }
  
            getActiveProviderInfo()                    {
      return (
        this.agentProviders.find((p) => p.id === this.activeProviderId) ||
        this.agentProviders[0] ||
        DEFAULT_PROVIDERS_FALLBACK[0]
      );
    }
  
            syncProviderControls()       {
      const active = this.getActiveProviderInfo();
      if (this.keyDotEl) {
        this.keyDotEl.classList.toggle("is-ready", Boolean(active.configured));
      }
      if (this.providerPillLabelEl) {
        const sourceTag =
          active.source === "env"
            ? "ENV"
            : active.source === "vault"
              ? "Vault"
              : active.source === "local_no_key"
                ? "Local"
                : "Set BYOK";
        this.providerPillLabelEl.textContent = `${active.model} · ${sourceTag}`;
      }
  
      if (this.byokProviderSelect) {
        this.byokProviderSelect.innerHTML = "";
        for (const prov of this.agentProviders) {
          const opt = document.createElement("option");
          opt.value = prov.id;
          opt.textContent = prov.configured ? `${prov.label} (Ready)` : prov.label;
          if (prov.id === this.selectedVaultProviderId) {
            opt.selected = true;
          }
          this.byokProviderSelect.appendChild(opt);
        }
        this.byokProviderSelect.value = this.selectedVaultProviderId;
      }
  
      this.syncByokDrawerFields();
    }
  
            syncByokDrawerFields()       {
      const selected =
        this.agentProviders.find((p) => p.id === this.selectedVaultProviderId) ||
        this.getActiveProviderInfo();
  
      if (this.byokModelPresetsSelect) {
        this.byokModelPresetsSelect.innerHTML = "";
        for (const modelName of selected.models || [selected.default_model]) {
          const opt = document.createElement("option");
          opt.value = modelName;
          opt.textContent = modelName;
          if (modelName === selected.model) {
            opt.selected = true;
          }
          this.byokModelPresetsSelect.appendChild(opt);
        }
      }
  
      if (this.byokModelInput) {
        this.byokModelInput.value = selected.model || selected.default_model;
      }
  
      if (this.byokBaseUrlField && this.byokBaseUrlInput) {
        this.byokBaseUrlField.hidden = !selected.supports_base_url;
        this.byokBaseUrlInput.value = selected.base_url || "";
      }
  
      if (this.byokKeySourceBadge) {
        if (selected.configured) {
          this.byokKeySourceBadge.hidden = false;
          const src =
            selected.source === "env"
              ? `ENV ${selected.env_var_hint}`
              : selected.source === "vault"
                ? "Vault"
                : "Local URL";
          this.byokKeySourceBadge.textContent = selected.masked_key
            ? `${src} (${selected.masked_key})`
            : src;
        } else {
          this.byokKeySourceBadge.hidden = true;
        }
      }
  
      if (this.byokKeyInput) {
        this.byokKeyInput.value = "";
        this.byokKeyInput.placeholder = selected.configured
          ? "Leave blank to keep configured key, or paste to override"
          : `Paste key or export ${selected.env_var_hint}`;
      }
    }
  
            async handleSaveByokSettings()                {
      const provider = this.byokProviderSelect?.value || this.selectedVaultProviderId;
      const model = (this.byokModelInput?.value || "").trim();
      const rawKey = (this.byokKeyInput?.value || "").trim();
      const baseUrl = (this.byokBaseUrlInput?.value || "").trim();
  
      try {
        const payload   
                           
                         
                           
                            
                               
          = {
          provider,
          model: model || undefined,
          make_active: true
        };
        if (rawKey.length > 0) {
          payload.api_key = rawKey;
        }
        if (provider === "custom") {
          payload.base_url = baseUrl;
        }
  
        const updated = await this.apiClient.saveAgentKeys(payload);
        if (this.byokKeyInput) {
          this.byokKeyInput.value = "";
        }
        this.activeProviderId = updated.active_provider || provider;
        this.selectedVaultProviderId = this.activeProviderId;
        if (Array.isArray(updated.providers)) {
          this.agentProviders = updated.providers;
        }
        this.isByokDrawerOpen = false;
        this.syncProviderControls();
        this.syncUiStates();
        this.showStatus("Saved provider settings in local encrypted vault.", "success");
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Failed to save BYOK settings.";
        this.showStatus(msg, "error");
      }
    }
  
            async handleClearByokKey()                {
      const provider = this.byokProviderSelect?.value || this.selectedVaultProviderId;
      try {
        const updated = await this.apiClient.deleteAgentKeys(provider);
        if (this.byokKeyInput) {
          this.byokKeyInput.value = "";
        }
        if (Array.isArray(updated.providers)) {
          this.agentProviders = updated.providers;
        }
        this.activeProviderId = updated.active_provider || this.activeProviderId;
        this.syncProviderControls();
        this.showStatus(`Cleared stored vault key for ${provider}.`, "success");
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Failed to clear key.";
        this.showStatus(msg, "error");
      }
    }
  
            async loadCrossEnvFeedbacks(environment        )                {
      this.feedbacksEnvFilter = environment;
      this.isLoadingFeedbacks = true;
      this.renderFeedbacksDrawerContent();
  
      try {
        const res = await this.apiClient.fetchAgentFeedbacks(environment, "new");
        this.crossEnvFeedbacks = Array.isArray(res.feedbacks) ? res.feedbacks : [];
        if (Array.isArray(res.environments_queried) && res.environments_queried.length > 0) {
          for (const envName of res.environments_queried) {
            if (!this.agentMcpEnvironments.includes(envName)) {
              this.agentMcpEnvironments.push(envName);
            }
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Failed to query feedbacks.";
        this.showStatus(msg, "error");
      } finally {
        this.isLoadingFeedbacks = false;
        this.renderFeedbacksDrawerContent();
      }
    }
  
            renderFeedbacksDrawerContent()       {
      if (this.feedbacksTabsEl) {
        this.feedbacksTabsEl.innerHTML = "";
        const envOptions = ["all", ...this.agentMcpEnvironments];
        for (const envName of envOptions) {
          const tab = document.createElement("button");
          tab.type = "button";
          tab.className = `cd-env-tab${this.feedbacksEnvFilter === envName ? " is-active" : ""}`;
          tab.textContent = envName;
          tab.addEventListener("click", () => {
            void this.loadCrossEnvFeedbacks(envName);
          });
          this.feedbacksTabsEl.appendChild(tab);
        }
      }
  
      if (!this.feedbacksListEl) return;
      this.feedbacksListEl.innerHTML = "";
  
      if (this.isLoadingFeedbacks) {
        const loading = document.createElement("div");
        loading.className = "cd-chat-empty-hint";
        loading.textContent = "Querying connected MCP environments...";
        this.feedbacksListEl.appendChild(loading);
        return;
      }
  
      if (this.crossEnvFeedbacks.length === 0) {
        const empty = document.createElement("div");
        empty.className = "cd-chat-empty-hint";
        empty.textContent = `No open feedbacks found in ${this.feedbacksEnvFilter}.`;
        this.feedbacksListEl.appendChild(empty);
        return;
      }
  
      for (const item of this.crossEnvFeedbacks) {
        const row = document.createElement("div");
        row.className = "cd-feedback-row";
  
        const top = document.createElement("div");
        top.className = "cd-feedback-row-top";
  
        const idBadge = document.createElement("span");
        idBadge.className = "cd-feedback-row-id";
        const qid = item.qualified_id || `${item.environment}:${item.id}`;
        idBadge.textContent = item.primary_selector ? `${qid} · ${item.primary_selector}` : qid;
  
        const investigateBtn = document.createElement("button");
        investigateBtn.type = "button";
        investigateBtn.className = "cd-btn";
        investigateBtn.textContent = "Investigate";
        investigateBtn.addEventListener("click", () => {
          const prompt = `Investigate feedback ${qid} ("${item.message}")${item.primary_selector ? ` targeting \`${item.primary_selector}\`` : ""} and propose a fix if needed.`;
          if (this.agentTextareaEl) {
            this.agentTextareaEl.value = prompt;
            this.agentTextareaEl.focus();
          }
          this.isFeedbacksDrawerOpen = false;
          this.syncUiStates();
        });
  
        top.appendChild(idBadge);
        top.appendChild(investigateBtn);
  
        const msgP = document.createElement("p");
        msgP.className = "cd-feedback-row-msg";
        msgP.textContent = item.message || "(Context drop without text)";
  
        row.appendChild(top);
        row.appendChild(msgP);
        this.feedbacksListEl.appendChild(row);
      }
    }
  
            renderAgentStream()       {
      if (!this.agentStreamEl) return;
      this.agentStreamEl.innerHTML = "";
  
      if (this.agentMessages.length === 0 && !this.isAgentBusy) {
        const empty = document.createElement("div");
        empty.className = "cd-agent-empty";
  
        const title = document.createElement("p");
        title.className = "cd-agent-empty-title";
        title.textContent = `Inspect & edit ${this.agentWorkspaceName} from the live DOM.`;
  
        const desc = document.createElement("p");
        desc.className = "cd-agent-empty-desc";
        desc.textContent = `Connected MCP environments: ${this.agentMcpEnvironments.join(", ")}. File edits always stage an inline diff for your approval.`;
  
        const starters = document.createElement("div");
        starters.className = "cd-starter-list";
  
        const starterItems                                               = [
          {
            label: "Pin an element on this page & find its Rails template",
            action: () => {
              if (this.elementReferences.length === 0) {
                this.startPinSelection();
              } else if (this.agentTextareaEl) {
                this.agentTextareaEl.value =
                  "Locate the Rails view/partial rendering the pinned element and explain how it is styled.";
                void this.handleAgentSubmit();
              }
            }
          },
          {
            label: "Triage open feedbacks across all environments",
            action: () => {
              if (this.agentTextareaEl) {
                this.agentTextareaEl.value =
                  "List open ContextDrop feedbacks across all environments and summarize the highest-priority UI issues.";
                void this.handleAgentSubmit();
              }
            }
          },
          {
            label: "Inspect pinned element spacing & propose a clean CSS/ERB fix",
            action: () => {
              if (this.agentTextareaEl) {
                this.agentTextareaEl.value =
                  "Inspect the pinned element in the workspace and stage a proposed file edit to polish its layout and accessibility.";
                this.agentTextareaEl.focus();
              }
            }
          }
        ];
  
        for (const item of starterItems) {
          const btn = document.createElement("button");
          btn.type = "button";
          btn.className = "cd-starter-btn";
          const span = document.createElement("span");
          span.textContent = item.label;
          const arrow = document.createElement("span");
          arrow.innerHTML = ICON_CHEVRON_RIGHT;
          btn.appendChild(span);
          btn.appendChild(arrow);
          btn.addEventListener("click", item.action);
          starters.appendChild(btn);
        }
  
        empty.appendChild(title);
        empty.appendChild(desc);
        empty.appendChild(starters);
        this.agentStreamEl.appendChild(empty);
        return;
      }
  
      for (const msg of this.agentMessages) {
        const card = document.createElement("div");
        card.className = `cd-agent-msg is-${msg.role}`;
  
        if (msg.role === "user") {
          if ((msg.elements && msg.elements.length > 0) || (msg.attachments && msg.attachments.length > 0)) {
            const pills = document.createElement("div");
            pills.className = "cd-chat-msg-pills";
            for (const el of msg.elements || []) {
              const pill = document.createElement("span");
              pill.className = "cd-chat-msg-pill";
              pill.textContent = el.selector;
              pills.appendChild(pill);
            }
            for (const att of msg.attachments || []) {
              const pill = document.createElement("span");
              pill.className = "cd-chat-msg-pill";
              pill.textContent = att.label;
              pills.appendChild(pill);
            }
            card.appendChild(pills);
          }
  
          const textP = document.createElement("p");
          textP.className = "cd-chat-msg-text";
          textP.textContent = msg.content;
          card.appendChild(textP);
        } else {
          if (msg.toolCalls && msg.toolCalls.length > 0) {
            const traces = document.createElement("div");
            traces.className = "cd-tool-traces";
            for (const trace of msg.toolCalls) {
              const row = document.createElement("div");
              row.className = `cd-tool-trace${trace.status === "error" ? " is-error" : ""}`;
              const badge = document.createElement("span");
              badge.className = "cd-tool-trace-badge";
              badge.textContent = trace.name;
              const summary = document.createElement("span");
              summary.className = "cd-tool-trace-summary";
              summary.textContent = trace.summary;
              row.appendChild(badge);
              row.appendChild(summary);
              traces.appendChild(row);
            }
            card.appendChild(traces);
          }
  
          if (msg.content) {
            const mdBody = document.createElement("div");
            mdBody.className = "cd-md-body";
            mdBody.innerHTML = renderSafeMarkdown(msg.content);
            card.appendChild(mdBody);
          }
  
          if (msg.proposedEdits && msg.proposedEdits.length > 0) {
            for (const edit of msg.proposedEdits) {
              card.appendChild(this.buildDiffCardDom(edit));
            }
          }
        }
  
        this.agentStreamEl.appendChild(card);
      }
  
      if (this.isAgentBusy) {
        const thinking = document.createElement("div");
        thinking.className = "cd-agent-thinking";
        const lbl = document.createElement("span");
        lbl.className = "cd-thinking-label";
        lbl.textContent = "Inspecting workspace & DOM context...";
        const b1 = document.createElement("div");
        b1.className = "cd-skeleton-bar";
        const b2 = document.createElement("div");
        b2.className = "cd-skeleton-bar is-short";
        thinking.appendChild(lbl);
        thinking.appendChild(b1);
        thinking.appendChild(b2);
        this.agentStreamEl.appendChild(thinking);
      }
  
      this.agentStreamEl.scrollTop = this.agentStreamEl.scrollHeight;
    }
  
            buildDiffCardDom(edit                  )                 {
      const card = document.createElement("div");
      card.className = "cd-diff-card";
      card.setAttribute("data-edit-id", edit.id);
  
      const header = document.createElement("div");
      header.className = "cd-diff-card-header";
  
      const pathGroup = document.createElement("div");
      pathGroup.className = "cd-diff-path-group";
      const iconSpan = document.createElement("span");
      iconSpan.innerHTML = ICON_FILE_CODE;
      const pathSpan = document.createElement("span");
      pathSpan.className = "cd-diff-path";
      pathSpan.textContent = edit.path;
      pathSpan.title = edit.path;
      pathGroup.appendChild(iconSpan);
      pathGroup.appendChild(pathSpan);
  
      const stats = document.createElement("div");
      stats.className = "cd-diff-stats";
      const addSpan = document.createElement("span");
      addSpan.className = "cd-diff-stat-add";
      addSpan.textContent = `+${edit.added_lines}`;
      const delSpan = document.createElement("span");
      delSpan.className = "cd-diff-stat-del";
      delSpan.textContent = `-${edit.removed_lines}`;
      stats.appendChild(addSpan);
      stats.appendChild(delSpan);
  
      header.appendChild(pathGroup);
      header.appendChild(stats);
      card.appendChild(header);
  
      if (edit.summary) {
        const summary = document.createElement("div");
        summary.className = "cd-diff-summary";
        summary.textContent = edit.summary;
        card.appendChild(summary);
      }
  
      card.appendChild(buildUnifiedDiffElement(document, edit.diff));
  
      const footer = document.createElement("div");
      footer.className = "cd-diff-footer";
  
      const statusPill = document.createElement("span");
      statusPill.className = `cd-diff-status-pill${edit.status === "applied" ? " is-applied" : edit.status === "rejected" ? " is-rejected" : ""}`;
      if (edit.status === "applied") {
        statusPill.innerHTML = `${ICON_CHECK}<span>Applied to workspace</span>`;
      } else if (edit.status === "rejected") {
        statusPill.textContent = "Rejected";
      } else if (edit.status === "reverted") {
        statusPill.textContent = "Reverted";
      } else {
        statusPill.textContent = "Staged · Awaiting approval";
      }
      footer.appendChild(statusPill);
  
      const btnGroup = document.createElement("div");
      btnGroup.className = "cd-diff-btn-group";
  
      if (edit.status === "pending") {
        const rejectBtn = document.createElement("button");
        rejectBtn.type = "button";
        rejectBtn.className = "cd-btn";
        rejectBtn.textContent = "Reject";
        rejectBtn.addEventListener("click", () => {
          void this.handleEditDecision(edit, "reject");
        });
  
        const applyBtn = document.createElement("button");
        applyBtn.type = "button";
        applyBtn.className = "cd-btn cd-btn-apply";
        applyBtn.innerHTML = `${ICON_CHECK}<span>Apply Change</span>`;
        applyBtn.addEventListener("click", () => {
          void this.handleEditDecision(edit, "apply");
        });
  
        btnGroup.appendChild(rejectBtn);
        btnGroup.appendChild(applyBtn);
      } else if (edit.status === "applied") {
        const revertBtn = document.createElement("button");
        revertBtn.type = "button";
        revertBtn.className = "cd-btn";
        revertBtn.innerHTML = `${ICON_UNDO}<span>Revert</span>`;
        revertBtn.addEventListener("click", () => {
          void this.handleEditDecision(edit, "revert");
        });
        btnGroup.appendChild(revertBtn);
      }
  
      footer.appendChild(btnGroup);
      card.appendChild(footer);
      return card;
    }
  
            async handleEditDecision(
      edit                  ,
      action                               
    )                {
      try {
        const res =
          action === "apply"
            ? await this.apiClient.applyEdit(edit.id)
            : action === "reject"
              ? await this.apiClient.rejectEdit(edit.id)
              : await this.apiClient.revertEdit(edit.id);
  
        if (res?.edit) {
          edit.status = res.edit.status;
        }
        this.renderAgentStream();
        if (action === "apply") {
          this.showStatus(`Applied change to ${edit.path}. Reload page if needed.`, "success");
        } else if (action === "revert") {
          this.showStatus(`Reverted ${edit.path} to original contents.`, "success");
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : `Failed to ${action} edit.`;
        this.showStatus(msg, "error");
      }
    }
  
           async handleAgentSubmit()                {
      if (this.isAgentBusy) return;
  
      const rawPrompt = (this.agentTextareaEl?.value || "").trim();
      if (
        rawPrompt.length === 0 &&
        this.elementReferences.length === 0 &&
        this.attachments.length === 0
      ) {
        this.showStatus("Enter a prompt or pin an element on the page first.", "error");
        return;
      }
  
      const promptText =
        rawPrompt || "Inspect the pinned DOM element(s) in this Rails workspace and explain how they work.";
  
      const attachedElements = [...this.elementReferences];
      const attachedMedia = this.attachments.map((att) => ({
        id: att.id,
        label: att.label,
        preview_url: att.preview_url,
        attachment_type: att.attachment_type
      }));
      const requestAttachments = this.attachments.map((att) => ({
        attachment_type: att.attachment_type,
        filename: att.filename,
        data_url: att.data_url
      }));
  
      const now = new Date();
      const timeLabel = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  
      const userMsg                   = {
        id: `msg_${Date.now()}_u`,
        role: "user",
        content: promptText,
        createdAt: timeLabel,
        elements: attachedElements,
        attachments: attachedMedia
      };
      this.agentMessages.push(userMsg);
  
      if (this.agentTextareaEl) {
        this.agentTextareaEl.value = "";
      }
      this.elementReferences = [];
      this.elementDomNodes.clear();
      this.attachments = [];
      this.picker?.hideExternalPreview();
      this.renderTray();
  
      this.isAgentBusy = true;
      if (this.agentSendBtn) {
        this.agentSendBtn.disabled = true;
        this.agentSendBtn.innerHTML = `<span>Working...</span>`;
      }
      this.renderAgentStream();
      this.syncUiStates();
  
      try {
        const activeProv = this.getActiveProviderInfo();
        const res = await this.apiClient.sendAgentChat({
          messages: this.agentMessages.map((m) => ({ role: m.role, content: m.content })),
          page_url: typeof window !== "undefined" ? window.location.href : "/",
          element_references: attachedElements,
          attachments: requestAttachments,
          provider: activeProv.id,
          model: activeProv.model
        });
  
        this.agentMessages.push({
          id: `msg_${Date.now()}_a`,
          role: "assistant",
          content: res.reply || "",
          createdAt: timeLabel,
          toolCalls: res.tool_calls || [],
          proposedEdits: res.proposed_edits || [],
          provider: res.provider,
          model: res.model
        });
        this.hideStatus();
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Agent request failed.";
        if (/no api key|byok|api_key/i.test(msg)) {
          this.isByokDrawerOpen = true;
        }
        this.showStatus(msg, "error");
      } finally {
        this.isAgentBusy = false;
        if (this.agentSendBtn) {
          this.agentSendBtn.disabled = false;
          this.agentSendBtn.innerHTML = `${ICON_SEND}<span>Ask Agent</span>`;
        }
        this.renderAgentStream();
        this.syncUiStates();
      }
    }
  
            syncPinActiveIndicators(pickerActive         )       {
      for (const btn of [this.cornerPinBtn, this.sidebarPinBtn]) {
        if (btn) {
          btn.classList.toggle("is-active", pickerActive);
          btn.setAttribute("aria-pressed", String(pickerActive));
        }
      }
      if (this.compactPinBtn) {
        const smartMode = this.isSmartSelectionMode();
        this.compactPinBtn.classList.toggle("is-active", pickerActive);
        if (smartMode) {
          this.compactPinBtn.title = "Highlight an area on the page";
          this.compactPinBtn.setAttribute("aria-label", "Toggle page highlight mode");
          this.compactPinBtn.innerHTML = pickerActive
            ? `${ICON_PIN}<span>Selecting</span>`
            : `${ICON_PIN}<span>Select area</span>`;
        } else {
          this.compactPinBtn.title = "Toggle Freeze & Pin (⌥⇧P)";
          this.compactPinBtn.setAttribute("aria-label", "Toggle element pin mode (Option+Shift+P)");
          this.compactPinBtn.innerHTML = pickerActive
            ? `${ICON_PIN}<span>Pinning</span>`
            : `${ICON_PIN}<span>Pin Element</span>`;
        }
      }
    }
  
            getVisibleContextCount()         {
      if (!this.isSmartSelectionMode()) {
        return this.elementReferences.length + this.attachments.length;
      }
      const unlinkedAttachments = this.attachments.filter(
        (att) =>
          !(
            att.metadata?.auto_smart_context === true &&
            att.element_reference_ref &&
            this.elementReferences.some((el) => el.client_ref === att.element_reference_ref)
          )
      );
      return this.elementReferences.length + unlinkedAttachments.length;
    }
  
            syncUiStates()       {
      const pickerActive = this.picker ? this.picker.isActive() : false;
      const totalContextCount = this.getVisibleContextCount();
      const agentMode = this.isAgentModeActive();
      const smartMode = this.isSmartSelectionMode();
  
      const showAgentSidebar = this.isOpen && !this.isMinimized && agentMode;
      const showFeedbackComposer = this.isOpen && !this.isMinimized && !agentMode;
  
      if (this.composerEl) {
        this.composerEl.hidden = !showFeedbackComposer;
        this.composerEl.classList.toggle("is-smart-mode", smartMode);
      }
      if (this.composerTitleEl) {
        this.composerTitleEl.textContent = smartMode ? "Send Feedback" : "ContextDrop";
      }
      if (this.composerMinBtn) {
        this.composerMinBtn.hidden = smartMode;
      }
      if (this.composerModeSwitchWrap) {
        this.composerModeSwitchWrap.hidden = !this.config.agent?.enabled;
      }
      if (this.textareaEl && !this.customPlaceholderSet) {
        this.textareaEl.placeholder = smartMode
          ? DEFAULT_SMART_PLACEHOLDER
          : DEFAULT_VERBOSE_PLACEHOLDER;
      }
      if (this.composerToolbarPickBtn) {
        if (smartMode) {
          this.composerToolbarPickBtn.title = "Highlight an area on the page";
          this.composerToolbarPickBtn.setAttribute("aria-label", "Highlight an area on the page");
          this.composerToolbarPickBtn.innerHTML = `${ICON_PIN}<span>Select area</span>`;
        } else {
          this.composerToolbarPickBtn.title = "Freeze & Pin element (⌥⇧P)";
          this.composerToolbarPickBtn.setAttribute(
            "aria-label",
            "Pin HTML element as context (Option+Shift+P)"
          );
          this.composerToolbarPickBtn.innerHTML = `${ICON_PIN}<span>Pin</span><kbd class="cd-kbd">⌥⇧P</kbd>`;
        }
      }
      if (this.composerToolbarScreenshotBtn) {
        this.composerToolbarScreenshotBtn.hidden = smartMode;
      }
      if (this.composerToolbarUploadBtn) {
        this.composerToolbarUploadBtn.innerHTML = smartMode
          ? `${ICON_IMAGE}<span>Add image</span>`
          : `${ICON_IMAGE}<span>Image</span>`;
      }
  
      if (this.agentSidebarEl) {
        this.agentSidebarEl.hidden = !showAgentSidebar;
      }
      if (this.sidebarEnvPillEl) {
        this.sidebarEnvPillEl.textContent = this.getShortEnvironmentSlug();
      }
      if (this.sidebarPushBtn) {
        this.sidebarPushBtn.classList.toggle("is-active", this.pushPageLayout);
      }
      if (this.byokDrawerEl) {
        this.byokDrawerEl.hidden = !this.isByokDrawerOpen;
      }
      if (this.keysToggleBtn) {
        this.keysToggleBtn.classList.toggle("is-active", this.isByokDrawerOpen);
      }
      if (this.feedbacksDrawerEl) {
        this.feedbacksDrawerEl.hidden = !this.isFeedbacksDrawerOpen;
      }
      if (this.feedbacksToggleBtn) {
        this.feedbacksToggleBtn.classList.toggle("is-active", this.isFeedbacksDrawerOpen);
      }
  
      this.syncHostPagePushMargin(showAgentSidebar && this.pushPageLayout);
  
      if (this.compactBarEl) {
        this.compactBarEl.hidden = !(this.isOpen && this.isMinimized);
        this.compactBarEl.classList.toggle("is-smart-mode", smartMode);
      }
  
      if (this.bookCornerBtn) {
        this.bookCornerBtn.hidden = this.isOpen;
        this.bookCornerBtn.setAttribute("aria-expanded", String(this.isOpen && !this.isMinimized));
        this.bookCornerBtn.setAttribute(
          "aria-label",
          smartMode
            ? "Send feedback or drag corner to highlight part of the page"
            : "Open ContextDrop chatbox, or drag corner to pin an element on the page"
        );
      }
      if (this.bookCornerHintEl) {
        this.bookCornerHintEl.textContent = this.config.agent?.enabled
          ? "Open Agent · Drag to pin"
          : smartMode
            ? "Send feedback · Drag to highlight"
            : "Click to chat · Drag to pin";
      }
      if (this.bookCornerAgentDotEl) {
        this.bookCornerAgentDotEl.hidden = !this.config.agent?.enabled;
      }
      if (this.bookCornerCountEl) {
        this.bookCornerCountEl.hidden = totalContextCount === 0;
        this.bookCornerCountEl.textContent = String(totalContextCount);
      }
  
      const pinCountHtml =
        this.elementReferences.length > 0
          ? `<span class="cd-count-pill">${this.elementReferences.length}</span>`
          : "";
      if (this.cornerPinBtn) {
        if (smartMode) {
          this.cornerPinBtn.title = "Highlight an area on the page";
          this.cornerPinBtn.setAttribute("aria-label", "Highlight an area on the page");
          this.cornerPinBtn.innerHTML = `${ICON_PIN}<span>Select area</span>${pinCountHtml}`;
        } else {
          this.cornerPinBtn.title = "Freeze & Pin element (⌥⇧P)";
          this.cornerPinBtn.setAttribute(
            "aria-label",
            "Select DOM element on page (Option+Shift+P)"
          );
          this.cornerPinBtn.innerHTML = `${ICON_PIN}<span>Pin Element</span>${pinCountHtml}`;
        }
      }
      if (this.sidebarPinBtn) {
        this.sidebarPinBtn.innerHTML = `${ICON_PIN}<span>Pin</span>${pinCountHtml}`;
      }
  
      this.syncPinActiveIndicators(pickerActive);
      if (!this.isPeelDragging) {
        this.renderCompactCoachBar(
          pickerActive,
          this.picker ? this.picker.getCandidateStack().length : 0
        );
      }
    }
  
            renderCompactCoachBar(pickerActive         , candidateCount         = 0)       {
      if (!this.compactStatusEl) return;
      this.compactStatusEl.innerHTML = "";
  
      const smartMode = this.isSmartSelectionMode();
      const pinnedCount = this.elementReferences.length;
      const totalContextCount = this.getVisibleContextCount();
  
      if (this.compactStepGroupEl) {
        this.compactStepGroupEl.hidden = !pickerActive || smartMode;
      }
      if (this.compactLayerUpBtn) {
        this.compactLayerUpBtn.disabled = candidateCount <= 1;
      }
      if (this.compactLayerDownBtn) {
        this.compactLayerDownBtn.disabled = candidateCount <= 1;
      }
  
      if (pickerActive && smartMode) {
        const coach = document.createElement("span");
        coach.className = "cd-compact-coach-text";
        coach.textContent = "Click any part of the page to highlight it";
        this.compactStatusEl.appendChild(coach);
  
        if (this.compactDoneBtn) {
          this.compactDoneBtn.className = "cd-btn";
          this.compactDoneBtn.setAttribute("aria-label", "Cancel selection and return to feedback");
          this.compactDoneBtn.innerHTML = `<span>Cancel</span>`;
        }
        return;
      }
  
      if (pickerActive) {
        if (pinnedCount === 0) {
          const coach = document.createElement("span");
          coach.className = "cd-compact-coach-text";
          coach.innerHTML = `<strong>Space</strong><span>or click to pin</span><span>·</span><span class="cd-compact-wheel-icon">${ICON_SCROLL_VERTICAL}</span><strong>Scroll</strong><span>layers</span><span>·</span><kbd class="cd-kbd">⌥⇧P</kbd><span>freeze</span>`;
          this.compactStatusEl.appendChild(coach);
        } else {
          const latest = this.elementReferences[pinnedCount - 1];
          const pill = document.createElement("div");
          pill.className = "cd-compact-pinned-pill";
  
          const countSpan = document.createElement("span");
          countSpan.className = "cd-compact-pinned-count";
          countSpan.textContent = `${pinnedCount} pinned`;
  
          const selSpan = document.createElement("span");
          selSpan.className = "cd-compact-pinned-selector";
          selSpan.textContent = latest.selector;
          selSpan.title = latest.dom_path || latest.selector;
  
          const undoBtn = document.createElement("button");
          undoBtn.type = "button";
          undoBtn.className = "cd-chip-remove";
          undoBtn.title = `Remove ${latest.selector}`;
          undoBtn.setAttribute("aria-label", `Undo pin ${latest.selector}`);
          undoBtn.innerHTML = ICON_CLOSE;
          undoBtn.addEventListener("click", (ev) => {
            ev.stopPropagation();
            this.removeElementReference(latest.client_ref);
          });
  
          pill.appendChild(countSpan);
          pill.appendChild(selSpan);
          pill.appendChild(undoBtn);
          this.compactStatusEl.appendChild(pill);
  
          const addMore = document.createElement("span");
          addMore.className = "cd-compact-coach-text";
          addMore.innerHTML = `<strong>Space</strong><span>or click to add more</span>`;
          this.compactStatusEl.appendChild(addMore);
        }
  
        if (this.compactDoneBtn) {
          if (pinnedCount > 0) {
            this.compactDoneBtn.className = "cd-btn cd-btn-primary";
            this.compactDoneBtn.setAttribute(
              "aria-label",
              "Finish pinning elements and return to chatbox"
            );
            this.compactDoneBtn.innerHTML = `${ICON_CHECK}<span>Done (${pinnedCount})</span><kbd class="cd-kbd">Esc</kbd>`;
          } else {
            this.compactDoneBtn.className = "cd-btn";
            this.compactDoneBtn.setAttribute("aria-label", "Cancel pinning and return to chatbox");
            this.compactDoneBtn.innerHTML = `<span>Cancel</span><kbd class="cd-kbd">Esc</kbd>`;
          }
        }
        return;
      }
  
      const summary = document.createElement("span");
      summary.className = "cd-compact-coach-text";
      summary.textContent =
        totalContextCount > 0
          ? `${totalContextCount} context item${totalContextCount > 1 ? "s" : ""} attached`
          : this.isAgentModeActive()
            ? "Agent sidebar minimized"
            : "Chatbox minimized";
      this.compactStatusEl.appendChild(summary);
  
      if (this.compactDoneBtn) {
        this.compactDoneBtn.className = "cd-btn cd-btn-primary";
        this.compactDoneBtn.setAttribute("aria-label", "Return to chatbox");
        this.compactDoneBtn.innerHTML = `${ICON_EXPAND}<span>${this.isAgentModeActive() ? "Agent" : "Chat"}</span>`;
      }
    }
  
            renderChatThread()       {
      if (!this.chatThreadEl) return;
      this.chatThreadEl.innerHTML = "";
      const smartMode = this.isSmartSelectionMode();
  
      if (this.sessionHistory.length === 0) {
        if (smartMode && (this.elementReferences.length > 0 || this.attachments.length > 0)) {
          this.chatThreadEl.hidden = true;
          return;
        }
        this.chatThreadEl.hidden = false;
  
        const emptyBox = document.createElement("div");
        emptyBox.className = smartMode ? "cd-chat-empty is-smart" : "cd-chat-empty";
  
        if (smartMode) {
          const hint = document.createElement("p");
          hint.className = "cd-chat-empty-hint";
          hint.textContent =
            "Drag the corner or select an area on the page, or write a quick note below.";
          emptyBox.appendChild(hint);
        } else {
          const p1 = document.createElement("p");
          p1.className = "cd-chat-empty-text";
          p1.textContent = "Drop context directly from this page.";
  
          const p2 = document.createElement("p");
          p2.className = "cd-chat-empty-hint";
          p2.innerHTML =
            'Drag the folded corner onto any element, or press <kbd class="cd-kbd">⌥⇧P</kbd> to freeze &amp; pin, scroll to cycle layers, and press <kbd class="cd-kbd">Space</kbd> to pin.';
  
          emptyBox.appendChild(p1);
          emptyBox.appendChild(p2);
        }
        this.chatThreadEl.appendChild(emptyBox);
        return;
      }
  
      this.chatThreadEl.hidden = false;
  
      for (const entry of this.sessionHistory) {
        const msgCard = document.createElement("div");
        msgCard.className = "cd-chat-msg";
  
        if (entry.elements.length > 0 || entry.attachments.length > 0) {
          const pills = document.createElement("div");
          pills.className = "cd-chat-msg-pills";
  
          for (const el of entry.elements) {
            const pill = document.createElement("span");
            pill.className = smartMode ? "cd-chat-msg-pill is-friendly" : "cd-chat-msg-pill";
            pill.textContent = smartMode ? this.getElementFriendlyLabel(el) : el.selector;
            pills.appendChild(pill);
          }
          for (const att of entry.attachments) {
            if (smartMode && att.attachment_type === "screenshot" && entry.elements.length > 0) {
              continue;
            }
            const pill = document.createElement("span");
            pill.className = smartMode ? "cd-chat-msg-pill is-friendly" : "cd-chat-msg-pill";
            pill.textContent = att.label;
            pills.appendChild(pill);
          }
          if (pills.childNodes.length > 0) {
            msgCard.appendChild(pills);
          }
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
        idSpan.textContent = smartMode ? "Feedback sent" : `Dropped #${entry.id}`;
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
      for (const targetTray of [this.trayEl, this.agentTrayEl]) {
        if (!targetTray) continue;
        this.populateTrayElement(targetTray);
      }
      if (this.sessionHistory.length === 0) {
        this.renderChatThread();
      }
    }
  
            populateTrayElement(trayContainer                )       {
      trayContainer.innerHTML = "";
      const smartTray = trayContainer === this.trayEl && this.isSmartSelectionMode();
  
      if (smartTray) {
        const linkedShotIds = new Set        ();
  
        for (const elRef of this.elementReferences) {
          const domNode = this.elementDomNodes.get(elRef.client_ref);
          const friendlyLabel = this.getElementFriendlyLabel(elRef, domNode);
          const linkedShot = this.attachments.find(
            (att) => att.element_reference_ref === elRef.client_ref
          );
          if (linkedShot) {
            linkedShotIds.add(linkedShot.id);
          }
  
          const card = document.createElement("div");
          card.className = "cd-smart-card";
          card.setAttribute("data-chip-type", "smart-context");
  
          if (domNode) {
            card.addEventListener("mouseenter", () => this.picker?.showExternalPreview(domNode));
            card.addEventListener("mouseleave", () => this.picker?.hideExternalPreview());
          }
  
          if (linkedShot?.preview_url) {
            const thumb = document.createElement("img");
            thumb.className = "cd-smart-card-thumb";
            thumb.src = linkedShot.preview_url;
            thumb.alt = friendlyLabel;
            card.appendChild(thumb);
          } else {
            const iconBadge = document.createElement("span");
            iconBadge.className = "cd-smart-card-icon";
            iconBadge.innerHTML = ICON_PIN;
            card.appendChild(iconBadge);
          }
  
          const body = document.createElement("div");
          body.className = "cd-smart-card-body";
  
          const title = document.createElement("span");
          title.className = "cd-smart-card-title";
          title.textContent = friendlyLabel;
  
          const sub = document.createElement("span");
          sub.className = "cd-smart-card-sub";
          sub.textContent = linkedShot
            ? "Area & surrounding context captured"
            : "Highlighted on page";
  
          body.appendChild(title);
          body.appendChild(sub);
          card.appendChild(body);
  
          const removeBtn = document.createElement("button");
          removeBtn.type = "button";
          removeBtn.className = "cd-chip-remove";
          removeBtn.setAttribute("aria-label", `Remove ${friendlyLabel}`);
          removeBtn.innerHTML = ICON_CLOSE;
          removeBtn.addEventListener("click", () => this.removeElementReference(elRef.client_ref));
          card.appendChild(removeBtn);
  
          trayContainer.appendChild(card);
        }
  
        for (const att of this.attachments) {
          if (linkedShotIds.has(att.id)) continue;
  
          const card = document.createElement("div");
          card.className = "cd-smart-card";
          card.setAttribute("data-chip-type", att.attachment_type);
  
          if (att.preview_url) {
            const thumb = document.createElement("img");
            thumb.className = "cd-smart-card-thumb";
            thumb.src = att.preview_url;
            thumb.alt = att.label;
            card.appendChild(thumb);
          }
  
          const body = document.createElement("div");
          body.className = "cd-smart-card-body";
  
          const title = document.createElement("span");
          title.className = "cd-smart-card-title";
          title.textContent = att.label;
  
          const sub = document.createElement("span");
          sub.className = "cd-smart-card-sub";
          sub.textContent = "Attached image";
  
          body.appendChild(title);
          body.appendChild(sub);
          card.appendChild(body);
  
          const removeBtn = document.createElement("button");
          removeBtn.type = "button";
          removeBtn.className = "cd-chip-remove";
          removeBtn.setAttribute("aria-label", `Remove ${att.label}`);
          removeBtn.innerHTML = ICON_CLOSE;
          removeBtn.addEventListener("click", () => this.removeAttachment(att.id));
          card.appendChild(removeBtn);
  
          trayContainer.appendChild(card);
        }
        return;
      }
  
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
  
        if (this.config.features.screenshot_capture && domNode) {
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
        trayContainer.appendChild(chip);
      }
  
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
        trayContainer.appendChild(chip);
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
  
            captureSmartSurroundingContext(
      element         ,
      elementClientRef        ,
      friendlyLabel        
    )                {
      const task = (async ()                => {
        if (this.attachments.length >= this.config.limits.max_attachments) {
          return;
        }
        try {
          const result = await captureSurroundingContextScreenshot(
            element,
            this.config.features.smart_capture_padding ?? 84,
            this.config.privacy.excluded_selectors,
            elementClientRef
          );
          if (!this.elementReferences.some((ref) => ref.client_ref === elementClientRef)) {
            return;
          }
          this.attachments = this.attachments.filter(
            (att) =>
              !(
                att.element_reference_ref === elementClientRef &&
                att.metadata?.auto_smart_context === true
              )
          );
          this.attachments.push({
            id: `smartshot_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
            attachment_type: "screenshot",
            label: `Context around ${friendlyLabel}`,
            preview_url: result.dataUrl,
            blob: result.blob,
            data_url: result.dataUrl,
            filename: `context-${Date.now()}.png`,
            element_reference_ref: elementClientRef,
            metadata: {
              ...result.metadata,
              auto_smart_context: true,
              friendly_label: friendlyLabel
            }
          });
          this.renderTray();
          this.syncUiStates();
        } catch {
          // Non-fatal in headless or non-canvas environments; smart element card still renders
        }
      })();
  
      this.pendingSmartCaptures.add(task);
      void task.finally(() => {
        this.pendingSmartCaptures.delete(task);
      });
      return task;
    }
  
           async handleSubmit()                {
      if (this.isSubmitting) return;
      const smartMode = this.isSmartSelectionMode();
  
      if (this.pendingSmartCaptures.size > 0) {
        await Promise.allSettled(Array.from(this.pendingSmartCaptures));
      }
  
      const message = (this.textareaEl?.value || "").trim();
      if (
        message.length === 0 &&
        this.attachments.length === 0 &&
        this.elementReferences.length === 0
      ) {
        this.showStatus(
          smartMode
            ? "Write a short note or highlight part of the page first."
            : "Enter a note, pin an element, or attach a screenshot first.",
          "error"
        );
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
            environment: this.config.environment,
            selection_mode: smartMode ? "smart" : "verbose",
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
          message:
            message || (smartMode ? "(Highlighted page area)" : "(Context drop without text)"),
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
        this.showStatus(
          smartMode ? "Thanks! Your feedback was sent." : "Context drop saved.",
          "success"
        );
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
  
            hideStatus()       {
      for (const bar of [this.statusEl, this.agentStatusEl]) {
        if (bar) {
          bar.hidden = true;
        }
      }
    }
  
            showStatus(text        , kind                     )       {
      for (const bar of [this.statusEl, this.agentStatusEl]) {
        if (!bar) continue;
        bar.textContent = text;
        bar.className = `cd-status ${kind}`;
        bar.hidden = false;
      }
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
