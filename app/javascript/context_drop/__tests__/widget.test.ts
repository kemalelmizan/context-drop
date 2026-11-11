import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  captureElementSnapshot,
  computeDomPath,
  computeSelector,
  extractSanitizedAttributes,
  extractSanitizedText,
  isElementExcluded,
  isSelectableElement,
  resolveAncestorChain,
  resolveCandidateStack
} from "../sanitizer.ts";
import { ElementPicker } from "../element-picker.ts";
import { ContextDropWidgetElement } from "../widget.ts";

interface MockNodeInit {
  tagName?: string;
  attributes?: Record<string, string>;
  children?: Array<MockElement | MockTextNode>;
  rect?: { x: number; y: number; width: number; height: number };
}

class MockTextNode {
  public readonly nodeType: number = 3;
  public nodeValue: string;

  constructor(text: string) {
    this.nodeValue = text;
  }
}

class MockElement {
  public readonly nodeType: number = 1;
  public tagName: string;
  public parentElement: MockElement | null = null;
  public childNodes: Array<MockElement | MockTextNode> = [];
  private attributes: Map<string, string> = new Map();
  private rect: { x: number; y: number; width: number; height: number };

  constructor(init: MockNodeInit = {}) {
    this.tagName = (init.tagName || "DIV").toUpperCase();
    this.rect = init.rect || { x: 24, y: 48, width: 180, height: 42 };
    if (init.attributes) {
      for (const [k, v] of Object.entries(init.attributes)) {
        this.attributes.set(k, v);
      }
    }
    if (init.children) {
      for (const child of init.children) {
        if (child instanceof MockElement) {
          child.parentElement = this;
        }
        this.childNodes.push(child);
      }
    }
  }

  public hasAttribute(name: string): boolean {
    return this.attributes.has(name);
  }

  public getAttribute(name: string): string | null {
    return this.attributes.has(name) ? (this.attributes.get(name) ?? null) : null;
  }

  public getAttributeNames(): string[] {
    return Array.from(this.attributes.keys());
  }

  public getBoundingClientRect(): { x: number; y: number; left: number; top: number; width: number; height: number } {
    return {
      ...this.rect,
      left: this.rect.x,
      top: this.rect.y
    };
  }

  public matches(selector: string): boolean {
    if (selector.startsWith(".")) {
      const cls = (this.getAttribute("class") || "").split(/\s+/);
      return cls.includes(selector.slice(1));
    }
    if (selector.startsWith("#")) {
      return this.getAttribute("id") === selector.slice(1);
    }
    return false;
  }
}

