# frozen_string_literal: true

require_relative "../spec_helper"

RSpec.describe "ContextDrop::MetadataSanitizer" do
  it "sanitizes ElementReference attributes and strips value, outerHTML, and event handlers" do
    raw = {
      client_ref: "el_1",
      tag_name: "BUTTON",
      selector: "#checkout-button",
      dom_path: "html > body > main > button#checkout-button",
      text_content: "   Complete   Order  \n ",
      attributes_snapshot: {
        "id" => "checkout-button",
        "class" => "btn btn-primary",
        "data-testid" => "submit-order",
        "aria-label" => "Complete order",
        "aria-hidden" => "false",
        "value" => "s3cret_value_never_capture",
        "outerHTML" => "<button>raw</button>",
        "onclick" => "stealSecrets()",
        "href" => "javascript:alert(1)"
      },
      bounding_rect: { "x" => "120.556", "y" => 340, "width" => 180.2, "height" => 44 },
      viewport: { "width" => 1440, "height" => 900 }
    }

    sanitized = ContextDrop::MetadataSanitizer.sanitize_element_reference(raw)
    expect(sanitized[:tag_name]).to eq("button")
    expect(sanitized[:selector]).to eq("#checkout-button")
    expect(sanitized[:text_content]).to eq("Complete Order")
    expect(sanitized[:attributes_snapshot]["id"]).to eq("checkout-button")
    expect(sanitized[:attributes_snapshot]["data-testid"]).to eq("submit-order")
    expect(sanitized[:attributes_snapshot]["aria-label"]).to eq("Complete order")
    expect(sanitized[:attributes_snapshot].key?("value")).to eq(false)
    expect(sanitized[:attributes_snapshot].key?("outerhtml")).to eq(false)
    expect(sanitized[:attributes_snapshot].key?("onclick")).to eq(false)
    expect(sanitized[:attributes_snapshot].key?("href")).to eq(false)
    expect(sanitized[:bounding_rect]).to eq({ "x" => 120.56, "y" => 340.0, "width" => 180.2, "height" => 44.0 })
    expect(sanitized[:viewport]).to eq({ "width" => 1440, "height" => 900 })
  end

  it "rejects sensitive password inputs, hidden inputs, cc-* inputs, and data-feedback-ignore elements" do
    expect do
      ContextDrop::MetadataSanitizer.sanitize_element_reference(
        tag_name: "input",
        selector: "#user_password",
        attributes_snapshot: { "type" => "password" },
        bounding_rect: { x: 0, y: 0, width: 100, height: 30 }
      )
    end.to raise_error(ContextDrop::MetadataSanitizer::SensitiveElementError)

    expect do
      ContextDrop::MetadataSanitizer.sanitize_element_reference(
        tag_name: "div",
        selector: "#ssn-box",
        attributes_snapshot: { "data-feedback-ignore" => "true" },
        bounding_rect: { x: 0, y: 0, width: 100, height: 30 }
      )
    end.to raise_error(ContextDrop::MetadataSanitizer::SensitiveElementError)
  end

  it "strips forbidden keys from feedback and attachment metadata" do
    cleaned = ContextDrop::MetadataSanitizer.sanitize_feedback_metadata(
      "viewport" => { "width" => 1280, "height" => 800 },
      "outerHTML" => "<html>secret</html>",
      "password" => "hunter2",
      "token" => "bearer_xyz"
    )
    expect(cleaned.key?("viewport")).to eq(true)
    expect(cleaned.key?("outerHTML")).to eq(false)
    expect(cleaned.key?("password")).to eq(false)
    expect(cleaned.key?("token")).to eq(false)
  end
end
