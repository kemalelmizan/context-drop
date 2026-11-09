import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  captureElementSnapshot,
  computeDomPath,
  computeSelector,
  extractSanitizedAttributes,
  extractSanitizedText,
  isElementExcluded
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
});
