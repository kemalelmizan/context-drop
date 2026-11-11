import type { ElementCandidateInfo, ElementReferenceSnapshot } from "./types.ts";
import {
  captureElementSnapshot,
  describeElementCandidate,
  isSelectableElement,
  resolveAncestorChain,
  resolveCandidateStack
} from "./sanitizer.ts";
import {
  ICON_CHECK,
  ICON_LAYERS,
  ICON_PIN,
  ICON_SCROLL_VERTICAL
} from "./icons.ts";

export interface PinnedElementEntry {
  clientRef: string;
  selector: string;
  element: Element;
}

export interface ElementPickerStateSnapshot {
  active: boolean;
  anchored: boolean;
  scrubbing: boolean;
  activeCandidate: ElementCandidateInfo | null;
  candidateStack: ElementCandidateInfo[];
  ancestors: Element[];
  lastAction?: {
    kind: "pinned" | "unpinned";
    selector: string;
  } | null;
}

export interface ElementPickerCallbacks {
  onSelect: (snapshot: ElementReferenceSnapshot, element: Element) => void;
  onUnselect?: (clientRef: string, element: Element) => void;
  onExit: () => void;
  canSelectMore: () => boolean;
  getExcludedSelectors: () => string[];
  getPinnedElements?: () => PinnedElementEntry[];
  onStateChange?: (state: ElementPickerStateSnapshot) => void;
}

const WHEEL_STEP_THRESHOLD = 26;
const WHEEL_STEP_COOLDOWN_MS = 80;
const SCRUB_JITTER_LOCK_PX = 28;
const MAX_VISIBLE_STACK_ROWS = 5;

function isDomElementNode(node: unknown): node is Element {
  if (!node || typeof node !== "object") return false;
  if (typeof window !== "undefined" && node === window) return false;
  if ((node as { nodeType?: number }).nodeType !== 1) return false;
  const tag = ((node as { tagName?: string }).tagName || "").toUpperCase();
  return tag.length > 0 && tag !== "WINDOW";
}

function formatCandidateLabel(tagName: string, selector: string): string {
  if (selector.startsWith(tagName)) {
    return selector;
  }
  if (selector.startsWith("#") || selector.startsWith(".")) {
    return `${tagName}${selector}`;
  }
  return selector;
}

function isPointInsideRect(
  x: number,
  y: number,
  rect: { left?: number; top?: number; x?: number; y?: number; width: number; height: number },
  tolerance: number = 2
): boolean {
  const left = (rect.left ?? rect.x ?? 0) - tolerance;
  const top = (rect.top ?? rect.y ?? 0) - tolerance;
  return x >= left && x <= left + rect.width + tolerance * 2 && y >= top && y <= top + rect.height + tolerance * 2;
}

export class ElementPicker {
  private active: boolean = false;
  private isScrubbingLayers: boolean = false;
  private scrubOriginX: number = 0;
  private scrubOriginY: number = 0;
  private lastPointerX: number = 0;
  private lastPointerY: number = 0;
  private wheelAccumulator: number = 0;
  private lastWheelStepAt: number = 0;

  private callbacks: ElementPickerCallbacks;
  private overlayEl: HTMLDivElement | null = null;
  private leafOutlineEl: HTMLDivElement | null = null;
  private hudEl: HTMLDivElement | null = null;
  private pinMarkerEl: HTMLDivElement | null = null;
  private pinnedMarkersContainerEl: HTMLDivElement | null = null;
  private toastEl: HTMLDivElement | null = null;
  private previewOverlayEl: HTMLDivElement | null = null;

  private pulseTimer: ReturnType<typeof setTimeout> | null = null;
  private nudgeTimer: ReturnType<typeof setTimeout> | null = null;
  private toastTimer: ReturnType<typeof setTimeout> | null = null;

  private candidateStack: ElementCandidateInfo[] = [];
  private activeCandidateIndex: number = 0;
  private leafElement: Element | null = null;
  private lastAction: { kind: "pinned" | "unpinned"; selector: string } | null = null;
  private previousCursor: string = "";

  private boundMouseMove: (e: MouseEvent) => void;
  private boundClickCapture: (e: MouseEvent) => void;
  private boundPointerCapture: (e: Event) => void;
  private boundWheelCapture: (e: WheelEvent) => void;
  private boundKeyDown: (e: KeyboardEvent) => void;
  private boundScrollOrResize: () => void;

  constructor(callbacks: ElementPickerCallbacks) {
    this.callbacks = callbacks;
    this.boundMouseMove = this.handleMouseMove.bind(this);
    this.boundClickCapture = this.handleClickCapture.bind(this);
    this.boundPointerCapture = this.handlePointerSuppression.bind(this);
    this.boundWheelCapture = this.handleWheelCapture.bind(this);
    this.boundKeyDown = this.handleKeyDown.bind(this);
    this.boundScrollOrResize = this.handleViewportScrollOrResize.bind(this);
  }

