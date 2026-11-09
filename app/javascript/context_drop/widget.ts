import type {
  ElementReferenceSnapshot,
  FeedbackSubmissionPayload,
  PendingAttachmentItem,
  WidgetConfig,
  WidgetPosition
} from "./types.ts";
import { MANDATORY_EXCLUDED_SELECTORS } from "./sanitizer.ts";
import { WIDGET_SHADOW_STYLES } from "./styles.ts";
import { ContextDropApiClient } from "./api-client.ts";
import { ElementPicker } from "./element-picker.ts";
import { captureElementScreenshot, captureViewportScreenshot } from "./screenshot.ts";

const DEFAULT_CONFIG: WidgetConfig = {
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
  private isSubmitting: boolean = false;
  private elementReferences: ElementReferenceSnapshot[] = [];
  private elementDomNodes: Map<string, Element> = new Map();
  private attachments: PendingAttachmentItem[] = [];

  private rootContainer: HTMLDivElement | null = null;
  private composerEl: HTMLDivElement | null = null;
  private triggerBtn: HTMLButtonElement | null = null;
  private textareaEl: HTMLTextAreaElement | null = null;
  private trayEl: HTMLDivElement | null = null;
  private statusEl: HTMLDivElement | null = null;
  private fileInputEl: HTMLInputElement | null = null;
  private submitBtn: HTMLButtonElement | null = null;

  public connectedCallback(): void {
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

  public disconnectedCallback(): void {
    if (this.picker && this.picker.isActive()) {
      this.picker.stop();
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

  public openComposer(): void {
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

  public closeComposer(): void {
    this.isOpen = false;
    if (this.composerEl) {
      this.composerEl.hidden = true;
    }
    if (this.triggerBtn) {
      this.triggerBtn.setAttribute("aria-expanded", "false");
    }
  }

  public toggleComposer(): void {
    if (this.isOpen) {
      this.closeComposer();
    } else {
      this.openComposer();
    }
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
    this.renderTray();
    return true;
  }

  public removeElementReference(clientRef: string): void {
    this.elementReferences = this.elementReferences.filter((el) => el.client_ref !== clientRef);
    this.elementDomNodes.delete(clientRef);
    this.renderTray();
  }

  public removeAttachment(attachmentId: string): void {
    this.attachments = this.attachments.filter((att) => att.id !== attachmentId);
    this.renderTray();
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

  private renderShadowDom(): void {
    if (!this.shadow) return;
    this.shadow.innerHTML = "";

    const styleEl = document.createElement("style");
    styleEl.textContent = WIDGET_SHADOW_STYLES;
    this.shadow.appendChild(styleEl);

    const root = document.createElement("div");
    root.className = `cd-root pos-${this.config.position}`;
    this.rootContainer = root;

    // Composer card
    const composer = document.createElement("div");
    composer.className = "cd-composer";
    composer.setAttribute("role", "dialog");
    composer.setAttribute("aria-label", "Feedback Composer");
    composer.hidden = !this.isOpen;
    this.composerEl = composer;

    // Header
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

    // Multiline prompt textarea
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

    // Attachment & Element chip tray
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

    // Toolbar
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

    // Floating trigger button
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

  private renderTray(): void {
    if (!this.trayEl) return;
    this.trayEl.innerHTML = "";

    // Render ElementReference chips
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
      this.showStatus("Please enter a message, attach an image, or select a DOM element.", "error");
      return;
    }

    this.isSubmitting = true;
    if (this.submitBtn) {
      this.submitBtn.disabled = true;
      this.submitBtn.textContent = "Sending...";
    }

    try {
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
