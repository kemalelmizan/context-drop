import type {
  AgentChatMessage,
  AgentProviderInfo,
  AgentStatusResponse,
  CrossEnvFeedbackItem,
  ElementReferenceSnapshot,
  FeedbackSubmissionPayload,
  PendingAttachmentItem,
  ProposedFileEdit,
  SessionFeedbackEntry,
  WidgetConfig,
  WidgetPosition,
  WidgetSurfaceMode
} from "./types.ts";
import { MANDATORY_EXCLUDED_SELECTORS, describeSmartComponent } from "./sanitizer.ts";
import {
  ICON_CAMERA,
  ICON_CHECK,
  ICON_CHEVRON_DOWN,
  ICON_CHEVRON_RIGHT,
  ICON_CHEVRON_UP,
  ICON_CLOSE,
  ICON_CODE_PROMPT,
  ICON_EXPAND,
  ICON_FILE_CODE,
  ICON_GRIP,
  ICON_IMAGE,
  ICON_INBOX,
  ICON_KEY,
  ICON_MINIMIZE,
  ICON_PIN,
  ICON_PLUS,
  ICON_PUSH_LAYOUT,
  ICON_SCROLL_VERTICAL,
  ICON_SEND,
  ICON_SHIELD,
  ICON_SIDEBAR,
  ICON_SUN,
  ICON_MOON,
  ICON_UNDO
} from "./icons.ts";
import { WIDGET_SHADOW_STYLES } from "./styles.ts";
import { ContextDropApiClient } from "./api-client.ts";
import { ElementPicker } from "./element-picker.ts";
import {
  captureElementScreenshot,
  captureSurroundingContextScreenshot,
  captureViewportScreenshot
} from "./screenshot.ts";
import { buildUnifiedDiffElement, renderSafeMarkdown } from "./markdown.ts";

const CORNER_SNAP_ZONE_PX = 68;
const PEEL_DRAG_THRESHOLD_PX = 6;