  public isActive(): boolean {
    return this.active;
  }

  public isAnchored(): boolean {
    return false;
  }

  public isScrubbing(): boolean {
    return this.isScrubbingLayers;
  }

  public getActiveCandidate(): ElementCandidateInfo | null {
    return this.candidateStack[this.activeCandidateIndex] || null;
  }

  public getCandidateStack(): ElementCandidateInfo[] {
    return [...this.candidateStack];
  }

  public start(): void {
    if (this.active || typeof document === "undefined" || typeof window === "undefined") {
      return;
    }
    this.active = true;
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
      document.body.style.cursor = "crosshair";
    }

    this.mountSelectionUi();
    this.refreshPinnedMarkers();
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

  public stop(): void {
    if (!this.active) return;
    this.active = false;
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
      window.removeEventListener("wheel", this.boundWheelCapture, { capture: true });
      window.removeEventListener("keydown", this.boundKeyDown, { capture: true });
      window.removeEventListener("scroll", this.boundScrollOrResize, { capture: true });
      window.removeEventListener("resize", this.boundScrollOrResize);
    }

    this.unmountSelectionUi();
    this.notifyStateChange();
    this.callbacks.onExit();
  }

  public focusCandidateElement(el: Element): void {
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

  public selectElementDirectly(el: Element): boolean {
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

  public refreshPinnedMarkers(): void {
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
      badge.style.cssText = [
        "position: absolute",
        `top: ${badgeTop}`,
        "right: -1px",
        "display: inline-flex",
        "align-items: center",
        "gap: 4px",
        "padding: 2px 6px",
        "border-radius: 9999px",
        "background: #c2410c",
        "color: #faf9f6",
        "border: 1px solid #faf9f6",
        "font-family: ui-monospace, SFMono-Regular, Menlo, monospace",
        "font-size: 10px",
        "font-weight: 700",
        "font-variant-numeric: tabular-nums",
        "line-height: 1.2",
        "max-width: 160px",
        "overflow: hidden",
        "text-overflow: ellipsis",
        "white-space: nowrap",
        "box-shadow: 0 4px 10px -2px rgba(17, 19, 24, 0.25)"
      ].join(";");
      badge.textContent = `#${index + 1} ${entry.selector}`;

      markerFrame.appendChild(badge);
      this.pinnedMarkersContainerEl?.appendChild(markerFrame);
    });
  }

  public showExternalPreview(el: Element | null): void {
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

  public hideExternalPreview(): void {
    if (this.previewOverlayEl && this.previewOverlayEl.parentNode) {
      this.previewOverlayEl.parentNode.removeChild(this.previewOverlayEl);
    }
    this.previewOverlayEl = null;
  }

  public cycleDepth(delta: number, revealStack: boolean = true): void {
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

  private clearTimers(): void {
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

  private findPinnedIndex(el: Element): { index: number; entry: PinnedElementEntry } | null {
    if (!this.callbacks.getPinnedElements) return null;
    const pinned = this.callbacks.getPinnedElements();
    for (let i = 0; i < pinned.length; i += 1) {
      if (pinned[i].element === el) {
        return { index: i, entry: pinned[i] };
      }
    }
    return null;
  }

  private notifyStateChange(): void {
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

  private mountSelectionUi(): void {
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

  private unmountSelectionUi(): void {
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

  private isInternalUiEvent(event: Event): boolean {
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

  private collectPointElements(clientX: number, clientY: number, event?: Event): Element[] {
    const results: Element[] = [];
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

  private updateCandidatesFromPoint(clientX: number, clientY: number, event?: Event): void {
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

  private handleViewportScrollOrResize(): void {
    this.refreshPinnedMarkers();
    this.updateOverlayPosition();
  }

  private handleMouseMove(event: MouseEvent): void {
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
      this.pinMarkerEl.style.display = "inline-flex";
      this.pinMarkerEl.style.left = `${event.clientX}px`;
      this.pinMarkerEl.style.top = `${event.clientY}px`;
    }

    this.updateCandidatesFromPoint(event.clientX, event.clientY, event);
    this.updateOverlayPosition();
    this.notifyStateChange();
  }

  private createSpanEl(text: string): HTMLSpanElement {
    const span = document.createElement("span");
    span.textContent = text;
    return span;
  }

  private createKbdEl(text: string): HTMLElement {
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

  private renderCompactHudContent(
    currentCandidate: ElementCandidateInfo,
    rect: { width: number; height: number }
  ): void {
    if (!this.hudEl) return;
    this.hudEl.innerHTML = "";
    this.hudEl.style.width = "auto";
    this.hudEl.style.maxWidth = "min(440px, calc(100vw - 20px))";

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
    const clickStrong = document.createElement("strong");
    clickStrong.style.cssText = pinnedInfo
      ? "color: #ffedd5; font-weight: 600;"
      : "color: #faf9f6; font-weight: 600;";
    clickStrong.textContent = "Click";
    clickHint.appendChild(clickStrong);
    clickHint.appendChild(this.createSpanEl(pinnedInfo ? " to unpin" : " to pin"));
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
    escHint.appendChild(this.createKbdEl("Esc"));
    escHint.appendChild(this.createSpanEl("done"));
    coachRow.appendChild(escHint);

    this.hudEl.appendChild(coachRow);
  }

  private renderScrubbingHudContent(
    currentCandidate: ElementCandidateInfo,
    rect: { width: number; height: number }
  ): void {
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

    const relationLabels: Record<string, string> = {
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
    keysHint.appendChild(this.createKbdEl("Enter"));
    keysHint.appendChild(this.createSpanEl("pin · "));
    keysHint.appendChild(this.createKbdEl("Esc"));
    keysHint.appendChild(this.createSpanEl("done"));

    footer.appendChild(dimsLabel);
    footer.appendChild(keysHint);
    this.hudEl.appendChild(footer);
  }

  private positionHudElement(rect: { left: number; top: number; width: number; height: number }): void {
    if (!this.hudEl || typeof window === "undefined") return;

    const vw = window.innerWidth || 1024;
    const vh = window.innerHeight || 768;
    const fallbackWidth = this.isScrubbingLayers ? 320 : 300;
    const visibleRows = Math.min(this.candidateStack.length, MAX_VISIBLE_STACK_ROWS);
    const fallbackHeight = this.isScrubbingLayers ? 66 + visibleRows * 30 : 54;

    const hudWidth = (this.hudEl as unknown as { offsetWidth?: number }).offsetWidth || fallbackWidth;
    const hudHeight = (this.hudEl as unknown as { offsetHeight?: number }).offsetHeight || fallbackHeight;

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

  private updateOverlayPosition(): void {
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
    if (this.isScrubbingLayers && this.candidateStack.length > 1) {
      this.renderScrubbingHudContent(currentCandidate, rect);
    } else {
      this.renderCompactHudContent(currentCandidate, rect);
    }
    this.positionHudElement(rect);

    // Show ghost leaf outline when inspecting an ancestor or overlapping layer
    if (this.leafOutlineEl) {
      if (
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

  private triggerHudBoundaryNudge(offsetY: number): void {
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

  private flashSelectionPulse(kind: "pinned" | "unpinned"): void {
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

  private showCursorToast(selector: string, kind: "pinned" | "unpinned", x: number, y: number): void {
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

  private commitCandidateSelection(el: Element, x: number, y: number): void {
    const existingPinned = this.findPinnedIndex(el);
    if (existingPinned && this.callbacks.onUnselect) {
      this.callbacks.onUnselect(existingPinned.entry.clientRef, el);
      this.lastAction = { kind: "unpinned", selector: existingPinned.entry.selector };
      this.isScrubbingLayers = false;
      this.refreshPinnedMarkers();
      this.flashSelectionPulse("unpinned");
      this.showCursorToast(existingPinned.entry.selector, "unpinned", x, y);
      this.updateOverlayPosition();
      this.notifyStateChange();
      return;
    }

    const excluded = this.callbacks.getExcludedSelectors();
    const snapshot = captureElementSnapshot(el, excluded);
    if (!snapshot) return;

    this.callbacks.onSelect(snapshot, el);
    this.lastAction = { kind: "pinned", selector: snapshot.selector };
    this.isScrubbingLayers = false;
    this.refreshPinnedMarkers();

    if (!this.callbacks.canSelectMore()) {
      this.stop();
      return;
    }

    this.flashSelectionPulse("pinned");
    this.showCursorToast(snapshot.selector, "pinned", x, y);
    this.updateOverlayPosition();
    this.notifyStateChange();
  }

  private handleWheelCapture(event: WheelEvent): void {
    if (!this.active) return;
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

  private handlePointerSuppression(event: Event): void {
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

  private handleClickCapture(event: MouseEvent): void {
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

  private handleKeyDown(event: KeyboardEvent): void {
    if (!this.active) return;

    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      this.stop();
      return;
    }

    if (event.key === "ArrowUp" || event.key === "[") {
      event.preventDefault();
      event.stopPropagation();
      this.cycleDepth(1, true);
      return;
    }

    if (event.key === "ArrowDown" || event.key === "]") {
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
