import type { BoundingRectSnapshot } from "./types.ts";
import { buildExcludedSelectorList, isElementExcluded } from "./sanitizer.ts";

export interface ScreenshotCaptureResult {
  dataUrl: string;
  blob: Blob;
  width: number;
  height: number;
  redactedCount: number;
  metadata: Record<string, unknown>;
}

export function collectRedactionRects(customExcludedSelectors: string[] = []): BoundingRectSnapshot[] {
  if (typeof document === "undefined") return [];

  const selectors = buildExcludedSelectorList(customExcludedSelectors);
  const selectorQuery = [
    ...selectors.filter((s) => s !== "context-drop-widget" && s !== "[data-context-drop-ui]"),
    "iframe"
  ].join(", ");

  const rects: BoundingRectSnapshot[] = [];
  let candidates: NodeListOf<Element>;
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

function dataUrlToBlob(dataUrl: string): Blob {
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

export async function captureViewportScreenshot(
  customExcludedSelectors: string[] = [],
  cropRegion?: BoundingRectSnapshot
): Promise<ScreenshotCaptureResult> {
  if (typeof document === "undefined" || typeof window === "undefined") {
    throw new Error("Screenshot capture is only available in a browser environment.");
  }

  const widgets = Array.from(document.querySelectorAll("context-drop-widget, [data-context-drop-ui]")) as HTMLElement[];
  const previousVisibility = widgets.map((el) => el.style.visibility);

  try {
    // 1. Hide ContextDrop's own UI during capture
    for (const w of widgets) {
      w.style.visibility = "hidden";
    }

    const vw = Math.max(window.innerWidth || 1024, 1);
    const vh = Math.max(window.innerHeight || 768, 1);
    const region: BoundingRectSnapshot = cropRegion
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
      if (
        node.closest("context-drop-widget") ||
        node.hasAttribute("data-context-drop-ui") ||
        node.closest("[data-context-drop-ui]")
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

export async function captureElementScreenshot(
  element: Element,
  padding: number = 16,
  customExcludedSelectors: string[] = [],
  elementClientRef?: string
): Promise<ScreenshotCaptureResult> {
  if (isElementExcluded(element, customExcludedSelectors)) {
    throw new Error("Cannot capture screenshot of an excluded or sensitive DOM element.");
  }

  const r = element.getBoundingClientRect();
  const pad = Math.max(0, padding);
  const cropRegion: BoundingRectSnapshot = {
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