describe("ContextDrop Frontend DOM Sanitizer & Snapshot Capture", () => {
  it("excludes elements inside data-feedback-ignore or data-feedback-sensitive containers recursively", () => {
    const ssnSpan = new MockElement({
      tagName: "SPAN",
      attributes: { id: "ssn" },
      children: [new MockTextNode("123-45-6789")]
    });
    const ignoredContainer = new MockElement({
      tagName: "DIV",
      attributes: { "data-feedback-ignore": "true" },
      children: [ssnSpan]
    });

    assert.equal(isElementExcluded(ignoredContainer as unknown as Element), true);
    assert.equal(isElementExcluded(ssnSpan as unknown as Element), true);
    assert.equal(captureElementSnapshot(ssnSpan as unknown as Element), null);
  });

  it("excludes password inputs, hidden inputs, and credit-card autocomplete inputs", () => {
    const passwordInput = new MockElement({
      tagName: "INPUT",
      attributes: { type: "password", value: "s3cret!" }
    });
    const ccInput = new MockElement({
      tagName: "INPUT",
      attributes: { type: "text", autocomplete: "cc-number" }
    });

    assert.equal(isElementExcluded(passwordInput as unknown as Element), true);
    assert.equal(isElementExcluded(ccInput as unknown as Element), true);
  });

  it("omits sensitive descendant text and password values when selecting a parent container", () => {
    const label = new MockElement({
      tagName: "LABEL",
      children: [new MockTextNode("Email Address")]
    });
    const passwordInput = new MockElement({
      tagName: "INPUT",
      attributes: { type: "password", value: "s3cret!" }
    });
    const sensitiveChild = new MockElement({
      tagName: "DIV",
      attributes: { "data-feedback-sensitive": "true" },
      children: [new MockTextNode("Secret API Token 999")]
    });
    const form = new MockElement({
      tagName: "FORM",
      attributes: { id: "profile-form", class: "settings-card" },
      children: [label, passwordInput, sensitiveChild]
    });

    const text = extractSanitizedText(form as unknown as Element);
    assert.equal(text, "Email Address");
  });

  it("strips value, event handlers, and javascript: URLs while preserving allowlisted attributes", () => {
    const btn = new MockElement({
      tagName: "BUTTON",
      attributes: {
        id: "checkout-button",
        class: "btn primary",
        "data-testid": "pay-now-btn",
        "aria-label": "Pay Now",
        "aria-hidden": "false",
        value: "should_not_be_captured",
        onclick: "malicious()",
        href: "javascript:alert(1)"
      }
    });

    const attrs = extractSanitizedAttributes(btn as unknown as Element);
    assert.deepEqual(attrs, {
      id: "checkout-button",
      class: "btn primary",
      "data-testid": "pay-now-btn",
      "aria-label": "Pay Now"
    });
  });

  it("computes best selector, structural dom_path, and point-in-time snapshot", () => {
    const button = new MockElement({
      tagName: "BUTTON",
      attributes: { id: "checkout-button", class: "btn primary" },
      children: [new MockTextNode("Complete Purchase")],
      rect: { x: 100, y: 250, width: 200, height: 48 }
    });
    const main = new MockElement({
      tagName: "MAIN",
      attributes: { class: "checkout-layout" },
      children: [button]
    });
    new MockElement({
      tagName: "BODY",
      children: [main]
    });

    assert.equal(computeSelector(button as unknown as Element), "#checkout-button");
    assert.equal(
      computeDomPath(button as unknown as Element),
      "body > main.checkout-layout > button#checkout-button"
    );

    const snapshot = captureElementSnapshot(button as unknown as Element, [], "ref_123");
    assert.ok(snapshot);
    assert.equal(snapshot.client_ref, "ref_123");
    assert.equal(snapshot.tag_name, "button");
    assert.equal(snapshot.selector, "#checkout-button");
    assert.equal(snapshot.text_content, "Complete Purchase");
    assert.deepEqual(snapshot.bounding_rect, { x: 100, y: 250, width: 200, height: 48 });
    assert.equal("outerHTML" in snapshot, false);
  });

  it("resolves cascading ancestor chain and overlapping candidate stack while filtering sensitive elements", () => {
    const iconSpan = new MockElement({
      tagName: "SPAN",
      attributes: { class: "icon-label" },
      children: [new MockTextNode("Pay $49.00")],
      rect: { x: 112, y: 260, width: 88, height: 20 }
    });
    const button = new MockElement({
      tagName: "BUTTON",
      attributes: { id: "pay-btn", class: "btn-cta" },
      children: [iconSpan],
      rect: { x: 100, y: 250, width: 200, height: 44 }
    });
    const card = new MockElement({
      tagName: "DIV",
      attributes: { class: "pricing-card featured" },
      children: [button],
      rect: { x: 80, y: 180, width: 320, height: 240 }
    });
    const overlappingRibbon = new MockElement({
      tagName: "DIV",
      attributes: { class: "floating-promo-badge" },
      children: [new MockTextNode("Limited Offer")],
      rect: { x: 95, y: 245, width: 140, height: 28 }
    });
    const excludedOverlay = new MockElement({
      tagName: "DIV",
      attributes: { "data-feedback-ignore": "true", class: "ignored-overlay" },
      rect: { x: 0, y: 0, width: 500, height: 500 }
    });
    const section = new MockElement({
      tagName: "SECTION",
      attributes: { id: "checkout-section" },
      children: [card, overlappingRibbon, excludedOverlay],
      rect: { x: 40, y: 120, width: 640, height: 400 }
    });
    const body = new MockElement({
      tagName: "BODY",
      children: [section],
      rect: { x: 0, y: 0, width: 1280, height: 800 }
    });

    assert.equal(isSelectableElement(body as unknown as Element), false);
    assert.equal(isSelectableElement(excludedOverlay as unknown as Element), false);
    assert.equal(isSelectableElement(button as unknown as Element), true);

    const ancestors = resolveAncestorChain(button as unknown as Element);
    assert.equal(ancestors.length, 3);
    assert.deepEqual(
      ancestors.map((el) => computeSelector(el)),
      ["#checkout-section", "div.pricing-card.featured", "#pay-btn"]
    );

    const stack = resolveCandidateStack(
      button as unknown as Element,
      [
        excludedOverlay as unknown as Element,
        button as unknown as Element,
        overlappingRibbon as unknown as Element,
        card as unknown as Element
      ]
    );

    assert.deepEqual(
      stack.map((item) => ({
        selector: item.selector,
        relation: item.relation
      })),
      [
        { selector: "#pay-btn", relation: "target" },
        { selector: "div.floating-promo-badge", relation: "overlap" },
        { selector: "span.icon-label", relation: "child" },
        { selector: "div.pricing-card.featured", relation: "ancestor" },
        { selector: "#checkout-section", relation: "ancestor" }
      ]
    );
  });

  it("manages pinned element references, compact bar minimization, and element picker lifecycle", () => {
    const widget = new ContextDropWidgetElement();
    assert.equal(widget.getElementReferences().length, 0);

    const btn = new MockElement({
      tagName: "BUTTON",
      attributes: { id: "submit-order" },
      children: [new MockTextNode("Place Order")]
    });
    const snap = captureElementSnapshot(btn as unknown as Element, [], "ref_pin_1");
    assert.ok(snap);

    const added = widget.addElementReference(snap, btn as unknown as Element);
    assert.equal(added, true);
    assert.equal(widget.getElementReferences().length, 1);
    assert.equal(widget.getElementReferences()[0].selector, "#submit-order");

    widget.minimizeToCompactBar();
    widget.expandFromCompactBar();

    widget.removeElementReference("ref_pin_1");
    assert.equal(widget.getElementReferences().length, 0);

    let selectedRef: string | null = null;
    const picker = new ElementPicker({
      onSelect: (s) => {
        selectedRef = s.selector;
      },
      onExit: () => {},
      canSelectMore: () => true,
      getExcludedSelectors: () => []
    });

    assert.equal(picker.isActive(), false);
    assert.equal(picker.selectElementDirectly(btn as unknown as Element), true);
    assert.equal(selectedRef, "#submit-order");
  });
});

