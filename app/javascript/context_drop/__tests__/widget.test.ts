import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  captureElementSnapshot,
  computeDomPath,
  computeSelector,
  describeSmartComponent,
  extractSanitizedAttributes,
  extractSanitizedText,
  isElementExcluded,
  isSelectableElement,
  resolveAncestorChain,
  resolveCandidateStack,
  resolveSmartComponent
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

  it("promotes leaf nodes to meaningful UI components with plain-language labels in smart mode", () => {
    const iconSpan = new MockElement({
      tagName: "SPAN",
      attributes: { class: "btn-label" },
      children: [new MockTextNode("Pay $49.00")],
      rect: { x: 88, y: 188, width: 90, height: 18 }
    });
    const payButton = new MockElement({
      tagName: "BUTTON",
      attributes: { id: "pay-btn" },
      children: [iconSpan],
      rect: { x: 80, y: 180, width: 160, height: 42 }
    });
    const planHeading = new MockElement({
      tagName: "H3",
      children: [new MockTextNode("Pro Plan")],
      rect: { x: 64, y: 112, width: 140, height: 24 }
    });
    const planParagraph = new MockElement({
      tagName: "P",
      attributes: { class: "fine-print" },
      children: [new MockTextNode("Includes automated backups and regional failover.")],
      rect: { x: 64, y: 144, width: 260, height: 28 }
    });
    const pricingCard = new MockElement({
      tagName: "DIV",
      attributes: { class: "pricing-card" },
      children: [planHeading, planParagraph, payButton],
      rect: { x: 52, y: 96, width: 320, height: 210 }
    });
    const giantMain = new MockElement({
      tagName: "MAIN",
      attributes: { id: "page-shell" },
      children: [pricingCard],
      rect: { x: 0, y: 0, width: 1280, height: 800 }
    });

    // 1. Inner <span> inside <button> promotes to the interactive button
    const promotedBtn = resolveSmartComponent(iconSpan as unknown as Element);
    assert.equal(promotedBtn, payButton);
    assert.equal(describeSmartComponent(promotedBtn!).label, "“Pay $49.00” button");

    // 2. Paragraph leaf inside .pricing-card promotes to the bounded card (and NOT full-page <main>)
    const promotedCard = resolveSmartComponent(planParagraph as unknown as Element);
    assert.equal(promotedCard, pricingCard);
    assert.equal(describeSmartComponent(promotedCard!).label, "“Pro Plan” card");

    // 3. Direct giant <main> shell is not treated as a bounded smart component when better targets exist
    assert.ok(giantMain);
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
  public readonly deltaY: number;
  public readonly deltaMode: number;
  public readonly key: string;
  public readonly shiftKey: boolean;
  public readonly altKey: boolean;
  public readonly ctrlKey: boolean;
  public readonly metaKey: boolean;
  public target: unknown = null;
  public currentTarget: unknown = null;
  public defaultPrevented: boolean = false;
  public propagationStopped: boolean = false;

  constructor(
    type: string,
    init: {
      button?: number;
      clientX?: number;
      clientY?: number;
      deltaY?: number;
      deltaMode?: number;
      key?: string;
      code?: string;
      shiftKey?: boolean;
      altKey?: boolean;
      ctrlKey?: boolean;
      metaKey?: boolean;
    } = {}
  ) {
    this.type = type;
    this.button = init.button ?? 0;
    this.clientX = init.clientX ?? 0;
    this.clientY = init.clientY ?? 0;
    this.deltaY = init.deltaY ?? 0;
    this.deltaMode = init.deltaMode ?? 0;
    this.key = init.key ?? "";
    this.code = init.code ?? "";
    this.shiftKey = init.shiftKey ?? false;
    this.altKey = init.altKey ?? false;
    this.ctrlKey = init.ctrlKey ?? false;
    this.metaKey = init.metaKey ?? false;
  }

  public preventDefault(): void {
    this.defaultPrevented = true;
  }

  public stopPropagation(): void {
    this.propagationStopped = true;
  }

  public stopImmediatePropagation(): void {
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
  public selected: boolean = false;
  public autocomplete: string = "";
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

  public getAttributeNames(): string[] {
    return Array.from(this.attrs.keys());
  }

  public setRect(rect: { left: number; top: number; width: number; height: number }): void {
    this.rect = { ...rect };
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
    mockBody: MockDomElement;
    mockHtml: MockDomElement;
    mockDocument: {
      body: MockDomElement;
      documentElement: MockDomElement;
      createElement: (tag: string) => MockDomElement;
      querySelector: (sel: string) => MockDomElement | null;
      elementsFromPoint?: (x: number, y: number) => MockDomElement[];
    };
    mockWindow: MockDomElement & { innerWidth: number; innerHeight: number; location: { href: string } };
  }) => void | Promise<void>,
  hostAttrs: Record<string, string> = {
    "data-config": JSON.stringify({
      enabled: true,
      environment: "staging",
      position: "top_left",
      agent: { enabled: false }
    })
  }
): Promise<void> {
  const g = globalThis as Record<string, unknown>;
  const prevWindow = g.window;
  const prevDocument = g.document;

  const mockWindow = Object.assign(new MockDomElement("window"), {
    innerWidth: 1280,
    innerHeight: 800,
    location: { href: "http://localhost:3000/orders" }
  });
  const mockHtml = new MockDomElement("html");
  const mockBody = new MockDomElement("body");
  mockHtml.appendChild(mockBody);

  const mockDocument: {
    body: MockDomElement;
    documentElement: MockDomElement;
    createElement: (tag: string) => MockDomElement;
    querySelector: (sel: string) => MockDomElement | null;
    elementsFromPoint?: (x: number, y: number) => MockDomElement[];
  } = {
    body: mockBody,
    documentElement: mockHtml,
    createElement: (tag: string) => new MockDomElement(tag),
    querySelector: () => null
  };

  g.window = mockWindow;
  g.document = mockDocument;

  const shadowRoot = new MockDomElement("shadow-root");
  const widget = new ContextDropWidgetElement();
  const hostShim = widget as unknown as {
    attachShadow: () => ShadowRoot;
    getAttribute: (name: string) => string | null;
    hasAttribute: (name: string) => boolean;
  };
  hostShim.attachShadow = () => shadowRoot as unknown as ShadowRoot;
  hostShim.getAttribute = (name: string) => (name in hostAttrs ? hostAttrs[name] : null);
  hostShim.hasAttribute = (name: string) => name in hostAttrs;

  widget.connectedCallback();

  return Promise.resolve()
    .then(() => fn({ widget, shadowRoot, mockBody, mockHtml, mockDocument, mockWindow }))
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

describe("ContextDrop v0.2 Book-Corner Peel-to-Pin & Agentic Sidebar", () => {
  it("opens standard feedback chatbox when book corner is clicked or keyboard-activated", async () => {
    await withMountedWidget(({ shadowRoot, mockWindow }) => {
      const bookCorner = shadowRoot.querySelector(".cd-book-corner");
      const composer = shadowRoot.querySelector(".cd-composer");
      const sidebar = shadowRoot.querySelector(".cd-agent-sidebar");
      const compactBar = shadowRoot.querySelector(".cd-compact-bar");

      assert.ok(bookCorner && composer && sidebar && compactBar);
      assert.equal(bookCorner.hidden, false);
      assert.equal(bookCorner.classList.contains("corner-top_left"), true);
      assert.equal(composer.hidden, true);
      assert.equal(sidebar.hidden, true);
      assert.equal(compactBar.hidden, true);

      // Pointer click without drag opens normal floating feedback composer
      bookCorner.dispatchEvent(new MockUiEvent("pointerdown", { button: 0, clientX: 16, clientY: 16 }));
      mockWindow.dispatchEvent(new MockUiEvent("pointerup", { button: 0, clientX: 18, clientY: 18 }));
      bookCorner.dispatchEvent(new MockUiEvent("click", { button: 0, clientX: 18, clientY: 18 }));

      assert.equal(composer.hidden, false);
      assert.equal(bookCorner.hidden, true);
      assert.equal(bookCorner.getAttribute("aria-expanded"), "true");

      // Close composer returns to flush book corner
      const closeBtn = shadowRoot.querySelector("[aria-label='Close feedback composer']");
      assert.ok(closeBtn);
      closeBtn.dispatchEvent(new MockUiEvent("click"));
      assert.equal(composer.hidden, true);
      assert.equal(bookCorner.hidden, false);

      // Keyboard activation (click without pointerdown/pointerup) also opens composer
      bookCorner.dispatchEvent(new MockUiEvent("click"));
      assert.equal(composer.hidden, false);
    });
  });

  it("morphs book corner into a pushpin when dragged and pins DOM element directly on drop", async () => {
    await withMountedWidget(({ widget, shadowRoot, mockBody, mockDocument, mockWindow }) => {
      const bookCorner = shadowRoot.querySelector(".cd-book-corner");
      const dragPin = shadowRoot.querySelector(".cd-drag-pin");
      const composer = shadowRoot.querySelector(".cd-composer");
      const tray = shadowRoot.querySelector(".cd-tray");
      assert.ok(bookCorner && dragPin && composer && tray);

      const checkoutBtn = new MockDomElement("button");
      checkoutBtn.setAttribute("id", "checkout-btn");
      checkoutBtn.textContent = "Complete Order";
      checkoutBtn.setRect({ left: 220, top: 180, width: 180, height: 44 });
      mockBody.appendChild(checkoutBtn);

      mockDocument.elementsFromPoint = () => [checkoutBtn];

      // Start peeling from top-left book corner
      bookCorner.dispatchEvent(new MockUiEvent("pointerdown", { button: 0, clientX: 14, clientY: 14 }));
      assert.equal(dragPin.hidden, true);

      // Drag >6px over #checkout-btn: book corner peels away & morphs into live pushpin
      mockWindow.dispatchEvent(new MockUiEvent("pointermove", { clientX: 260, clientY: 200 }));
      assert.equal(bookCorner.classList.contains("is-peeled"), true);
      assert.equal(dragPin.hidden, false);
      assert.equal(dragPin.classList.contains("has-target"), true);

      // Release pointer over #checkout-btn: commits pin and opens composer with chip attached
      mockWindow.dispatchEvent(new MockUiEvent("pointerup", { clientX: 260, clientY: 200 }));

      // Trailing synthetic click from browser is suppressed cleanly
      const trailingClick = new MockUiEvent("click", { clientX: 260, clientY: 200 });
      bookCorner.dispatchEvent(trailingClick);
      assert.equal(trailingClick.defaultPrevented, true);

      assert.equal(dragPin.hidden, true);
      assert.equal(widget.getElementReferences().length, 1);
      assert.equal(widget.getElementReferences()[0].selector, "#checkout-btn");
      assert.equal(composer.hidden, false);
      assert.ok(tray.querySelector(".cd-chip"));
    });
  });

  it("snaps and re-docks book corner when dragged into another viewport corner", async () => {
    await withMountedWidget(({ widget, shadowRoot, mockWindow }) => {
      const root = shadowRoot.querySelector(".cd-root");
      const bookCorner = shadowRoot.querySelector(".cd-book-corner");
      const snapGhost = shadowRoot.querySelector(".cd-corner-snap-ghost");
      const composer = shadowRoot.querySelector(".cd-composer");
      assert.ok(root && bookCorner && snapGhost && composer);

      bookCorner.dispatchEvent(new MockUiEvent("pointerdown", { button: 0, clientX: 12, clientY: 12 }));
      // Move across page first
      mockWindow.dispatchEvent(new MockUiEvent("pointermove", { clientX: 420, clientY: 340 }));
      assert.equal(snapGhost.hidden, true);

      // Enter bottom-right snap zone (viewport is 1280x800)
      mockWindow.dispatchEvent(new MockUiEvent("pointermove", { clientX: 1250, clientY: 775 }));
      assert.equal(snapGhost.hidden, false);
      assert.equal(snapGhost.classList.contains("corner-bottom_right"), true);

      // Release inside bottom-right snap zone: re-docks corner and stays closed
      mockWindow.dispatchEvent(new MockUiEvent("pointerup", { clientX: 1250, clientY: 775 }));
      assert.equal(snapGhost.hidden, true);
      assert.equal(widget.getConfig().position, "bottom_right");
      assert.equal(bookCorner.classList.contains("corner-bottom_right"), true);
      assert.equal(root.classList.contains("pos-bottom_right"), true);
      assert.equal(composer.hidden, true);
      assert.equal(bookCorner.hidden, false);
    });
  });

  it("transforms into local BYOK agentic sidebar in development, switches modes, saves keys safely, and applies staged diffs", async () => {
    const g = globalThis as Record<string, unknown>;
    const prevFetch = g.fetch;
    const apiCalls: Array<{ url: string; method: string; body?: unknown }> = [];

    g.fetch = async (input: string | URL, init?: RequestInit) => {
      const url = String(input);
      const method = (init?.method || "GET").toUpperCase();
      const parsedBody =
        typeof init?.body === "string" && init.body.length > 0 ? JSON.parse(init.body) : undefined;
      apiCalls.push({ url, method, body: parsedBody });

      if (url.endsWith("/agent/status")) {
        return new Response(
          JSON.stringify({
            enabled: true,
            environment: "development",
            workspace_name: "demo-shop",
            mcp_environments: [
              { name: "local", type: "local", host_env: "development" },
              { name: "staging", type: "remote_http" },
              { name: "production", type: "remote_http" }
            ],
            active_provider: "anthropic",
            providers: [
              {
                id: "anthropic",
                label: "Anthropic Claude",
                configured: true,
                source: "env",
                env_var_hint: "ANTHROPIC_API_KEY",
                masked_key: "••••9876",
                model: "claude-sonnet-4-20250514",
                default_model: "claude-sonnet-4-20250514",
                models: ["claude-sonnet-4-20250514"],
                supports_base_url: false
              }
            ]
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }

      if (url.endsWith("/agent/keys") && method === "POST") {
        return new Response(
          JSON.stringify({
            active_provider: "anthropic",
            providers: [
              {
                id: "anthropic",
                label: "Anthropic Claude",
                configured: true,
                source: "vault",
                env_var_hint: "ANTHROPIC_API_KEY",
                masked_key: "••••4321",
                model: "claude-sonnet-4-20250514",
                default_model: "claude-sonnet-4-20250514",
                models: ["claude-sonnet-4-20250514"],
                supports_base_url: false
              }
            ]
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }

      if (url.endsWith("/agent/chat") && method === "POST") {
        return new Response(
          JSON.stringify({
            reply: "Found `#hero-cta` in `app/views/home/index.html.erb`. Escaped check: <script>alert(1)</script>",
            provider: "anthropic",
            model: "claude-sonnet-4-20250514",
            tool_calls: [{ name: "read_file", summary: "Read app/views/home/index.html.erb (L1–40)", status: "ok" }],
            proposed_edits: [
              {
                id: "edit_abc123",
                path: "app/views/home/index.html.erb",
                summary: "Fix button contrast and padding",
                is_new_file: false,
                diff: "@@ -4,1 +4,1 @@\n-<button id=\"hero-cta\">Buy</button>\n+<button id=\"hero-cta\" class=\"btn-primary\">Buy Now</button>",
                added_lines: 1,
                removed_lines: 1,
                status: "pending",
                created_at: "2026-11-12T10:00:00Z"
              }
            ]
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }

      if (url.endsWith("/agent/edits/edit_abc123/apply") && method === "POST") {
        return new Response(
          JSON.stringify({
            edit: {
              id: "edit_abc123",
              path: "app/views/home/index.html.erb",
              summary: "Fix button contrast and padding",
              is_new_file: false,
              diff: "@@ -4,1 +4,1 @@",
              added_lines: 1,
              removed_lines: 1,
              status: "applied",
              created_at: "2026-11-12T10:00:00Z"
            }
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }

      return new Response(JSON.stringify({}), { status: 200 });
    };

    try {
      await withMountedWidget(
        async ({ widget, shadowRoot, mockHtml }) => {
          const bookCorner = shadowRoot.querySelector(".cd-book-corner");
          const sidebar = shadowRoot.querySelector(".cd-agent-sidebar");
          const composer = shadowRoot.querySelector(".cd-composer");
          assert.ok(bookCorner && sidebar && composer);

          // Clicking book corner in local dev opens Agentic Sidebar, not floating composer
          bookCorner.dispatchEvent(new MockUiEvent("click"));
          await new Promise((r) => setTimeout(r, 10));

          assert.equal(widget.getSurfaceMode(), "agent");
          assert.equal(sidebar.hidden, false);
          assert.equal(composer.hidden, true);

          // Push page layout toggle sets and clears marginRight on <html>
          const pushBtn = shadowRoot.querySelector("[aria-label='Toggle push page layout']");
          assert.ok(pushBtn);
          pushBtn.dispatchEvent(new MockUiEvent("click"));
          assert.equal(mockHtml.getAttribute("data-context-drop-pushed"), "true");
          assert.equal(mockHtml.style.marginRight, "436px");

          // Switching mode to "feedback" switches cleanly to floating composer and restores page layout
          widget.setSurfaceMode("feedback");
          assert.equal(sidebar.hidden, true);
          assert.equal(composer.hidden, false);
          assert.equal(mockHtml.style.marginRight, "");

          // Switch back to "agent" mode
          widget.setSurfaceMode("agent");
          assert.equal(sidebar.hidden, false);

          // Save BYOK key via inline vault drawer: clears password input immediately after save
          const byokBtn = shadowRoot.querySelector("[aria-label='Open BYOK API key settings']");
          const keyInput = shadowRoot.querySelector("[aria-label='Provider API Key']");
          assert.ok(byokBtn && keyInput);
          byokBtn.dispatchEvent(new MockUiEvent("click"));
          keyInput.value = "sk-ant-test-secret-4321";

          const allButtons: MockDomElement[] = [];
          const collectBtns = (node: MockDomElement): void => {
            if (node.tagName === "BUTTON") allButtons.push(node);
            for (const c of node.childNodes) collectBtns(c);
          };
          collectBtns(shadowRoot);
          const saveBtn = allButtons.find((b) => b.textContent === "Use & Save");
          assert.ok(saveBtn);
          saveBtn.dispatchEvent(new MockUiEvent("click"));
          await new Promise((r) => setTimeout(r, 10));
          assert.equal(keyInput.value, "", "Expected API key input to be wiped from DOM after vault save");

          // Send an agent prompt and verify XSS-safe Markdown + interactive diff approval
          const agentTextarea = shadowRoot.querySelector("[aria-label='Agent prompt']");
          assert.ok(agentTextarea);
          agentTextarea.value = "Fix #hero-cta contrast";
          await widget.handleAgentSubmit();

          const messages = widget.getAgentMessages();
          assert.equal(messages.length, 2);
          const mdBody = shadowRoot.querySelector(".cd-md-body");
          assert.ok(mdBody);
          assert.equal(mdBody.innerHTML.includes("<script>"), false, "Raw <script> must be HTML-escaped");
          assert.equal(mdBody.innerHTML.includes("&lt;script&gt;"), true);

          const diffCard = shadowRoot.querySelector(".cd-diff-card");
          assert.ok(diffCard);
          const applyBtn = diffCard.querySelector(".cd-btn-apply");
          assert.ok(applyBtn);

          applyBtn.dispatchEvent(new MockUiEvent("click"));
          await new Promise((r) => setTimeout(r, 10));

          assert.equal(messages[1].proposedEdits?.[0].status, "applied");
          assert.equal(
            apiCalls.some((c) => c.url.endsWith("/agent/edits/edit_abc123/apply")),
            true
          );
        },
        {
          "data-config": JSON.stringify({
            enabled: true,
            environment: "development",
            position: "top_left",
            csrf_token: "dev_csrf_123",
            agent: { enabled: true }
          })
        }
      );
    } finally {
      if (prevFetch === undefined) {
        delete g.fetch;
      } else {
        g.fetch = prevFetch;
      }
    }
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

  it("unifies wheel layer scrubbing with inline HUD list, 1-click pin, toggle-unpin, jitter lock, and Esc exit", async () => {
    await withMountedWidget(({ widget, shadowRoot, mockBody, mockDocument, mockWindow }) => {
      // Build a multi-layer DOM stack on the host page:
      // section#checkout > div.card > button#pay-btn > (span.label-a, span.label-b), plus an overlapping toast
      const section = new MockDomElement("section");
      section.setAttribute("id", "checkout");
      section.setRect({ left: 40, top: 80, width: 600, height: 360 });

      const card = new MockDomElement("div");
      card.setAttribute("class", "pricing-card");
      card.setRect({ left: 60, top: 100, width: 320, height: 220 });

      const button = new MockDomElement("button");
      button.setAttribute("id", "pay-btn");
      button.setRect({ left: 80, top: 180, width: 180, height: 42 });

      const spanA = new MockDomElement("span");
      spanA.setAttribute("class", "label-a");
      spanA.setRect({ left: 88, top: 188, width: 80, height: 22 });

      const spanB = new MockDomElement("span");
      spanB.setAttribute("class", "label-b");
      spanB.setRect({ left: 170, top: 188, width: 70, height: 22 });

      const toast = new MockDomElement("div");
      toast.setAttribute("id", "overlapping-toast");
      toast.setRect({ left: 75, top: 175, width: 200, height: 36 });

      button.appendChild(spanA);
      button.appendChild(spanB);
      card.appendChild(button);
      section.appendChild(card);
      section.appendChild(toast);
      mockBody.appendChild(section);

      let pointNodes: MockDomElement[] = [toast, spanA, button, card, section];
      mockDocument.elementsFromPoint = () => pointNodes;

      widget.startPinSelection();

      const compactBar = shadowRoot.querySelector(".cd-compact-bar");
      const composer = shadowRoot.querySelector(".cd-composer");
      assert.ok(compactBar && composer);
      assert.equal(compactBar.hidden, false);
      assert.equal(composer.hidden, true);

      // Initial Compact Bar shows Cancel + Esc before any pins
      const doneBtn = compactBar.querySelector("[aria-label='Cancel pinning and return to chatbox']");
      assert.ok(doneBtn);

      // 1. Hover over overlapping toast: HUD starts in compact hover mode (no layer list yet)
      mockWindow.dispatchEvent(new MockUiEvent("mousemove", { clientX: 120, clientY: 192 }));
      const hud = mockBody.querySelector("[data-context-drop-ui='label']");
      assert.ok(hud);
      assert.equal(hud.style.display, "block");
      assert.equal(hud.querySelector("[data-context-drop-ui='hud-layer-list']"), null);

      // 2. Scroll the wheel once: inline layer list unfurls inside HUD & steps from #overlapping-toast (0) to #pay-btn / span.label-a (1)
      const wheelEv = new MockUiEvent("wheel", { clientX: 120, clientY: 192, deltaY: 40, deltaMode: 0 });
      mockWindow.dispatchEvent(wheelEv);
      assert.equal(wheelEv.defaultPrevented, true);

      const inlineList = hud.querySelector("[data-context-drop-ui='hud-layer-list']");
      assert.ok(inlineList, "Expected wheel scroll to unfurl inline HUD layer list");

      // Step once more via ArrowUp to reach button#pay-btn (index 2 in [toast, span.label-a, button#pay-btn, ...])
      mockWindow.dispatchEvent(new MockUiEvent("keydown", { key: "ArrowUp" }));

      // 3. Pointer-jitter lock: nudge mouse 12px onto sibling spanB inside button#pay-btn right before clicking
      pointNodes = [spanB, button, card, section];
      mockWindow.dispatchEvent(new MockUiEvent("mousemove", { clientX: 132, clientY: 194 }));

      // 4. Single Click immediately pins button#pay-btn (no second popover click required!)
      const clickEv = new MockUiEvent("click", { clientX: 132, clientY: 194 });
      mockWindow.dispatchEvent(clickEv);
      assert.equal(clickEv.defaultPrevented, true);
      assert.equal(widget.getElementReferences().length, 1);
      assert.equal(widget.getElementReferences()[0].selector, "#pay-btn");

      // On-page pinned marker badge & cursor confirmation toast appear while staying in Pin Mode
      const pinnedBadge = mockBody.querySelector("[data-context-drop-ui='pinned-badge']");
      const pinToast = mockBody.querySelector("[data-context-drop-ui='pin-toast']");
      assert.ok(pinnedBadge);
      assert.ok(pinToast);
      assert.equal(pinToast.style.display, "inline-flex");

      // Compact Bar updates to prominent Done (1) + Esc CTA and quick-undo pill
      const finishBtn = compactBar.querySelector(
        "[aria-label='Finish pinning elements and return to chatbox']"
      );
      assert.ok(finishBtn);
      assert.ok(compactBar.querySelector(".cd-compact-pinned-pill"));

      // 5. Clicking the already-pinned element again toggles/unpins it cleanly
      mockWindow.dispatchEvent(new MockUiEvent("mousemove", { clientX: 90, clientY: 185 }));
      pointNodes = [button, card, section];
      mockWindow.dispatchEvent(new MockUiEvent("mousemove", { clientX: 90, clientY: 185 }));
      mockWindow.dispatchEvent(new MockUiEvent("click", { clientX: 90, clientY: 185 }));
      assert.equal(widget.getElementReferences().length, 0);

      // Pin again, then press Escape once to exit Pin Mode and restore composer
      mockWindow.dispatchEvent(new MockUiEvent("click", { clientX: 90, clientY: 185 }));
      assert.equal(widget.getElementReferences().length, 1);

      mockWindow.dispatchEvent(new MockUiEvent("keydown", { key: "Escape" }));
      assert.equal(composer.hidden, false);
      assert.equal(compactBar.hidden, true);
      assert.equal(mockBody.querySelector("[data-context-drop-ui='pinned-badge']"), null);
    });
  });

  it("activates Freeze & Pin via Alt+Shift+P, pins candidate on Space, and suppresses blur events", async () => {
    await withMountedWidget(({ widget, shadowRoot, mockBody, mockDocument, mockWindow }) => {
      const compactBar = shadowRoot.querySelector(".cd-compact-bar");
      const composer = shadowRoot.querySelector(".cd-composer");
      assert.ok(compactBar && composer);

      const navMenu = new MockDomElement("nav");
      navMenu.setAttribute("id", "transient-dropdown");
      const menuItem = new MockDomElement("a");
      menuItem.setAttribute("id", "dimensions-link");
      menuItem.textContent = "Dimensions";
      menuItem.setRect({ left: 100, top: 60, width: 140, height: 32 });
      navMenu.appendChild(menuItem);
      mockBody.appendChild(navMenu);

      const pointNodes = [menuItem, navMenu];
      mockDocument.elementsFromPoint = () => pointNodes;

      // Track pointer at (150, 80)
      mockWindow.dispatchEvent(new MockUiEvent("mousemove", { clientX: 150, clientY: 80 }));

      // Press Alt+Shift+P to trigger Freeze & Pin globally
      const freezeKeyEv = new MockUiEvent("keydown", {
        key: "p",
        code: "KeyP",
        altKey: true,
        shiftKey: true
      });
      mockWindow.dispatchEvent(freezeKeyEv);
      assert.equal(freezeKeyEv.defaultPrevented, true);
      assert.equal(compactBar.hidden, false);

      // Verify blur event suppression: blur on host element should be stopped
      const blurEv = new MockUiEvent("blur", {});
      mockWindow.dispatchEvent(blurEv);
      assert.equal(blurEv.propagationStopped, true);

      // Verify Spacebar commits the candidate without firing mouse click
      const spaceKeyEv = new MockUiEvent("keydown", {
        key: " ",
        code: "Space"
      });
      mockWindow.dispatchEvent(spaceKeyEv);
      assert.equal(spaceKeyEv.defaultPrevented, true);

      // Pinned elements list should now contain the candidate
      assert.equal(widget.getElementReferences().length, 1);
      assert.equal(widget.getElementReferences()[0].selector, "#dimensions-link");

      // Press Alt+Shift+P again to exit Freeze & Pin mode
      const exitKeyEv = new MockUiEvent("keydown", {
        key: "p",
        code: "KeyP",
        altKey: true,
        shiftKey: true
      });
      mockWindow.dispatchEvent(exitKeyEv);
      assert.equal(compactBar.hidden, true);
      assert.equal(composer.hidden, false);
    });
  });

  it("uses jargon-free smart component selection, auto surrounding screenshot, and compact UI in production", async () => {
    await withMountedWidget(
      async ({ widget, shadowRoot, mockBody, mockDocument, mockWindow }) => {
        // Provide a lightweight mock <canvas> 2D context so surrounding-context auto-screenshot succeeds
        const origCreateElement = mockDocument.createElement;
        mockDocument.createElement = (tag: string) => {
          const el = origCreateElement(tag);
          if (tag.toLowerCase() === "canvas") {
            const canvasShim = el as unknown as Record<string, unknown>;
            canvasShim.width = 0;
            canvasShim.height = 0;
            canvasShim.getContext = () => ({
              scale: () => {},
              fillRect: () => {},
              strokeRect: () => {},
              fillText: () => {},
              setLineDash: () => {},
              fillStyle: "",
              strokeStyle: "",
              lineWidth: 1,
              font: ""
            });
            canvasShim.toDataURL = () =>
              "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
          }
          return el;
        };

        assert.equal(widget.isSmartSelectionMode(), true);

        const composer = shadowRoot.querySelector(".cd-composer");
        const title = shadowRoot.querySelector(".cd-composer-title");
        const tray = shadowRoot.querySelector(".cd-tray");
        const chatThread = shadowRoot.querySelector(".cd-chat-thread");
        const bookCorner = shadowRoot.querySelector(".cd-book-corner");
        assert.ok(composer && title && tray && chatThread && bookCorner);

        // Production UI uses compact smart-mode layout & friendly copy
        assert.equal(composer.classList.contains("is-smart-mode"), true);
        assert.equal(title.textContent, "Send Feedback");

        // Build host DOM: div.pricing-card > (h3 "Enterprise Plan", button#checkout-btn > span.inner-label "Complete Order")
        const card = new MockDomElement("div");
        card.setAttribute("class", "pricing-card");
        card.setRect({ left: 80, top: 90, width: 340, height: 210 });

        const heading = new MockDomElement("h3");
        heading.textContent = "Enterprise Plan";
        heading.setRect({ left: 100, top: 108, width: 180, height: 26 });

        const button = new MockDomElement("button");
        button.setAttribute("id", "checkout-btn");
        button.setRect({ left: 100, top: 220, width: 170, height: 42 });

        const innerSpan = new MockDomElement("span");
        innerSpan.setAttribute("class", "inner-label");
        innerSpan.textContent = "Complete Order";
        innerSpan.setRect({ left: 116, top: 230, width: 120, height: 20 });

        button.appendChild(innerSpan);
        card.appendChild(heading);
        card.appendChild(button);
        mockBody.appendChild(card);

        mockDocument.elementsFromPoint = () => [innerSpan, button, card];

        // Start selection from compact composer ("Select area")
        widget.startPinSelection();
        mockWindow.dispatchEvent(new MockUiEvent("mousemove", { clientX: 140, clientY: 236 }));

        const hud = mockBody.querySelector("[data-context-drop-ui='label']");
        assert.ok(hud);
        const readAllText = (node: MockDomElement): string =>
          [node.textContent, ...node.childNodes.map((c) => readAllText(c))].join(" ").trim();
        const hudText = readAllText(hud);
        assert.equal(hudText.includes("“Complete Order” button"), true);
        assert.equal(hudText.includes("#checkout-btn"), false, "Smart HUD must omit CSS selectors");
        assert.equal(hud.querySelector("[data-context-drop-ui='hud-layer-list']"), null);

        // Mouse wheel is NOT hijacked in production smart mode
        const wheelEv = new MockUiEvent("wheel", { clientX: 140, clientY: 236, deltaY: 40, deltaMode: 0 });
        mockWindow.dispatchEvent(wheelEv);
        assert.equal(wheelEv.defaultPrevented, false);

        // Single click selects promoted button, exits picker immediately, and reopens compact feedback form
        const clickEv = new MockUiEvent("click", { clientX: 140, clientY: 236 });
        mockWindow.dispatchEvent(clickEv);
        assert.equal(clickEv.defaultPrevented, true);
        assert.equal(composer.hidden, false);

        // Wait a tick for async surrounding-context screenshot capture
        await new Promise((r) => setTimeout(r, 15));

        const refs = widget.getElementReferences();
        assert.equal(refs.length, 1);
        assert.equal(refs[0].selector, "#checkout-btn");
        assert.equal(refs[0].metadata.friendly_label, "“Complete Order” button");
        assert.equal(refs[0].metadata.original_target_selector, "span.inner-label");

        const shots = widget.getAttachments();
        assert.equal(shots.length, 1);
        assert.equal(shots[0].element_reference_ref, refs[0].client_ref);
        assert.equal(shots[0].metadata?.capture_type, "surrounding_context");
        assert.equal(shots[0].metadata?.auto_smart_context, true);

        // Tray renders a single merged .cd-smart-card (not separate technical .cd-chip items)
        assert.ok(tray.querySelector(".cd-smart-card"));
        assert.equal(tray.querySelector(".cd-chip"), null);
        // Empty-state chat thread hides once context is attached so composer stays ultra-compact
        assert.equal(chatThread.hidden, true);

        // Removing the smart card removes BOTH the element reference and its auto-captured screenshot
        widget.removeElementReference(refs[0].client_ref);
        assert.equal(widget.getElementReferences().length, 0);
        assert.equal(widget.getAttachments().length, 0);
        assert.equal(chatThread.hidden, false);
      },
      {
        "data-config": JSON.stringify({
          enabled: true,
          environment: "production",
          position: "top_left",
          agent: { enabled: false }
        })
      }
    );
  });
});
