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
});