interface MockListenerEntry {
  listener: (ev: MockUiEvent) => void;
  capture: boolean;
}

class MockUiEvent {
  public readonly type: string;
  public readonly button: number;
  public readonly clientX: number;
  public readonly clientY: number;
  public target: unknown = null;
  public currentTarget: unknown = null;
  public defaultPrevented: boolean = false;
  public propagationStopped: boolean = false;

  constructor(
    type: string,
    init: { button?: number; clientX?: number; clientY?: number } = {}
  ) {
    this.type = type;
    this.button = init.button ?? 0;
    this.clientX = init.clientX ?? 0;
    this.clientY = init.clientY ?? 0;
  }

  public preventDefault(): void {
    this.defaultPrevented = true;
  }

  public stopPropagation(): void {
    this.propagationStopped = true;
  }
}

class MockClassList {
  private classes: Set<string> = new Set();

  public syncFromString(raw: string): void {
    this.classes.clear();
    for (const token of raw.split(/\s+/)) {
      if (token) this.classes.add(token);
    }
  }

  public toString(): string {
    return Array.from(this.classes).join(" ");
  }

  public add(...tokens: string[]): void {
    for (const token of tokens) {
      if (token) this.classes.add(token);
    }
  }

  public remove(...tokens: string[]): void {
    for (const token of tokens) {
      this.classes.delete(token);
    }
  }

  public toggle(token: string, force?: boolean): boolean {
    const shouldHave = force !== undefined ? force : !this.classes.has(token);
    if (shouldHave) {
      this.classes.add(token);
    } else {
      this.classes.delete(token);
    }
    return shouldHave;
  }

  public contains(token: string): boolean {
    return this.classes.has(token);
  }
}

