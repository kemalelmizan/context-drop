/**
 * ContextDrop Browser Widget Bundle (v0.1.0)
 * Self-contained Custom Element (<context-drop-widget>) with Shadow DOM isolation.
 * Generated from app/javascript/context_drop/*.ts — DO NOT EDIT DIRECTLY.
 */
(function () {
  "use strict";

  // --- Module: sanitizer.ts ---
  const MANDATORY_EXCLUDED_SELECTORS = [
    "[data-feedback-ignore]",
    "[data-feedback-sensitive]",
    "input[type='password']",
    "input[type='hidden']",
    "[autocomplete^='cc-']",
    "context-drop-widget",
    "[data-context-drop-ui]"
  ];
  const ALLOWED_HTML_ATTRIBUTES = [
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

  function buildExcludedSelectorList(customSelectors = []) {
    const combined = new Set(MANDATORY_EXCLUDED_SELECTORS);
    for (const sel of customSelectors) {
      if (typeof sel === "string" && sel.trim().length > 0) {
        combined.add(sel.trim());
      }
    }
    return Array.from(combined);
  }

  function elementMatchesAny(el, selectors) {
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

  function isElementExcluded(node, customSelectors = []) {
    if (!node) return true;
    const selectors = buildExcludedSelectorList(customSelectors);

    let current = node;
    while (current) {
      if (elementMatchesAny(current, selectors)) {
        return true;
      }
      if (current.parentElement) {
        current = current.parentElement;
      } else {
        const rootNode = typeof current.getRootNode === "function" ? current.getRootNode() : null;
        if (rootNode && "host" in rootNode && rootNode.host instanceof Element) {
          current = rootNode.host;
        } else {
          current = null;
        }
      }
    }
    return false;
  }

  function extractSanitizedAttributes(el) {
    const snapshot = {};
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

  function extractSanitizedText(el, customSelectors = []) {
    const tagName = (el.tagName || "").toUpperCase();
    if (IGNORED_TEXT_TAGS.has(tagName)) {
      return null;
    }

    const selectors = buildExcludedSelectorList(customSelectors);
    const parts = [];

    function walk(node) {
      if (node.nodeType === 3) {
        const text = node.nodeValue || "";
        if (text.trim().length > 0) {
          parts.push(text.trim());
        }
        return;
      }

      if (node.nodeType === 1) {
        const childEl = node;
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

  function escapeCssIdentifier(ident) {
    if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
      return CSS.escape(ident);
    }
    return ident.replace(/([^a-zA-Z0-9_-])/g, "\\$1");
  }

  function computeSelector(el) {
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

  function computeDomPath(el) {
    const segments = [];
    let current = el;

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
        if (rootNode && "host" in rootNode && rootNode.host instanceof Element) {
          current = rootNode.host;
        } else {
          current = null;
        }
      }
    }

    return segments.join(" > ").slice(0, 1000);
  }

  function captureElementSnapshot(el, customSelectors = [], clientRef) {
    if (isElementExcluded(el, customSelectors)) {
      return null;
    }

    const rect = typeof el.getBoundingClientRect === "function"
      ? el.getBoundingClientRect()
      : { x: 0, y: 0, width: 0, height: 0 };

    const boundingRect = {
      x: Math.round((rect.x ?? rect.left ?? 0) * 100) / 100,
      y: Math.round((rect.y ?? rect.top ?? 0) * 100) / 100,
      width: Math.round((rect.width ?? 0) * 100) / 100,
      height: Math.round((rect.height ?? 0) * 100) / 100
    };

    const viewport = {
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

  // --- Module: styles.ts ---
  const WIDGET_SHADOW_STYLES = `
  :host {
    all: initial;
    --cd-primary: #2563eb;
    --cd-primary-hover: #1d4ed8;
    --cd-surface: #ffffff;
    --cd-surface-subtle: #f8fafc;
    --cd-border: #e2e8f0;
    --cd-text: #0f172a;
    --cd-text-muted: #64748b;
    --cd-danger: #dc2626;
    --cd-success: #16a34a;
    --cd-shadow: 0 20px 25px -5px rgba(15, 23, 42, 0.14), 0 8px 10px -6px rgba(15, 23, 42, 0.08);
    --cd-radius: 14px;
    --cd-font: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    font-family: var(--cd-font);
    font-size: 14px;
    line-height: 1.5;
    color: var(--cd-text);
    z-index: 2147483640;
  }

  *, *::before, *::after {
    box-sizing: border-box;
  }

  .cd-root {
    position: fixed;
    z-index: 2147483640;
    display: flex;
    flex-direction: column;
    pointer-events: none;
  }

  .cd-root.pos-bottom_right {
    bottom: 20px;
    right: 20px;
    align-items: flex-end;
  }

  .cd-root.pos-bottom_left {
    bottom: 20px;
    left: 20px;
    align-items: flex-start;
  }

  .cd-root.pos-top_right {
    top: 20px;
    right: 20px;
    align-items: flex-end;
  }

  .cd-root.pos-top_left {
    top: 20px;
    left: 20px;
    align-items: flex-start;
  }

  .cd-trigger {
    pointer-events: auto;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 10px 16px;
    border-radius: 9999px;
    border: 1px solid rgba(15, 23, 42, 0.08);
    background: var(--cd-text);
    color: #ffffff;
    font-family: var(--cd-font);
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    box-shadow: var(--cd-shadow);
    transition: transform 0.15s ease, background-color 0.15s ease;
  }

  .cd-trigger:hover {
    background: #1e293b;
    transform: translateY(-1px);
  }

  .cd-trigger:focus-visible,
  .cd-btn:focus-visible,
  .cd-icon-btn:focus-visible,
  .cd-textarea:focus-visible,
  .cd-chip-remove:focus-visible {
    outline: 2px solid var(--cd-primary);
    outline-offset: 2px;
  }

  .cd-composer {
    pointer-events: auto;
    width: 380px;
    max-width: calc(100vw - 32px);
    background: var(--cd-surface);
    border: 1px solid var(--cd-border);
    border-radius: var(--cd-radius);
    box-shadow: var(--cd-shadow);
    margin-bottom: 12px;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }

  .cd-composer[hidden] {
    display: none !important;
  }

  .cd-composer-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 14px 8px;
    border-bottom: 1px solid var(--cd-border);
  }

  .cd-composer-title {
    font-size: 13px;
    font-weight: 600;
    color: var(--cd-text);
    margin: 0;
  }

  .cd-icon-btn {
    appearance: none;
    border: 1px solid transparent;
    background: transparent;
    color: var(--cd-text-muted);
    border-radius: 6px;
    padding: 4px 6px;
    cursor: pointer;
    font-size: 13px;
    line-height: 1;
  }

  .cd-icon-btn:hover {
    background: var(--cd-surface-subtle);
    color: var(--cd-text);
  }

  .cd-textarea {
    width: 100%;
    min-height: 92px;
    max-height: 220px;
    resize: vertical;
    border: 0;
    padding: 12px 14px;
    font-family: var(--cd-font);
    font-size: 14px;
    line-height: 1.45;
    color: var(--cd-text);
    background: transparent;
  }

  .cd-textarea::placeholder {
    color: var(--cd-text-muted);
  }

  .cd-tray {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    padding: 6px 14px 10px;
  }

  .cd-tray:empty {
    display: none;
  }

  .cd-chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    max-width: 100%;
    padding: 4px 8px;
    background: var(--cd-surface-subtle);
    border: 1px solid var(--cd-border);
    border-radius: 8px;
    font-size: 12px;
    color: var(--cd-text);
  }

  .cd-chip-thumb {
    width: 22px;
    height: 22px;
    border-radius: 4px;
    object-fit: cover;
    border: 1px solid var(--cd-border);
  }

  .cd-chip-badge {
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    padding: 1px 5px;
    border-radius: 4px;
    background: #dbeafe;
    color: #1e40af;
  }

  .cd-chip-label {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 180px;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  }

  .cd-chip-remove {
    appearance: none;
    border: 0;
    background: transparent;
    color: var(--cd-text-muted);
    cursor: pointer;
    padding: 0 2px;
    font-size: 14px;
    line-height: 1;
  }

  .cd-chip-remove:hover {
    color: var(--cd-danger);
  }

  .cd-status {
    padding: 6px 14px;
    font-size: 12px;
  }

  .cd-status[hidden] {
    display: none !important;
  }

  .cd-status.error {
    color: var(--cd-danger);
    background: #fef2f2;
  }

  .cd-status.success {
    color: var(--cd-success);
    background: #f0fdf4;
  }

  .cd-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 8px 12px;
    background: var(--cd-surface-subtle);
    border-top: 1px solid var(--cd-border);
  }

  .cd-toolbar-actions {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .cd-btn {
    appearance: none;
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 6px 10px;
    border-radius: 8px;
    border: 1px solid var(--cd-border);
    background: var(--cd-surface);
    color: var(--cd-text);
    font-family: var(--cd-font);
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
  }

  .cd-btn:hover:not(:disabled) {
    background: #f1f5f9;
  }

  .cd-btn:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }

  .cd-btn-primary {
    background: var(--cd-primary);
    border-color: var(--cd-primary);
    color: #ffffff;
    font-weight: 600;
  }

  .cd-btn-primary:hover:not(:disabled) {
    background: var(--cd-primary-hover);
  }

  @media (max-width: 480px) {
    .cd-composer {
      width: calc(100vw - 24px);
    }
  }
  `;

  // --- Module: api-client.ts ---
  class ContextDropApiClient {
    baseUrl;

    constructor(baseUrl = "/context_drop") {
      this.baseUrl = baseUrl.replace(/\/+$/, "") || "/context_drop";
    }

    getCsrfToken() {
      if (typeof document === "undefined") return null;
      const meta = document.querySelector('meta[name="csrf-token"]');
      return meta ? meta.getAttribute("content") : null;
    }

    async fetchConfig() {
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

      return await response.json();
    }

    async uploadAttachment(file, filename) {
      const formData = new FormData();
      formData.append("file", file, filename);

      const headers = {
        Accept: "application/json"
      };
      const csrf = this.getCsrfToken();
      if (csrf) {
        headers["X-CSRF-Token"] = csrf;
      }

      const response = await fetch(`${this.baseUrl}/attachments`, {
        method: "POST",
        credentials: "same-origin",
        headers,
        body: formData
      });

      if (!response.ok) {
        const errBody = await response.json().catch(() => ({}));
        throw new Error(errBody.error || `Upload failed (${response.status})`);
      }

      return await response.json();
    }

    async submitFeedback(payload) {
      const headers = {
        "Content-Type": "application/json",
        Accept: "application/json"
      };
      const csrf = this.getCsrfToken();
      if (csrf) {
        headers["X-CSRF-Token"] = csrf;
      }

      const response = await fetch(`${this.baseUrl}/feedback`, {
        method: "POST",
        credentials: "same-origin",
        headers,
        body: JSON.stringify({ feedback: payload })
      });

      if (!response.ok) {
        const errBody = await response.json().catch(() => ({}));
        throw new Error(errBody.error || `Submission failed (${response.status})`);
      }

      return await response.json();
    }
  }

  // --- Module: screenshot.ts ---
  function collectRedactionRects(customExcludedSelectors = []) {
    if (typeof document === "undefined") return [];

    const selectors = buildExcludedSelectorList(customExcludedSelectors);
    const selectorQuery = [
      ...selectors.filter((s) => s !== "context-drop-widget" && s !== "[data-context-drop-ui]"),
      "iframe"
    ].join(", ");

    const rects = [];
    let candidates;
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

  function dataUrlToBlob(dataUrl) {
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

  async function captureViewportScreenshot(customExcludedSelectors = [], cropRegion) {
    if (typeof document === "undefined" || typeof window === "undefined") {
      throw new Error("Screenshot capture is only available in a browser environment.");
    }

    const widgets = Array.from(document.querySelectorAll("context-drop-widget, [data-context-drop-ui]"));
    const previousVisibility = widgets.map((el) => el.style.visibility);

    try {
      for (const w of widgets) {
        w.style.visibility = "hidden";
      }

      const vw = Math.max(window.innerWidth || 1024, 1);
      const vh = Math.max(window.innerHeight || 768, 1);
      const region = cropRegion
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

      const bodyBg =
        window.getComputedStyle && document.body
          ? window.getComputedStyle(document.body).backgroundColor
          : "#ffffff";
      ctx.fillStyle = bodyBg && bodyBg !== "rgba(0, 0, 0, 0)" ? bodyBg : "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

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
      widgets.forEach((el, idx) => {
        el.style.visibility = previousVisibility[idx] || "";
      });
    }
  }

  async function captureElementScreenshot(element, padding = 16, customExcludedSelectors = [], elementClientRef) {
    if (isElementExcluded(element, customExcludedSelectors)) {
      throw new Error("Cannot capture screenshot of an excluded or sensitive DOM element.");
    }

    const r = element.getBoundingClientRect();
    const pad = Math.max(0, padding);
    const cropRegion = {
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
    active = false;
    callbacks;
    overlayEl = null;
    labelEl = null;
    bannerEl = null;
    hoveredElement = null;
    previousCursor = "";

    boundMouseMove;
    boundClickCapture;
    boundPointerCapture;
    boundKeyDown;
    boundScrollOrResize;

    constructor(callbacks) {
      this.callbacks = callbacks;
      this.boundMouseMove = this.handleMouseMove.bind(this);
      this.boundClickCapture = this.handleClickCapture.bind(this);
      this.boundPointerCapture = this.handlePointerSuppression.bind(this);
      this.boundKeyDown = this.handleKeyDown.bind(this);
      this.boundScrollOrResize = this.updateOverlayPosition.bind(this);
    }

    isActive() {
      return this.active;
    }

    start() {
      if (this.active || typeof document === "undefined" || typeof window === "undefined") {
        return;
      }
      this.active = true;
      this.previousCursor = document.body ? document.body.style.cursor : "";
      if (document.body) {
        document.body.style.cursor = "crosshair";
      }

      this.mountSelectionUi();

      window.addEventListener("mousemove", this.boundMouseMove, { capture: true, passive: true });
      window.addEventListener("pointerdown", this.boundPointerCapture, { capture: true });
      window.addEventListener("mousedown", this.boundPointerCapture, { capture: true });
      window.addEventListener("mouseup", this.boundPointerCapture, { capture: true });
      window.addEventListener("click", this.boundClickCapture, { capture: true });
      window.addEventListener("keydown", this.boundKeyDown, { capture: true });
      window.addEventListener("scroll", this.boundScrollOrResize, { capture: true, passive: true });
      window.addEventListener("resize", this.boundScrollOrResize, { passive: true });
    }

    stop() {
      if (!this.active) return;
      this.active = false;
      this.hoveredElement = null;

      if (typeof document !== "undefined" && document.body) {
        document.body.style.cursor = this.previousCursor;
      }

      if (typeof window !== "undefined") {
        window.removeEventListener("mousemove", this.boundMouseMove, { capture: true });
        window.removeEventListener("pointerdown", this.boundPointerCapture, { capture: true });
        window.removeEventListener("mousedown", this.boundPointerCapture, { capture: true });
        window.removeEventListener("mouseup", this.boundPointerCapture, { capture: true });
        window.removeEventListener("click", this.boundClickCapture, { capture: true });
        window.removeEventListener("keydown", this.boundKeyDown, { capture: true });
        window.removeEventListener("scroll", this.boundScrollOrResize, { capture: true });
        window.removeEventListener("resize", this.boundScrollOrResize);
      }

      this.unmountSelectionUi();
      this.callbacks.onExit();
    }

    mountSelectionUi() {
      if (typeof document === "undefined" || !document.body) return;

      const overlay = document.createElement("div");
      overlay.setAttribute("data-context-drop-ui", "overlay");
      overlay.style.cssText = [
        "position: fixed",
        "pointer-events: none",
        "z-index: 2147483645",
        "border: 2px solid #2563eb",
        "background: rgba(37, 99, 235, 0.12)",
        "border-radius: 4px",
        "display: none",
        "transition: all 0.04s ease-out"
      ].join(";");

      const label = document.createElement("div");
      label.setAttribute("data-context-drop-ui", "label");
      label.style.cssText = [
        "position: absolute",
        "top: -24px",
        "left: -2px",
        "background: #2563eb",
        "color: #ffffff",
        "font-family: ui-monospace, SFMono-Regular, Menlo, monospace",
        "font-size: 11px",
        "padding: 2px 6px",
        "border-radius: 4px",
        "white-space: nowrap",
        "pointer-events: none"
      ].join(";");
      overlay.appendChild(label);

      const banner = document.createElement("div");
      banner.setAttribute("data-context-drop-ui", "banner");
      banner.style.cssText = [
        "position: fixed",
        "top: 16px",
        "left: 50%",
        "transform: translateX(-50%)",
        "z-index: 2147483646",
        "background: #0f172a",
        "color: #ffffff",
        "padding: 8px 14px",
        "border-radius: 9999px",
        "font-family: -apple-system, BlinkMacSystemFont, sans-serif",
        "font-size: 13px",
        "display: flex",
        "align-items: center",
        "gap: 10px",
        "box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.25)"
      ].join(";");

      const textSpan = document.createElement("span");
      textSpan.textContent = "Click any element to attach it to feedback (Esc to finish)";

      const doneBtn = document.createElement("button");
      doneBtn.type = "button";
      doneBtn.setAttribute("data-context-drop-ui", "done-btn");
      doneBtn.textContent = "Done";
      doneBtn.style.cssText = [
        "background: #2563eb",
        "color: #ffffff",
        "border: 0",
        "border-radius: 9999px",
        "padding: 4px 10px",
        "font-size: 12px",
        "font-weight: 600",
        "cursor: pointer"
      ].join(";");
      doneBtn.addEventListener("click", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        this.stop();
      });

      banner.appendChild(textSpan);
      banner.appendChild(doneBtn);

      document.body.appendChild(overlay);
      document.body.appendChild(banner);

      this.overlayEl = overlay;
      this.labelEl = label;
      this.bannerEl = banner;
    }

    unmountSelectionUi() {
      if (this.overlayEl && this.overlayEl.parentNode) {
        this.overlayEl.parentNode.removeChild(this.overlayEl);
      }
      if (this.bannerEl && this.bannerEl.parentNode) {
        this.bannerEl.parentNode.removeChild(this.bannerEl);
      }
      this.overlayEl = null;
      this.labelEl = null;
      this.bannerEl = null;
    }

    resolveTargetFromEvent(event) {
      const path = typeof event.composedPath === "function" ? event.composedPath() : [];
      const candidate =
        path.find((node) => node instanceof Element) ||
        (event.target instanceof Element ? event.target : null);

      if (!candidate) return null;
      if (candidate.closest("context-drop-widget") || candidate.closest("[data-context-drop-ui]")) {
        return null;
      }
      if (candidate.tagName === "HTML" || candidate.tagName === "BODY") {
        return null;
      }
      if (isElementExcluded(candidate, this.callbacks.getExcludedSelectors())) {
        return null;
      }
      return candidate;
    }

    handleMouseMove(event) {
      if (!this.active) return;
      const target = this.resolveTargetFromEvent(event);
      this.hoveredElement = target;
      this.updateOverlayPosition();
    }

    updateOverlayPosition() {
      if (!this.overlayEl || !this.labelEl) return;

      if (!this.hoveredElement) {
        this.overlayEl.style.display = "none";
        return;
      }

      const rect = this.hoveredElement.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) {
        this.overlayEl.style.display = "none";
        return;
      }

      this.overlayEl.style.display = "block";
      this.overlayEl.style.left = `${rect.left}px`;
      this.overlayEl.style.top = `${rect.top}px`;
      this.overlayEl.style.width = `${rect.width}px`;
      this.overlayEl.style.height = `${rect.height}px`;
      this.labelEl.textContent = computeSelector(this.hoveredElement);
    }

    handlePointerSuppression(event) {
      if (!this.active) return;
      const rawTarget = event.target instanceof Element ? event.target : null;
      if (rawTarget && rawTarget.closest("[data-context-drop-ui='done-btn']")) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      if (typeof event.stopImmediatePropagation === "function") {
        event.stopImmediatePropagation();
      }
    }

    handleClickCapture(event) {
      if (!this.active) return;
      const rawTarget = event.target instanceof Element ? event.target : null;
      if (rawTarget && rawTarget.closest("[data-context-drop-ui='done-btn']")) {
        this.stop();
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      if (typeof event.stopImmediatePropagation === "function") {
        event.stopImmediatePropagation();
      }

      const target = this.resolveTargetFromEvent(event);
      if (!target) return;

      const snapshot = captureElementSnapshot(target, this.callbacks.getExcludedSelectors());
      if (!snapshot) return;

      this.callbacks.onSelect(snapshot, target);

      if (!this.callbacks.canSelectMore()) {
        this.stop();
      }
    }

    handleKeyDown(event) {
      if (!this.active) return;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        this.stop();
      }
    }
  }

  // --- Module: widget.ts ---
  const DEFAULT_CONFIG = {
    enabled: true,
    position: "bottom_right",
    placeholder: "What would you like to tell us?",
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

  const BaseHTMLElement =
    typeof HTMLElement !== "undefined" ? HTMLElement : class {};

  class ContextDropWidgetElement extends BaseHTMLElement {
    shadow = null;
    config = structuredClone(DEFAULT_CONFIG);
    customMetadata = {};
    apiClient = new ContextDropApiClient("/context_drop");
    picker = null;

    isOpen = false;
    isSubmitting = false;
    elementReferences = [];
    elementDomNodes = new Map();
    attachments = [];

    rootContainer = null;
    composerEl = null;
    triggerBtn = null;
    textareaEl = null;
    trayEl = null;
    statusEl = null;
    fileInputEl = null;
    submitBtn = null;

    connectedCallback() {
      if (!this.shadow) {
        this.shadow = this.attachShadow({ mode: "open" });
      }
      this.readDataAttributes();
      this.renderShadowDom();

      this.picker = new ElementPicker({
        onSelect: (snapshot, el) => this.addElementReference(snapshot, el),
        onExit: () => this.openComposer(),
        canSelectMore: () => this.elementReferences.length < this.config.limits.max_element_references,
        getExcludedSelectors: () => this.config.privacy.excluded_selectors
      });
    }

    disconnectedCallback() {
      if (this.picker && this.picker.isActive()) {
        this.picker.stop();
      }
    }

    getConfig() {
      return this.config;
    }

    getElementReferences() {
      return [...this.elementReferences];
    }

    getAttachments() {
      return [...this.attachments];
    }

    openComposer() {
      this.isOpen = true;
      if (this.composerEl) {
        this.composerEl.hidden = false;
      }
      if (this.triggerBtn) {
        this.triggerBtn.setAttribute("aria-expanded", "true");
      }
      if (this.textareaEl) {
        this.textareaEl.focus();
      }
    }

    closeComposer() {
      this.isOpen = false;
      if (this.composerEl) {
        this.composerEl.hidden = true;
      }
      if (this.triggerBtn) {
        this.triggerBtn.setAttribute("aria-expanded", "false");
      }
    }

    toggleComposer() {
      if (this.isOpen) {
        this.closeComposer();
      } else {
        this.openComposer();
      }
    }

    addElementReference(snapshot, elementNode) {
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
      return true;
    }

    removeElementReference(clientRef) {
      this.elementReferences = this.elementReferences.filter((el) => el.client_ref !== clientRef);
      this.elementDomNodes.delete(clientRef);
      this.renderTray();
    }

    removeAttachment(attachmentId) {
      this.attachments = this.attachments.filter((att) => att.id !== attachmentId);
      this.renderTray();
    }

    readDataAttributes() {
      const endpoint = this.getAttribute("data-endpoint") || "/context_drop";
      this.apiClient = new ContextDropApiClient(endpoint);

      const rawConfig = this.getAttribute("data-config");
      if (rawConfig) {
        try {
          const parsed = JSON.parse(rawConfig);
          this.config = {
            ...this.config,
            ...parsed,
            features: { ...this.config.features, ...(parsed.features || {}) },
            limits: { ...this.config.limits, ...(parsed.limits || {}) },
            privacy: { ...this.config.privacy, ...(parsed.privacy || {}) }
          };
        } catch {
          // Ignore malformed JSON attribute
        }
      }

      const posOverride = this.getAttribute("data-position");
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
          this.customMetadata = JSON.parse(rawMetadata);
        } catch {
          this.customMetadata = {};
        }
      }
    }

    renderShadowDom() {
      if (!this.shadow) return;
      this.shadow.innerHTML = "";

      const styleEl = document.createElement("style");
      styleEl.textContent = WIDGET_SHADOW_STYLES;
      this.shadow.appendChild(styleEl);

      const root = document.createElement("div");
      root.className = `cd-root pos-${this.config.position}`;
      this.rootContainer = root;

      const composer = document.createElement("div");
      composer.className = "cd-composer";
      composer.setAttribute("role", "dialog");
      composer.setAttribute("aria-label", "Feedback Composer");
      composer.hidden = !this.isOpen;
      this.composerEl = composer;

      const header = document.createElement("div");
      header.className = "cd-composer-header";
      const title = document.createElement("h2");
      title.className = "cd-composer-title";
      title.textContent = "Send Feedback";
      const closeBtn = document.createElement("button");
      closeBtn.type = "button";
      closeBtn.className = "cd-icon-btn";
      closeBtn.setAttribute("aria-label", "Close feedback composer");
      closeBtn.textContent = "✕";
      closeBtn.addEventListener("click", () => this.closeComposer());
      header.appendChild(title);
      header.appendChild(closeBtn);
      composer.appendChild(header);

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
      composer.appendChild(textarea);

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

      const toolbar = document.createElement("div");
      toolbar.className = "cd-toolbar";

      const actions = document.createElement("div");
      actions.className = "cd-toolbar-actions";

      const uploadBtn = document.createElement("button");
      uploadBtn.type = "button";
      uploadBtn.className = "cd-btn";
      uploadBtn.setAttribute("aria-label", "Upload image attachment");
      uploadBtn.textContent = "Image";
      uploadBtn.addEventListener("click", () => this.fileInputEl?.click());
      actions.appendChild(uploadBtn);

      if (this.config.features.element_selection) {
        const pickBtn = document.createElement("button");
        pickBtn.type = "button";
        pickBtn.className = "cd-btn";
        pickBtn.setAttribute("aria-label", "Select DOM element on page");
        pickBtn.textContent = "Select Element";
        pickBtn.addEventListener("click", () => {
          this.closeComposer();
          this.picker?.start();
        });
        actions.appendChild(pickBtn);
      }

      if (this.config.features.screenshot_capture) {
        const screenshotBtn = document.createElement("button");
        screenshotBtn.type = "button";
        screenshotBtn.className = "cd-btn";
        screenshotBtn.setAttribute("aria-label", "Capture viewport screenshot");
        screenshotBtn.textContent = "Screenshot";
        screenshotBtn.addEventListener("click", () => {
          void this.handleViewportScreenshot();
        });
        actions.appendChild(screenshotBtn);
      }

      const submitBtn = document.createElement("button");
      submitBtn.type = "button";
      submitBtn.className = "cd-btn cd-btn-primary";
      submitBtn.setAttribute("aria-label", "Submit feedback");
      submitBtn.textContent = "Send";
      submitBtn.addEventListener("click", () => {
        void this.handleSubmit();
      });
      this.submitBtn = submitBtn;

      toolbar.appendChild(actions);
      toolbar.appendChild(submitBtn);
      composer.appendChild(toolbar);

      const trigger = document.createElement("button");
      trigger.type = "button";
      trigger.className = "cd-trigger";
      trigger.setAttribute("aria-label", "Open feedback composer");
      trigger.setAttribute("aria-expanded", String(this.isOpen));
      trigger.textContent = "Feedback";
      trigger.addEventListener("click", () => this.toggleComposer());
      this.triggerBtn = trigger;

      root.appendChild(composer);
      root.appendChild(trigger);
      this.shadow.appendChild(root);
    }

    renderTray() {
      if (!this.trayEl) return;
      this.trayEl.innerHTML = "";

      for (const elRef of this.elementReferences) {
        const chip = document.createElement("div");
        chip.className = "cd-chip";
        chip.setAttribute("data-chip-type", "element");

        const badge = document.createElement("span");
        badge.className = "cd-chip-badge";
        badge.textContent = "Element";

        const label = document.createElement("span");
        label.className = "cd-chip-label";
        label.textContent = elRef.selector;
        label.title = elRef.dom_path || elRef.selector;

        chip.appendChild(badge);
        chip.appendChild(label);

        if (
          this.config.features.screenshot_capture &&
          this.elementDomNodes.has(elRef.client_ref)
        ) {
          const snapBtn = document.createElement("button");
          snapBtn.type = "button";
          snapBtn.className = "cd-chip-remove";
          snapBtn.title = "Capture element screenshot";
          snapBtn.setAttribute("aria-label", `Capture screenshot of ${elRef.selector}`);
          snapBtn.textContent = "📷";
          snapBtn.addEventListener("click", () => {
            const domNode = this.elementDomNodes.get(elRef.client_ref);
            if (domNode) {
              void this.handleElementScreenshot(domNode, elRef.client_ref, elRef.selector);
            }
          });
          chip.appendChild(snapBtn);
        }

        const removeBtn = document.createElement("button");
        removeBtn.type = "button";
        removeBtn.className = "cd-chip-remove";
        removeBtn.setAttribute("aria-label", `Remove ${elRef.selector}`);
        removeBtn.textContent = "×";
        removeBtn.addEventListener("click", () => this.removeElementReference(elRef.client_ref));

        chip.appendChild(removeBtn);
        this.trayEl.appendChild(chip);
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
        badge.textContent = att.attachment_type === "screenshot" ? "Screenshot" : "Image";

        const label = document.createElement("span");
        label.className = "cd-chip-label";
        label.textContent = att.label;

        const removeBtn = document.createElement("button");
        removeBtn.type = "button";
        removeBtn.className = "cd-chip-remove";
        removeBtn.setAttribute("aria-label", `Remove ${att.label}`);
        removeBtn.textContent = "×";
        removeBtn.addEventListener("click", () => this.removeAttachment(att.id));

        chip.appendChild(badge);
        chip.appendChild(label);
        chip.appendChild(removeBtn);
        this.trayEl.appendChild(chip);
      }
    }

    async handleFilesSelected(files) {
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
    }

    handlePaste(event) {
      const items = event.clipboardData?.items;
      if (!items) return;

      const imageFiles = [];
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

    readFileAsDataUrl(file) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(new Error("Failed to read image file"));
        reader.readAsDataURL(file);
      });
    }

    async handleViewportScreenshot() {
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
      } catch (err) {
        const message = err instanceof Error ? err.message : "Screenshot capture unavailable.";
        this.showStatus(message, "error");
      }
    }

    async handleElementScreenshot(element, elementClientRef, selectorLabel) {
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
      } catch (err) {
        const message = err instanceof Error ? err.message : "Element screenshot failed.";
        this.showStatus(message, "error");
      }
    }

    async handleSubmit() {
      if (this.isSubmitting) return;

      const message = (this.textareaEl?.value || "").trim();
      if (
        message.length === 0 &&
        this.attachments.length === 0 &&
        this.elementReferences.length === 0
      ) {
        this.showStatus("Please enter a message, attach an image, or select a DOM element.", "error");
        return;
      }

      this.isSubmitting = true;
      if (this.submitBtn) {
        this.submitBtn.disabled = true;
        this.submitBtn.textContent = "Sending...";
      }

      try {
        const payload = {
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

        await this.apiClient.submitFeedback(payload);

        if (this.textareaEl) {
          this.textareaEl.value = "";
        }
        this.elementReferences = [];
        this.elementDomNodes.clear();
        this.attachments = [];
        this.renderTray();
        this.showStatus("Thank you! Your feedback has been submitted.", "success");
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Failed to submit feedback.";
        this.showStatus(msg, "error");
      } finally {
        this.isSubmitting = false;
        if (this.submitBtn) {
          this.submitBtn.disabled = false;
          this.submitBtn.textContent = "Send";
        }
      }
    }

    showStatus(text, kind) {
      if (!this.statusEl) return;
      this.statusEl.textContent = text;
      this.statusEl.className = `cd-status ${kind}`;
      this.statusEl.hidden = false;
    }
  }

  function registerContextDropWidget() {
    if (typeof customElements !== "undefined" && !customElements.get("context-drop-widget")) {
      customElements.define("context-drop-widget", ContextDropWidgetElement);
    }
  }

  // --- Module: index.ts ---
  registerContextDropWidget();
})();
