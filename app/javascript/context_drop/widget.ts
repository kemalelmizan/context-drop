import type {
  ElementReferenceSnapshot,
  FeedbackSubmissionPayload,
  PendingAttachmentItem,
  SessionFeedbackEntry,
  WidgetConfig,
  WidgetPosition
} from "./types.ts";
import { MANDATORY_EXCLUDED_SELECTORS } from "./sanitizer.ts";
import {
  ICON_CAMERA,
  ICON_CHAT,
  ICON_CHECK,
  ICON_CHEVRON_DOWN,
  ICON_CHEVRON_UP,
  ICON_CLOSE,
  ICON_EXPAND,
  ICON_GRIP,
  ICON_IMAGE,
  ICON_MINIMIZE,
  ICON_PIN,
  ICON_SCROLL_VERTICAL,
  ICON_SEND
} from "./icons.ts";
import { WIDGET_SHADOW_STYLES } from "./styles.ts";
import { ContextDropApiClient } from "./api-client.ts";
import { ElementPicker } from "./element-picker.ts";
import { captureElementScreenshot, captureViewportScreenshot } from "./screenshot.ts";

const DEFAULT_CONFIG: WidgetConfig = {
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

const BaseHTMLElement: typeof HTMLElement =
  typeof HTMLElement !== "undefined"
    ? HTMLElement
    : (class {} as unknown as typeof HTMLElement);

export class ContextDropWidgetElement extends BaseHTMLElement {
  public shadow: ShadowRoot | null = null;
  private config: WidgetConfig = structuredClone(DEFAULT_CONFIG);
  private customMetadata: Record<string, unknown> = {};
  private apiClient: ContextDropApiClient = new ContextDropApiClient("/context_drop");
  private picker: ElementPicker | null = null;

  private isOpen: boolean = false;
  private isMinimized: boolean = false;
  private isSubmitting: boolean = false;
  private freePos: { left: number; top: number } | null = null;

  private elementReferences: ElementReferenceSnapshot[] = [];
  private elementDomNodes: Map<string, Element> = new Map();
  private attachments: PendingAttachmentItem[] = [];
  private sessionHistory: SessionFeedbackEntry[] = [];

  private rootContainer: HTMLDivElement | null = null;
  private composerEl: HTMLDivElement | null = null;
  private compactBarEl: HTMLDivElement | null = null;
  private compactStatusEl: HTMLDivElement | null = null;
  private compactStepGroupEl: HTMLDivElement | null = null;
  private compactLayerUpBtn: HTMLButtonElement | null = null;
  private compactLayerDownBtn: HTMLButtonElement | null = null;
  private compactDoneBtn: HTMLButtonElement | null = null;
  private compactPinBtn: HTMLButtonElement | null = null;
  private pinDockEl: HTMLDivElement | null = null;
  private floatingPinBtn: HTMLButtonElement | null = null;
  private triggerBtn: HTMLButtonElement | null = null;
  private cornerPinBtn: HTMLButtonElement | null = null;
  private chatThreadEl: HTMLDivElement | null = null;
  private textareaEl: HTMLTextAreaElement | null = null;
  private trayEl: HTMLDivElement | null = null;
  private statusEl: HTMLDivElement | null = null;
  private fileInputEl: HTMLInputElement | null = null;
  private submitBtn: HTMLButtonElement | null = null;
  private lastPointerX: number = 0;
  private lastPointerY: number = 0;
  private boundTrackPointer: (ev: MouseEvent) => void;
  private boundGlobalKeyDown: (ev: KeyboardEvent) => void;

  public connectedCallback(): void {
    if (!this.shadow) {
      this.shadow = this.attachShadow({ mode: "open" });
    }
    this.readDataAttributes();
    this.renderShadowDom();

    this.boundTrackPointer = (ev: MouseEvent) => {
      this.lastPointerX = ev.clientX;
      this.lastPointerY = ev.clientY;
    };

    this.boundGlobalKeyDown = (ev: KeyboardEvent) => {
      // Alt+Shift+P / Option+Shift+P toggles Freeze & Pin mode from anywhere on the host page
      if (
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
          const count = this.elementReferences.length;
          this.showStatus(
            count === 1
              ? `Pinned ${snapshot.selector}`
              : `Pinned ${count} elements (latest: ${snapshot.selector})`,
            "success"
          );
        }
        this.syncUiStates();
      },
      onUnselect: (clientRef) => {
        this.removeElementReference(clientRef);
      },
      onExit: () => {
        this.isMinimized = false;
        this.openComposer();
        this.syncUiStates();
      },
      canSelectMore: () => this.elementReferences.length < this.config.limits.max_element_references,
      getExcludedSelectors: () => this.config.privacy.excluded_selectors,
      getPinnedElements: () =>
        this.elementReferences
          .map((ref) => {
            const node = this.elementDomNodes.get(ref.client_ref);
            return node
              ? { clientRef: ref.client_ref, selector: ref.selector, element: node }
              : null;
          })
          .filter(
            (item): item is { clientRef: string; selector: string; element: Element } =>
              item !== null
          ),
      onStateChange: (state) => {
        this.syncPinActiveIndicators(state.active);
        this.renderCompactCoachBar(state.active, state.candidateStack.length);
      }
    });
  }

  public disconnectedCallback(): void {
    if (this.picker && this.picker.isActive()) {
      this.picker.stop();
    }
    this.picker?.hideExternalPreview();

    if (typeof window !== "undefined") {
      window.removeEventListener("mousemove", this.boundTrackPointer, { capture: true });
      window.removeEventListener("keydown", this.boundGlobalKeyDown, { capture: true });
    }
  }

  public getConfig(): WidgetConfig {
    return this.config;
  }

  public getElementReferences(): ElementReferenceSnapshot[] {
    return [...this.elementReferences];
  }

  public getAttachments(): PendingAttachmentItem[] {
    return [...this.attachments];
  }

  public getSessionHistory(): SessionFeedbackEntry[] {
    return [...this.sessionHistory];
  }

  public openComposer(): void {
    this.isOpen = true;
    this.isMinimized = false;
    this.syncUiStates();
    if (this.textareaEl) {
      this.textareaEl.focus();
    }
  }

  public closeComposer(): void {
    this.isOpen = false;
    this.isMinimized = false;
    if (this.picker && this.picker.isActive()) {
      this.picker.stop();
    }
    this.picker?.hideExternalPreview();
    this.syncUiStates();
  }

  public toggleComposer(): void {
    if (this.isOpen && !this.isMinimized) {
      this.closeComposer();
    } else {
      this.openComposer();
    }
  }

  public minimizeToCompactBar(): void {
    this.isOpen = true;
    this.isMinimized = true;
    this.syncUiStates();
  }

  public expandFromCompactBar(): void {
    if (this.picker && this.picker.isActive()) {
      this.picker.stop();
    }
    this.isMinimized = false;
    this.openComposer();
  }

  public startPinSelection(): void {
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
    if (this.lastPointerX > 0 && this.lastPointerY > 0) {
      this.picker.highlightAtPoint(this.lastPointerX, this.lastPointerY);
    }
    this.syncUiStates();
  }

  public togglePinSelection(): void {
    if (this.picker && this.picker.isActive()) {
      this.picker.stop();
    } else {
      this.startPinSelection();
    }
  }

  public setFreePosition(left: number, top: number): void {
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

  public addElementReference(snapshot: ElementReferenceSnapshot, elementNode?: Element): boolean {
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

  public removeElementReference(clientRef: string): void {
    this.elementReferences = this.elementReferences.filter((el) => el.client_ref !== clientRef);
    this.elementDomNodes.delete(clientRef);
    this.picker?.hideExternalPreview();
    this.picker?.refreshPinnedMarkers();
    this.renderTray();
    this.syncUiStates();
  }

  public removeAttachment(attachmentId: string): void {
    this.attachments = this.attachments.filter((att) => att.id !== attachmentId);
    this.renderTray();
    this.syncUiStates();
  }

  private readDataAttributes(): void {
    const endpoint = this.getAttribute("data-endpoint") || "/context_drop";
    this.apiClient = new ContextDropApiClient(endpoint);

    const rawConfig = this.getAttribute("data-config");
    if (rawConfig) {
      try {
        const parsed = JSON.parse(rawConfig) as Partial<WidgetConfig>;
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

    const posOverride = this.getAttribute("data-position") as WidgetPosition | null;
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
        this.customMetadata = JSON.parse(rawMetadata) as Record<string, unknown>;
      } catch {
        this.customMetadata = {};
      }
    }
  }

  private attachDragHandle(handleEl: HTMLElement, onClickFallback?: () => void): void {
    let startX = 0;
    let startY = 0;
    let initialLeft = 0;
    let initialTop = 0;
    let dragging = false;
    let moved = false;
    let suppressNextClick = false;
    let suppressClickTimer: ReturnType<typeof setTimeout> | null = null;

    const clearSuppressClick = (): void => {
      suppressNextClick = false;
      if (suppressClickTimer !== null) {
        clearTimeout(suppressClickTimer);
        suppressClickTimer = null;
      }
    };

    if (onClickFallback) {
      handleEl.addEventListener("click", (ev: MouseEvent) => {
        if (suppressNextClick) {
          clearSuppressClick();
          ev.preventDefault();
          ev.stopPropagation();
          return;
        }
        onClickFallback();
      });
    }

    const onPointerMove = (ev: PointerEvent): void => {
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

    const cleanupDrag = (): void => {
      dragging = false;
      this.pinDockEl?.classList.remove("is-dragging");
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerCancel);
    };

    const onPointerUp = (): void => {
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

    const onPointerCancel = (): void => {
      if (!dragging) return;
      cleanupDrag();
      clearSuppressClick();
    };

    handleEl.addEventListener("pointerdown", (ev: PointerEvent) => {
      // Only primary mouse button or touch
      if (ev.button !== 0) return;
      const targetEl =
        ev.target && typeof (ev.target as Element).closest === "function"
          ? (ev.target as Element)
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

  private renderShadowDom(): void {
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
      pickBtn.title = "Freeze & Pin element (⌥⇧P)";
      pickBtn.setAttribute("aria-label", "Pin HTML element as context (Option+Shift+P)");
      pickBtn.innerHTML = `${ICON_PIN}<span>Pin</span><kbd class="cd-kbd">⌥⇧P</kbd>`;
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
      floatingPinBtn.title = "Freeze & Pin element (⌥⇧P, or drag to move)";
      floatingPinBtn.setAttribute("aria-label", "Freeze & Pin element on page (Option+Shift+P)");
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

    this.syncUiStates();
  }

  private syncPinActiveIndicators(pickerActive: boolean): void {
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

  private syncUiStates(): void {
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
    this.renderCompactCoachBar(
      pickerActive,
      this.picker ? this.picker.getCandidateStack().length : 0
    );
  }

  private renderCompactCoachBar(pickerActive: boolean, candidateCount: number = 0): void {
    if (!this.compactStatusEl) return;
    this.compactStatusEl.innerHTML = "";

    const pinnedCount = this.elementReferences.length;
    const totalContextCount = pinnedCount + this.attachments.length;

    if (this.compactStepGroupEl) {
      this.compactStepGroupEl.hidden = !pickerActive;
    }
    if (this.compactLayerUpBtn) {
      this.compactLayerUpBtn.disabled = candidateCount <= 1;
    }
    if (this.compactLayerDownBtn) {
      this.compactLayerDownBtn.disabled = candidateCount <= 1;
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

    // Minimized while not actively in Pin Mode
    const summary = document.createElement("span");
    summary.className = "cd-compact-coach-text";
    summary.textContent =
      totalContextCount > 0
        ? `${totalContextCount} context item${totalContextCount > 1 ? "s" : ""} attached`
        : "Chatbox minimized";
    this.compactStatusEl.appendChild(summary);

    if (this.compactDoneBtn) {
      this.compactDoneBtn.className = "cd-btn cd-btn-primary";
      this.compactDoneBtn.setAttribute("aria-label", "Return to chatbox");
      this.compactDoneBtn.innerHTML = `${ICON_EXPAND}<span>Chat</span>`;
    }
  }

  private renderChatThread(): void {
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
      p2.innerHTML =
        "Press <kbd class=\"cd-kbd\">⌥⇧P</kbd> anywhere or click Pin to freeze &amp; pin, scroll to cycle layers, and press <kbd class=\"cd-kbd\">Space</kbd> to pin instantly.";

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

  private renderTray(): void {
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

  private async handleFilesSelected(files: File[]): Promise<void> {
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

  private handlePaste(event: ClipboardEvent): void {
    const items = event.clipboardData?.items;
    if (!items) return;

    const imageFiles: File[] = [];
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

  private readFileAsDataUrl(file: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("Failed to read image file"));
      reader.readAsDataURL(file);
    });
  }

  private async handleViewportScreenshot(): Promise<void> {
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

  private async handleElementScreenshot(
    element: Element,
    elementClientRef: string,
    selectorLabel: string
  ): Promise<void> {
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

  public async handleSubmit(): Promise<void> {
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

      const payload: FeedbackSubmissionPayload = {
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

  private showStatus(text: string, kind: "error" | "success"): void {
    if (!this.statusEl) return;
    this.statusEl.textContent = text;
    this.statusEl.className = `cd-status ${kind}`;
    this.statusEl.hidden = false;
  }
}

export function registerContextDropWidget(): void {
  if (typeof customElements !== "undefined" && !customElements.get("context-drop-widget")) {
    customElements.define("context-drop-widget", ContextDropWidgetElement);
  }
}