class MockDomElement {
  public readonly nodeType: number = 1;
  public readonly tagName: string;
  public readonly classList: MockClassList = new MockClassList();
  public readonly style: Record<string, string> = { cssText: "", left: "", top: "", cursor: "" };
  public parentElement: MockDomElement | null = null;
  public parentNode: MockDomElement | null = null;
  public childNodes: MockDomElement[] = [];
  public hidden: boolean = false;
  public type: string = "";
  public title: string = "";
  public textContent: string = "";
  public placeholder: string = "";
  public value: string = "";
  public disabled: boolean = false;
  public multiple: boolean = false;
  public accept: string = "";
  public scrollTop: number = 0;
  public scrollHeight: number = 0;
  private rawHtml: string = "";
  private attrs: Map<string, string> = new Map();
  private listeners: Map<string, MockListenerEntry[]> = new Map();
  private rect: { left: number; top: number; width: number; height: number } = {
    left: 20,
    top: 20,
    width: 220,
    height: 40
  };

  constructor(tagName: string) {
    this.tagName = tagName.toUpperCase();
  }

  public get className(): string {
    return this.classList.toString();
  }

  public set className(val: string) {
    this.classList.syncFromString(val);
    this.attrs.set("class", val);
  }

  public get innerHTML(): string {
    return this.rawHtml;
  }

  public set innerHTML(html: string) {
    this.rawHtml = html;
    this.childNodes = [];
    if (html.includes("<svg")) {
      this.appendChild(new MockDomElement("svg"));
    }
    const spanMatches = html.matchAll(/<span(?:\s+class="([^"]*)")?>([^<]*)<\/span>/g);
    for (const match of spanMatches) {
      const span = new MockDomElement("span");
      if (match[1]) span.className = match[1];
      span.textContent = match[2] || "";
      this.appendChild(span);
    }
  }

  public setAttribute(name: string, value: string): void {
    this.attrs.set(name, value);
    if (name === "class") {
      this.classList.syncFromString(value);
    }
  }

  public getAttribute(name: string): string | null {
    return this.attrs.get(name) ?? null;
  }

  public hasAttribute(name: string): boolean {
    return this.attrs.has(name);
  }

  public appendChild(child: MockDomElement): MockDomElement {
    child.parentElement = this;
    child.parentNode = this;
    this.childNodes.push(child);
    return child;
  }

  public removeChild(child: MockDomElement): MockDomElement {
    const idx = this.childNodes.indexOf(child);
    if (idx !== -1) {
      this.childNodes.splice(idx, 1);
      child.parentElement = null;
      child.parentNode = null;
    }
    return child;
  }

  public contains(other: unknown): boolean {
    let cur = other as MockDomElement | null;
    while (cur) {
      if (cur === this) return true;
      cur = cur.parentNode;
    }
    return false;
  }

  public matches(selector: string): boolean {
    if (selector.startsWith(".")) {
      return this.classList.contains(selector.slice(1));
    }
    if (selector.startsWith("#")) {
      return this.getAttribute("id") === selector.slice(1);
    }
    const attrMatch = selector.match(/^\[([a-zA-Z0-9_-]+)(?:=['"]([^'"]*)['"])?\]$/);
    if (attrMatch) {
      if (!this.hasAttribute(attrMatch[1])) return false;
      return attrMatch[2] === undefined || this.getAttribute(attrMatch[1]) === attrMatch[2];
    }
    return this.tagName.toLowerCase() === selector.toLowerCase();
  }

  public closest(selector: string): MockDomElement | null {
    let cur: MockDomElement | null = this;
    while (cur) {
      if (cur.matches(selector)) return cur;
      cur = cur.parentElement;
    }
    return null;
  }

  public querySelector(selector: string): MockDomElement | null {
    for (const child of this.childNodes) {
      if (child.matches(selector)) return child;
      const nested = child.querySelector(selector);
      if (nested) return nested;
    }
    return null;
  }

  public getBoundingClientRect(): {
    x: number;
    y: number;
    left: number;
    top: number;
    width: number;
    height: number;
  } {
    const parsedLeft = this.style.left ? Number.parseFloat(this.style.left) : this.rect.left;
    const parsedTop = this.style.top ? Number.parseFloat(this.style.top) : this.rect.top;
    return {
      x: parsedLeft,
      y: parsedTop,
      left: parsedLeft,
      top: parsedTop,
      width: this.rect.width,
      height: this.rect.height
    };
  }

  public focus(): void {}

