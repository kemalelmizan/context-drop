import type { ElementReferenceSnapshot } from "./types.ts";
import { captureElementSnapshot, computeSelector, isElementExcluded } from "./sanitizer.ts";

export interface ElementPickerCallbacks {
  onSelect: (snapshot: ElementReferenceSnapshot, element: Element) => void;
  onExit: () => void;
  canSelectMore: () => boolean;
  getExcludedSelectors: () => string[];
}

export class ElementPicker {
  private active: boolean = false;
  private callbacks: ElementPickerCallbacks;
  private overlayEl: HTMLDivElement | null = null;
  private labelEl: HTMLDivElement | null = null;
  private bannerEl: HTMLDivElement | null = null;
  private hoveredElement: Element | null = null;
  private previousCursor: string = "";

  private boundMouseMove: (e: MouseEvent) => void;
  private boundClickCapture: (e: MouseEvent) => void;
  private boundPointerCapture: (e: Event) => void;
  private boundKeyDown: (e: KeyboardEvent) => void;
  private boundScrollOrResize: () => void;

  constructor(callbacks: ElementPickerCallbacks) {
    this.callbacks = callbacks;
    this.boundMouseMove = this.handleMouseMove.bind(this);
    this.boundClickCapture = this.handleClickCapture.bind(this);
    this.boundPointerCapture = this.handlePointerSuppression.bind(this);
    this.boundKeyDown = this.handleKeyDown.bind(this);
    this.boundScrollOrResize = this.updateOverlayPosition.bind(this);
  }

  public isActive(): boolean {
    return this.active;
  }

  public start(): void {
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

  public stop(): void {
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

  private mountSelectionUi(): void {
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

  private unmountSelectionUi(): void {
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

  private resolveTargetFromEvent(event: Event): Element | null {
    const path = typeof event.composedPath === "function" ? event.composedPath() : [];
    const candidate = (path.find((node) => node instanceof Element) as Element | undefined) ||
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

  private handleMouseMove(event: MouseEvent): void {
    if (!this.active) return;
    const target = this.resolveTargetFromEvent(event);
    this.hoveredElement = target;
    this.updateOverlayPosition();
  }

  private updateOverlayPosition(): void {
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

  private handlePointerSuppression(event: Event): void {
    if (!this.active) return;
    const rawTarget = event.target instanceof Element ? event.target : null;
    if (rawTarget && rawTarget.closest("[data-context-drop-ui='done-btn']")) {
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

  private handleKeyDown(event: KeyboardEvent): void {
    if (!this.active) return;
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      this.stop();
    }
  }
}
