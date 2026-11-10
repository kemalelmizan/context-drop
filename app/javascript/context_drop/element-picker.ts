import type { ElementCandidateInfo, ElementReferenceSnapshot } from "./types.ts";
import {
  captureElementSnapshot,
  computeSelector,
  describeElementCandidate,
  isSelectableElement,
  resolveAncestorChain,
  resolveCandidateStack
} from "./sanitizer.ts";
import {
  ICON_CHECK,
  ICON_CHEVRON_DOWN,
  ICON_CHEVRON_RIGHT,
  ICON_CHEVRON_UP,
  ICON_CLOSE,
  ICON_LAYERS,
  ICON_PIN
} from "./icons.ts";

export interface ElementPickerCallbacks {
  onSelect: (snapshot: ElementReferenceSnapshot, element: Element) => void;
  onExit: () => void;
  canSelectMore: () => boolean;
  getExcludedSelectors: () => string[];
  onStateChange?: (state: {
    active: boolean;
    anchored: boolean;
    activeCandidate: ElementCandidateInfo | null;
    candidateStack: ElementCandidateInfo[];
    ancestors: Element[];
  }) => void;
}

export class ElementPicker {
  private active: boolean = false;
  private anchored: boolean = false;
  private anchorX: number = 0;
  private anchorY: number = 0;
  private lastPointerX: number = 0;
  private lastPointerY: number = 0;
  private wheelAccumulator: number = 0;

  private callbacks: ElementPickerCallbacks;
  private overlayEl: HTMLDivElement | null = null;
  private leafOutlineEl: HTMLDivElement | null = null;
  private labelEl: HTMLDivElement | null = null;
  private pinMarkerEl: HTMLDivElement | null = null;
  private popoverEl: HTMLDivElement | null = null;
  private previewOverlayEl: HTMLDivElement | null = null;

  private candidateStack: ElementCandidateInfo[] = [];
  private activeCandidateIndex: number = 0;
  private leafElement: Element | null = null;
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
    this.boundScrollOrResize = this.updateOverlayPosition.bind(this);
  }

  public isActive(): boolean {
    return this.active;
  }

  public isAnchored(): boolean {
    return this.anchored;
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

  public stop(): void {
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

    this.updateOverlayPosition();
    if (this.anchored) {
      this.renderLayerPopover();
    }
    this.notifyStateChange();
  }

  public selectElementDirectly(el: Element): boolean {
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

  public cycleDepth(delta: number): void {
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

  private notifyStateChange(): void {
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

  private mountSelectionUi(): void {
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

  private unmountSelectionUi(): void {
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

  private isInternalUiEvent(event: Event): boolean {
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

  private collectPointElements(clientX: number, clientY: number, event?: Event): Element[] {
    const results: Element[] = [];
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

  private updateCandidatesFromPoint(clientX: number, clientY: number, event?: Event): void {
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

  private handleMouseMove(event: MouseEvent): void {
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

  private updateOverlayPosition(): void {
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

  private handleWheelCapture(event: WheelEvent): void {
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

  public closeLayerPopover(): void {
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

  private renderLayerPopover(): void {
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

    const relationLabels: Record<string, string> = {
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

  private handleKeyDown(event: KeyboardEvent): void {
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