  public addEventListener(
    type: string,
    listener: (ev: MockUiEvent) => void,
    options?: boolean | { capture?: boolean }
  ): void {
    const capture = typeof options === "boolean" ? options : Boolean(options?.capture);
    const list = this.listeners.get(type) ?? [];
    list.push({ listener, capture });
    this.listeners.set(type, list);
  }

  public removeEventListener(
    type: string,
    listener: (ev: MockUiEvent) => void,
    options?: boolean | { capture?: boolean }
  ): void {
    const capture = typeof options === "boolean" ? options : Boolean(options?.capture);
    const list = this.listeners.get(type);
    if (!list) return;
    this.listeners.set(
      type,
      list.filter((entry) => !(entry.listener === listener && entry.capture === capture))
    );
  }

  public dispatchEvent(ev: MockUiEvent): boolean {
    if (!ev.target) {
      ev.target = this;
    }
    const path: MockDomElement[] = [];
    let cur: MockDomElement | null = this;
    while (cur) {
      path.push(cur);
      cur = cur.parentElement;
    }

    for (let i = path.length - 1; i >= 0 && !ev.propagationStopped; i -= 1) {
      const node = path[i];
      ev.currentTarget = node;
      for (const entry of [...(node.listeners.get(ev.type) ?? [])]) {
        if (entry.capture) {
          entry.listener(ev);
        }
      }
    }

    for (let i = 0; i < path.length && !ev.propagationStopped; i += 1) {
      const node = path[i];
      ev.currentTarget = node;
      for (const entry of [...(node.listeners.get(ev.type) ?? [])]) {
        if (!entry.capture) {
          entry.listener(ev);
        }
      }
    }

    return !ev.defaultPrevented;
  }
}

function withMountedWidget(
  fn: (ctx: {
    widget: ContextDropWidgetElement;
    shadowRoot: MockDomElement;
    mockWindow: MockDomElement & { innerWidth: number; innerHeight: number; location: { href: string } };
  }) => void | Promise<void>
): Promise<void> {
  const g = globalThis as Record<string, unknown>;
  const prevWindow = g.window;
  const prevDocument = g.document;

  const mockWindow = Object.assign(new MockDomElement("window"), {
    innerWidth: 1280,
    innerHeight: 800,
    location: { href: "http://localhost:3000/orders" }
  });
  const mockBody = new MockDomElement("body");
  const mockDocument = {
    body: mockBody,
    createElement: (tag: string) => new MockDomElement(tag)
  };

  g.window = mockWindow;
  g.document = mockDocument;

  const shadowRoot = new MockDomElement("shadow-root");
  const widget = new ContextDropWidgetElement();
  const hostShim = widget as unknown as {
    attachShadow: () => ShadowRoot;
    getAttribute: (name: string) => string | null;
  };
  hostShim.attachShadow = () => shadowRoot as unknown as ShadowRoot;
  hostShim.getAttribute = () => null;

  widget.connectedCallback();

  return Promise.resolve()
    .then(() => fn({ widget, shadowRoot, mockWindow }))
    .finally(() => {
      widget.disconnectedCallback();
      if (prevWindow === undefined) {
        delete g.window;
      } else {
        g.window = prevWindow;
      }
      if (prevDocument === undefined) {
        delete g.document;
      } else {
        g.document = prevDocument;
      }
    });
}