const DEFAULT_PROVIDERS_FALLBACK: AgentProviderInfo[] = [
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

export const DEFAULT_SIDEBAR_WIDTH = 560;

const DEFAULT_CONFIG: WidgetConfig = {
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

const BaseHTMLElement: typeof HTMLElement =
  typeof HTMLElement !== "undefined"
    ? HTMLElement
    : (class {} as unknown as typeof HTMLElement);

export class ContextDropWidgetElement extends BaseHTMLElement {
  public static get observedAttributes(): string[] {
    return ["data-position", "data-config", "data-theme"];
  }

  public shadow: ShadowRoot | null = null;
  private config: WidgetConfig = structuredClone(DEFAULT_CONFIG);
  private customMetadata: Record<string, unknown> = {};
  private apiClient: ContextDropApiClient = new ContextDropApiClient("/context_drop");
  private picker: ElementPicker | null = null;

  private isOpen: boolean = false;
  private isMinimized: boolean = false;
  private isSubmitting: boolean = false;
  private isAgentBusy: boolean = false;
  private surfaceMode: WidgetSurfaceMode = "feedback";
  private sidebarSide: "right" | "left" = "right";
  private sidebarWidth: number = DEFAULT_SIDEBAR_WIDTH;
  private currentTheme: "light" | "dark" = "light";
  private composerThemeToggleBtn: HTMLButtonElement | null = null;
  private sidebarThemeToggleBtn: HTMLButtonElement | null = null;
  private pushPageLayout: boolean = false;
  private freePos: { left: number; top: number } | null = null;
  private isPeelDragging: boolean = false;
  private customPlaceholderSet: boolean = false;
  private pendingSmartCaptures: Set<Promise<void>> = new Set();

  private elementReferences: ElementReferenceSnapshot[] = [];
  private elementDomNodes: Map<string, Element> = new Map();
  private attachments: PendingAttachmentItem[] = [];
  private sessionHistory: SessionFeedbackEntry[] = [];

  // Local Agent state
  private agentStatusLoaded: boolean = false;
  private agentWorkspaceName: string = "rails-app";
  private agentMcpEnvironments: string[] = ["local"];
  private agentProviders: AgentProviderInfo[] = structuredClone(DEFAULT_PROVIDERS_FALLBACK);
  private activeProviderId: string = "anthropic";
  private selectedVaultProviderId: string = "anthropic";
  private isByokDrawerOpen: boolean = false;
  private isFeedbacksDrawerOpen: boolean = false;
  private feedbacksEnvFilter: string = "all";
  private crossEnvFeedbacks: CrossEnvFeedbackItem[] = [];
  private isLoadingFeedbacks: boolean = false;
  private agentMessages: AgentChatMessage[] = [];

  // Shadow DOM references
  private rootContainer: HTMLDivElement | null = null;
  private bookCornerBtn: HTMLButtonElement | null = null;
  private bookCornerCountEl: HTMLSpanElement | null = null;
  private bookCornerAgentDotEl: HTMLSpanElement | null = null;
  private bookCornerHintEl: HTMLSpanElement | null = null;
  private dragPinEl: HTMLDivElement | null = null;
  private cornerSnapGhostEl: HTMLDivElement | null = null;

  private compactBarEl: HTMLDivElement | null = null;
  private compactStatusEl: HTMLDivElement | null = null;
  private compactStepGroupEl: HTMLDivElement | null = null;
  private compactLayerUpBtn: HTMLButtonElement | null = null;
  private compactLayerDownBtn: HTMLButtonElement | null = null;
  private compactDoneBtn: HTMLButtonElement | null = null;
  private compactPinBtn: HTMLButtonElement | null = null;

  // Floating Feedback Composer elements
  private composerEl: HTMLDivElement | null = null;
  private composerTitleEl: HTMLHeadingElement | null = null;
  private composerMinBtn: HTMLButtonElement | null = null;
  private cornerPinBtn: HTMLButtonElement | null = null;
  private composerModeSwitchWrap: HTMLDivElement | null = null;
  private composerToolbarPickBtn: HTMLButtonElement | null = null;
  private composerToolbarScreenshotBtn: HTMLButtonElement | null = null;
  private composerToolbarUploadBtn: HTMLButtonElement | null = null;
  private chatThreadEl: HTMLDivElement | null = null;
  private textareaEl: HTMLTextAreaElement | null = null;
  private trayEl: HTMLDivElement | null = null;
  private statusEl: HTMLDivElement | null = null;
  private fileInputEl: HTMLInputElement | null = null;
  private submitBtn: HTMLButtonElement | null = null;

  // Docked Local Agent Sidebar elements
  private agentSidebarEl: HTMLElement | null = null;
  private sidebarPinBtn: HTMLButtonElement | null = null;
  private sidebarEnvPillEl: HTMLSpanElement | null = null;
  private sidebarPushBtn: HTMLButtonElement | null = null;
  private providerPillBtn: HTMLButtonElement | null = null;
  private keyDotEl: HTMLSpanElement | null = null;
  private providerPillLabelEl: HTMLSpanElement | null = null;
  private keysToggleBtn: HTMLButtonElement | null = null;
  private feedbacksToggleBtn: HTMLButtonElement | null = null;
  private byokDrawerEl: HTMLDivElement | null = null;
  private byokProviderSelect: HTMLSelectElement | null = null;
  private byokModelInput: HTMLInputElement | null = null;
  private byokModelPresetsSelect: HTMLSelectElement | null = null;
  private byokBaseUrlField: HTMLDivElement | null = null;
  private byokBaseUrlInput: HTMLInputElement | null = null;
  private byokKeySourceBadge: HTMLSpanElement | null = null;
  private byokKeyInput: HTMLInputElement | null = null;
  private feedbacksDrawerEl: HTMLDivElement | null = null;
  private feedbacksTabsEl: HTMLDivElement | null = null;
  private feedbacksListEl: HTMLDivElement | null = null;
  private agentStreamEl: HTMLDivElement | null = null;
  private agentTrayEl: HTMLDivElement | null = null;
  private agentStatusEl: HTMLDivElement | null = null;
  private agentTextareaEl: HTMLTextAreaElement | null = null;
  private agentSendBtn: HTMLButtonElement | null = null;

  private lastPointerX: number = 0;
  private lastPointerY: number = 0;
  private boundTrackPointer: (ev: MouseEvent) => void = () => {};
  private boundGlobalKeyDown: (ev: KeyboardEvent) => void = () => {};
  private cancelActivePeelDrag: (() => void) | null = null;

  public attributeChangedCallback(name: string, oldValue: string | null, newValue: string | null): void {
    if (oldValue === newValue) return;
    if (name === "data-theme" && (newValue === "dark" || newValue === "light")) {
      this.applyTheme(newValue, false);
    } else if (name === "data-position" && newValue) {
      this.setCornerPosition(newValue as WidgetPosition);
    }
  }

  public connectedCallback(): void {
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

    this.boundTrackPointer = (ev: MouseEvent) => {
      this.lastPointerX = ev.clientX;
      this.lastPointerY = ev.clientY;
    };

    this.boundGlobalKeyDown = (ev: KeyboardEvent) => {
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
            ): item is {
              clientRef: string;
              selector: string;
              friendlyLabel: string | undefined;
              element: Element;
            } => item !== null
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

  public disconnectedCallback(): void {
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

  public getConfig(): WidgetConfig {
    return this.config;
  }

  public setWidgetConfig(partial: Partial<WidgetConfig>): void {
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

  public getSurfaceMode(): WidgetSurfaceMode {
    return this.isAgentModeActive() ? "agent" : "feedback";
  }

  public setSurfaceMode(mode: WidgetSurfaceMode): void {
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

  public getElementReferences(): ElementReferenceSnapshot[] {
    return [...this.elementReferences];
  }

  public getAttachments(): PendingAttachmentItem[] {
    return [...this.attachments];
  }

  public getSessionHistory(): SessionFeedbackEntry[] {
    return [...this.sessionHistory];
  }

  public getAgentMessages(): AgentChatMessage[] {
    return [...this.agentMessages];
  }

  public isAgentModeActive(): boolean {
    return Boolean(this.config.agent?.enabled) && this.surfaceMode === "agent";
  }

  public isSmartSelectionMode(): boolean {
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

  private getElementFriendlyLabel(ref: ElementReferenceSnapshot, domNode?: Element): string {
    const metaLabel = ref.metadata?.friendly_label;
    if (typeof metaLabel === "string" && metaLabel.trim().length > 0) {
      return metaLabel.trim();
    }
    if (domNode) {
      return describeSmartComponent(domNode).label;
    }
    return ref.tag_name ? `Selected ${ref.tag_name} area` : "Selected page area";
  }

  public openComposer(): void {
    this.isOpen = true;
    this.isMinimized = false;
    if (this.isAgentModeActive()) {
      void this.ensureAgentStatusLoaded();
    }
    this.syncUiStates();
    this.focusActiveInput();
  }

  public closeComposer(): void {
    this.isOpen = false;
    this.isMinimized = false;
    if (this.picker && this.picker.isActive()) {
      this.picker.stop({ silent: true });
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
      this.picker.stop({ silent: true });
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
    this.picker.start({ suppressCursorPin: false });
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

  public getTheme(): "light" | "dark" {
    return this.currentTheme;
  }

  public setTheme(theme: "light" | "dark"): void {
    this.applyTheme(theme, true);
  }

  public toggleTheme(): void {
    const next = this.currentTheme === "dark" ? "light" : "dark";
    this.applyTheme(next, true);
  }

  private initTheme(): void {
    let theme: "light" | "dark" = "light";
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

  private applyTheme(theme: "light" | "dark", persist: boolean = true): void {
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

  private buildThemeToggleBtn(): HTMLButtonElement {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "cd-icon-btn cd-theme-toggle";
    this.updateThemeToggleBtn(btn);
    btn.addEventListener("click", () => {
      this.toggleTheme();
    });
    return btn;
  }

  private updateThemeToggleBtn(btn: HTMLButtonElement): void {
    const isDark = this.currentTheme === "dark";
    btn.title = isDark ? "Switch to light theme" : "Switch to dark theme";
    btn.setAttribute("aria-label", isDark ? "Switch to light theme" : "Switch to dark theme");
    btn.innerHTML = isDark ? ICON_SUN : ICON_MOON;
  }

  public setCornerPosition(position: WidgetPosition): void {
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
    this.attachments = this.attachments.filter(
      (att) =>
        !(att.element_reference_ref === clientRef && att.metadata?.auto_smart_context === true)
    );
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

  private focusActiveInput(): void {
    if (this.isAgentModeActive()) {
      this.agentTextareaEl?.focus();
    } else {
      this.textareaEl?.focus();
    }
  }

  private async hydrateConfigFromServer(): Promise<void> {
    try {
      const remoteConfig = await this.apiClient.fetchConfig();
      if (remoteConfig && typeof remoteConfig === "object") {
        const posOverride = this.getAttribute("data-position") as WidgetPosition | null;
        this.setWidgetConfig({
          ...remoteConfig,
          position: posOverride || remoteConfig.position || this.config.position
        });
      }
    } catch {
      // Non-fatal in static/offline environments
    }
  }

  private readDataAttributes(): void {
    const endpoint = this.getAttribute("data-endpoint") || "/context_drop";
    this.apiClient = new ContextDropApiClient(endpoint);

    const rawConfig = this.getAttribute("data-config");
    if (rawConfig) {
      try {
        const parsed = JSON.parse(rawConfig) as Partial<WidgetConfig>;
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
      this.customPlaceholderSet = true;
    }

    const rawMetadata = this.getAttribute("data-metadata");
    if (rawMetadata) {
      try {
        this.customMetadata = JSON.parse(rawMetadata) as Record<string, unknown>;
      } catch {
        this.customMetadata = {};
      }
    }

    const themeOverride = this.getAttribute("data-theme");
    if (themeOverride === "dark" || themeOverride === "light") {
      this.currentTheme = themeOverride;
    }
  }

  private detectViewportSnapCorner(
    clientX: number,
    clientY: number,
    originCorner: WidgetPosition,
    leftOriginZone: boolean
  ): WidgetPosition | null {
    if (typeof window === "undefined") return null;
    const vw = window.innerWidth || 1024;
    const vh = window.innerHeight || 768;

    let candidate: WidgetPosition | null = null;
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

  private isOutsideCornerZone(clientX: number, clientY: number, corner: WidgetPosition): boolean {
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

  private attachBookCornerLauncher(cornerBtn: HTMLButtonElement): void {
    let startX = 0;
    let startY = 0;
    let pointerActive = false;
    let peeled = false;
    let leftOriginZone = false;
    let activeSnapCorner: WidgetPosition | null = null;
    let suppressNextClick = false;
    let suppressTimer: ReturnType<typeof setTimeout> | null = null;

    const clearSuppress = (): void => {
      suppressNextClick = false;
      if (suppressTimer !== null) {
        clearTimeout(suppressTimer);
        suppressTimer = null;
      }
    };

    const updateDragPinPosition = (x: number, y: number): void => {
      if (!this.dragPinEl) return;
      this.dragPinEl.style.transform = `translate3d(${Math.round(x)}px, ${Math.round(y)}px, 0)`;
    };

    const finishPeelVisuals = (): void => {
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

    cornerBtn.addEventListener("click", (ev: MouseEvent) => {
      if (suppressNextClick) {
        clearSuppress();
        ev.preventDefault();
        ev.stopPropagation();
        return;
      }
      this.openComposer();
    });

    const onPointerMove = (ev: PointerEvent): void => {
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

    const armClickSuppression = (): void => {
      suppressNextClick = true;
      if (suppressTimer !== null) {
        clearTimeout(suppressTimer);
      }
      suppressTimer = setTimeout(() => {
        suppressNextClick = false;
        suppressTimer = null;
      }, 40);
    };

    const onPointerUp = (ev: PointerEvent): void => {
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

    const onPointerCancel = (): void => {
      if (!pointerActive) return;
      peeled = false;
      activeSnapCorner = null;
      this.picker?.stop({ silent: true });
      finishPeelVisuals();
      clearSuppress();
      this.syncUiStates();
    };

    cornerBtn.addEventListener("pointerdown", (ev: PointerEvent) => {
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

  private attachDragHandle(handleEl: HTMLElement): void {
    let startX = 0;
    let startY = 0;
    let initialLeft = 0;
    let initialTop = 0;
    let dragging = false;
    let moved = false;

    const onPointerMove = (ev: PointerEvent): void => {
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

    const cleanupDrag = (): void => {
      dragging = false;
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", cleanupDrag);
      window.removeEventListener("pointercancel", cleanupDrag);
    };

    handleEl.addEventListener("pointerdown", (ev: PointerEvent) => {
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

      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", cleanupDrag);
      window.addEventListener("pointercancel", cleanupDrag);
    });
  }

  private attachSidebarResizer(resizerEl: HTMLDivElement): void {
    let startX = 0;
    let startWidth = this.sidebarWidth;
    let active = false;

    const onPointerMove = (ev: PointerEvent): void => {
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

    const stopResize = (): void => {
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

    resizerEl.addEventListener("pointerdown", (ev: PointerEvent) => {
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

  private syncHostPagePushMargin(shouldPush: boolean): void {
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

  private buildCompactBarDom(): HTMLDivElement {
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

  private buildModeSwitchDom(activeMode: WidgetSurfaceMode): HTMLDivElement {
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

  private buildFeedbackComposerDom(): HTMLDivElement {
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

  private buildPromptToolbarActions(forAgentSidebar: boolean = false): HTMLDivElement {
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

  private buildAgentSidebarDom(): HTMLElement {
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

  private buildByokDrawerDom(): HTMLDivElement {
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

  private buildFeedbacksDrawerDom(): HTMLDivElement {
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

  private getShortEnvironmentSlug(): string {
    const raw = (this.config.environment || "development").toLowerCase();
    if (raw === "development") return "dev";
    if (raw === "production") return "prod";
    return raw;
  }

  private toggleByokDrawer(): void {
    this.isByokDrawerOpen = !this.isByokDrawerOpen;
    if (this.isByokDrawerOpen) {
      this.isFeedbacksDrawerOpen = false;
      this.selectedVaultProviderId = this.activeProviderId;
      this.syncProviderControls();
    }
    this.syncUiStates();
  }

  private toggleFeedbacksDrawer(): void {
    this.isFeedbacksDrawerOpen = !this.isFeedbacksDrawerOpen;
    if (this.isFeedbacksDrawerOpen) {
      this.isByokDrawerOpen = false;
      void this.loadCrossEnvFeedbacks(this.feedbacksEnvFilter);
    }
    this.syncUiStates();
  }

  private async ensureAgentStatusLoaded(): Promise<void> {
    if (this.agentStatusLoaded) return;
    try {
      const status: AgentStatusResponse = await this.apiClient.fetchAgentStatus();
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

  private getActiveProviderInfo(): AgentProviderInfo {
    return (
      this.agentProviders.find((p) => p.id === this.activeProviderId) ||
      this.agentProviders[0] ||
      DEFAULT_PROVIDERS_FALLBACK[0]
    );
  }

  private syncProviderControls(): void {
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

  private syncByokDrawerFields(): void {
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

  private async handleSaveByokSettings(): Promise<void> {
    const provider = this.byokProviderSelect?.value || this.selectedVaultProviderId;
    const model = (this.byokModelInput?.value || "").trim();
    const rawKey = (this.byokKeyInput?.value || "").trim();
    const baseUrl = (this.byokBaseUrlInput?.value || "").trim();

    try {
      const payload: {
        provider: string;
        model?: string;
        api_key?: string;
        base_url?: string;
        make_active: boolean;
      } = {
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

  private async handleClearByokKey(): Promise<void> {
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

  private async loadCrossEnvFeedbacks(environment: string): Promise<void> {
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

  private renderFeedbacksDrawerContent(): void {
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

  private renderAgentStream(): void {
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

      const starterItems: Array<{ label: string; action: () => void }> = [
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

  private buildDiffCardDom(edit: ProposedFileEdit): HTMLDivElement {
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

  private async handleEditDecision(
    edit: ProposedFileEdit,
    action: "apply" | "reject" | "revert"
  ): Promise<void> {
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

  public async handleAgentSubmit(): Promise<void> {
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

    const userMsg: AgentChatMessage = {
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

  private syncPinActiveIndicators(pickerActive: boolean): void {
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

  private getVisibleContextCount(): number {
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

  private syncUiStates(): void {
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

  private renderCompactCoachBar(pickerActive: boolean, candidateCount: number = 0): void {
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

  private renderChatThread(): void {
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

  private renderTray(): void {
    for (const targetTray of [this.trayEl, this.agentTrayEl]) {
      if (!targetTray) continue;
      this.populateTrayElement(targetTray);
    }
    if (this.sessionHistory.length === 0) {
      this.renderChatThread();
    }
  }

  private populateTrayElement(trayContainer: HTMLDivElement): void {
    trayContainer.innerHTML = "";
    const smartTray = trayContainer === this.trayEl && this.isSmartSelectionMode();

    if (smartTray) {
      const linkedShotIds = new Set<string>();

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

  private captureSmartSurroundingContext(
    element: Element,
    elementClientRef: string,
    friendlyLabel: string
  ): Promise<void> {
    const task = (async (): Promise<void> => {
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

  public async handleSubmit(): Promise<void> {
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

      const payload: FeedbackSubmissionPayload = {
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

  private hideStatus(): void {
    for (const bar of [this.statusEl, this.agentStatusEl]) {
      if (bar) {
        bar.hidden = true;
      }
    }
  }

  private showStatus(text: string, kind: "error" | "success"): void {
    for (const bar of [this.statusEl, this.agentStatusEl]) {
      if (!bar) continue;
      bar.textContent = text;
      bar.className = `cd-status ${kind}`;
      bar.hidden = false;
    }
  }
}

export function registerContextDropWidget(): void {
  if (typeof customElements !== "undefined" && !customElements.get("context-drop-widget")) {
    customElements.define("context-drop-widget", ContextDropWidgetElement);
  }
}