describe("ContextDrop Floating Dock & Drag Handle Interactions", () => {
  it("activates Pin and ContextDrop floating dock buttons on pointer click (including nested label spans)", async () => {
    await withMountedWidget(({ shadowRoot, mockWindow }) => {
      const pinDock = shadowRoot.querySelector(".cd-pin-dock");
      const floatingPinBtn = shadowRoot.querySelector(".cd-floating-pin-btn");
      const triggerBtn = shadowRoot.querySelector(".cd-trigger");
      const composer = shadowRoot.querySelector(".cd-composer");
      const compactBar = shadowRoot.querySelector(".cd-compact-bar");

      assert.ok(pinDock && floatingPinBtn && triggerBtn && composer && compactBar);
      assert.equal(composer.hidden, true);
      assert.equal(compactBar.hidden, true);
      assert.equal(pinDock.hidden, false);

      // Click nested <span>ContextDrop</span> inside .cd-trigger
      const triggerSpan = triggerBtn.querySelector("span") ?? triggerBtn;
      triggerSpan.dispatchEvent(new MockUiEvent("pointerdown", { button: 0, clientX: 40, clientY: 30 }));
      mockWindow.dispatchEvent(new MockUiEvent("pointerup", { button: 0, clientX: 40, clientY: 30 }));
      triggerSpan.dispatchEvent(new MockUiEvent("click", { button: 0, clientX: 40, clientY: 30 }));

      assert.equal(composer.hidden, false);
      assert.equal(pinDock.hidden, true);
      assert.equal(triggerBtn.getAttribute("aria-expanded"), "true");

      // Close composer to return to floating dock
      const closeBtn = shadowRoot.querySelector("[aria-label='Close feedback composer']");
      assert.ok(closeBtn);
      closeBtn.dispatchEvent(new MockUiEvent("click"));
      assert.equal(composer.hidden, true);
      assert.equal(pinDock.hidden, false);

      // Click nested <span>Pin</span> inside .cd-floating-pin-btn
      const pinSpan = floatingPinBtn.querySelector("span") ?? floatingPinBtn;
      pinSpan.dispatchEvent(new MockUiEvent("pointerdown", { button: 0, clientX: 30, clientY: 30 }));
      mockWindow.dispatchEvent(new MockUiEvent("pointerup", { button: 0, clientX: 30, clientY: 30 }));
      pinSpan.dispatchEvent(new MockUiEvent("click", { button: 0, clientX: 30, clientY: 30 }));

      assert.equal(compactBar.hidden, false);
      assert.equal(floatingPinBtn.getAttribute("aria-pressed"), "true");
    });
  });

  it("repositions the dock when dragging >5px from Pin or ContextDrop buttons and suppresses synthetic click", async () => {
    await withMountedWidget(({ shadowRoot, mockWindow }) => {
      const root = shadowRoot.querySelector(".cd-root");
      const pinDock = shadowRoot.querySelector(".cd-pin-dock");
      const floatingPinBtn = shadowRoot.querySelector(".cd-floating-pin-btn");
      const triggerBtn = shadowRoot.querySelector(".cd-trigger");
      const composer = shadowRoot.querySelector(".cd-composer");
      const compactBar = shadowRoot.querySelector(".cd-compact-bar");

      assert.ok(root && pinDock && floatingPinBtn && triggerBtn && composer && compactBar);

      // Drag >5px starting from .cd-floating-pin-btn
      floatingPinBtn.dispatchEvent(new MockUiEvent("pointerdown", { button: 0, clientX: 50, clientY: 50 }));
      mockWindow.dispatchEvent(new MockUiEvent("pointermove", { clientX: 150, clientY: 120 }));
      assert.equal(pinDock.classList.contains("is-dragging"), true);
      assert.equal(root.classList.contains("is-free-positioned"), true);
      assert.equal(root.style.left, "120px");
      assert.equal(root.style.top, "90px");

      mockWindow.dispatchEvent(new MockUiEvent("pointerup", { clientX: 150, clientY: 120 }));
      assert.equal(pinDock.classList.contains("is-dragging"), false);

      // Browser dispatches synthetic click after pointerup over the dragged button
      const syntheticClick = new MockUiEvent("click", { clientX: 150, clientY: 120 });
      floatingPinBtn.dispatchEvent(syntheticClick);
      assert.equal(syntheticClick.defaultPrevented, true);
      assert.equal(compactBar.hidden, true);
      assert.equal(composer.hidden, true);

      // Drag >5px starting from .cd-trigger
      triggerBtn.dispatchEvent(new MockUiEvent("pointerdown", { button: 0, clientX: 150, clientY: 120 }));
      mockWindow.dispatchEvent(new MockUiEvent("pointermove", { clientX: 210, clientY: 180 }));
      mockWindow.dispatchEvent(new MockUiEvent("pointerup", { clientX: 210, clientY: 180 }));
      const triggerSyntheticClick = new MockUiEvent("click", { clientX: 210, clientY: 180 });
      triggerBtn.dispatchEvent(triggerSyntheticClick);
      assert.equal(triggerSyntheticClick.defaultPrevented, true);
      assert.equal(composer.hidden, true);
      assert.equal(root.style.left, "180px");
      assert.equal(root.style.top, "150px");

      // Subsequent normal click on .cd-trigger opens composer as expected
      triggerBtn.dispatchEvent(new MockUiEvent("pointerdown", { button: 0, clientX: 210, clientY: 180 }));
      mockWindow.dispatchEvent(new MockUiEvent("pointerup", { button: 0, clientX: 210, clientY: 180 }));
      triggerBtn.dispatchEvent(new MockUiEvent("click", { button: 0, clientX: 210, clientY: 180 }));
      assert.equal(composer.hidden, false);
    });
  });

  it("supports keyboard activation (click without pointerdown/pointerup) on Pin and ContextDrop buttons", async () => {
    await withMountedWidget(async ({ shadowRoot, mockWindow }) => {
      const floatingPinBtn = shadowRoot.querySelector(".cd-floating-pin-btn");
      const triggerBtn = shadowRoot.querySelector(".cd-trigger");
      const composer = shadowRoot.querySelector(".cd-composer");
      const compactBar = shadowRoot.querySelector(".cd-compact-bar");

      assert.ok(floatingPinBtn && triggerBtn && composer && compactBar);

      // Keyboard Enter/Space dispatches click directly with no pointer events
      triggerBtn.dispatchEvent(new MockUiEvent("click"));
      assert.equal(composer.hidden, false);

      // Close via close button
      const closeBtn = shadowRoot.querySelector("[aria-label='Close feedback composer']");
      assert.ok(closeBtn);
      closeBtn.dispatchEvent(new MockUiEvent("click"));
      assert.equal(composer.hidden, true);

      // Simulate a drag where pointerup occurred outside the button (no synthetic click dispatched)
      floatingPinBtn.dispatchEvent(new MockUiEvent("pointerdown", { button: 0, clientX: 30, clientY: 30 }));
      mockWindow.dispatchEvent(new MockUiEvent("pointermove", { clientX: 90, clientY: 90 }));
      mockWindow.dispatchEvent(new MockUiEvent("pointerup", { clientX: 90, clientY: 90 }));

      await new Promise((resolve) => setTimeout(resolve, 5));

      // Subsequent keyboard activation on floatingPinBtn still works
      floatingPinBtn.dispatchEvent(new MockUiEvent("click"));
      assert.equal(compactBar.hidden, false);
    });
  });

  it("ignores nested buttons inside container drag bars (.cd-composer-header, .cd-compact-bar)", async () => {
    await withMountedWidget(({ widget, shadowRoot, mockWindow }) => {
      widget.openComposer();

      const root = shadowRoot.querySelector(".cd-root");
      const header = shadowRoot.querySelector(".cd-composer-header");
      const minBtn = shadowRoot.querySelector("[aria-label='Minimize chatbox to compact bar']");
      const compactBar = shadowRoot.querySelector(".cd-compact-bar");

      assert.ok(root && header && minBtn && compactBar);

      // Pointerdown + move on nested minimize button must NOT drag .cd-root
      minBtn.dispatchEvent(new MockUiEvent("pointerdown", { button: 0, clientX: 100, clientY: 40 }));
      mockWindow.dispatchEvent(new MockUiEvent("pointermove", { clientX: 250, clientY: 160 }));
      mockWindow.dispatchEvent(new MockUiEvent("pointerup", { clientX: 250, clientY: 160 }));
      assert.equal(root.classList.contains("is-free-positioned"), false);

      // Clicking nested minimize button minimizes to compact bar
      minBtn.dispatchEvent(new MockUiEvent("click"));
      assert.equal(compactBar.hidden, false);

      // Dragging non-button area of .cd-compact-bar DOES reposition .cd-root
      compactBar.dispatchEvent(new MockUiEvent("pointerdown", { button: 0, clientX: 60, clientY: 40 }));
      mockWindow.dispatchEvent(new MockUiEvent("pointermove", { clientX: 140, clientY: 110 }));
      mockWindow.dispatchEvent(new MockUiEvent("pointerup", { clientX: 140, clientY: 110 }));
      assert.equal(root.classList.contains("is-free-positioned"), true);
      assert.equal(root.style.left, "100px");
      assert.equal(root.style.top, "90px");
    });
  });
});
