# frozen_string_literal: true

require_relative "../spec_helper"
require_relative "../dummy/config/environment"

RSpec.describe "ContextDrop Assistant Security" do
  before do
    ContextDrop.reset_configuration!
    ContextDrop.configure do |c|
      c.enabled = true
      c.assistant_enabled = true
      c.environment = "development"
    end
  end

  it "rejects Ask tools with git_ prefix at registration" do
    expect do
      ContextDrop.config.register_ask_tool(
        name: "git_apply_patches",
        description: "nope",
        parameters: { type: "object", properties: {} }
      ) { {} }
    end.to raise_error(ContextDrop::Error)
  end

  it "does not expose build write tools to the LLM tool list without approval" do
    registry = ContextDrop::Assistant::ToolRegistry.new
    names = registry.tools_for_mode("build", allow_write: false).map { |t| t[:name] }
    expect(names).not_to include("git_push_branch")
    expect(names).not_to include("pull_request_open")
  end

  it "uses friendly DOM disclosure labels in smart selection mode for LLM context" do
    ContextDrop.configure { |c| c.selection_mode = :smart }
    text = ContextDrop::Assistant::DomContextFormatter.format(
      "https://example.com",
      [
        {
          tag_name: "button",
          selector: "#secret-btn",
          metadata: { friendly_label: "Complete Order button" }
        }
      ],
      disclosure: :friendly
    )
    expect(text).to include("Complete Order button")
    expect(text).not_to include("#secret-btn")
  end

  it "rejects feedback confirmation without a valid ownership token" do
    fb = ContextDrop::Feedback.create!(message: "Hi", page_url: "https://example.com", status: "new")
    orchestrator = ContextDrop::Assistant::Orchestrator.new
    expect do
      orchestrator.run_turn(
        mode: "feedback",
        messages: [{ role: "user", content: "status?" }],
        feedback_id: fb.id,
        ownership_token: "invalid.token.sig"
      )
    end.to_raise_error(ContextDrop::Error, "Forbidden")
  end

  it "omits raw selectors from smart confirmation metadata pins_summary" do
    ContextDrop.configure { |c| c.selection_mode = :smart }
    fb = ContextDrop::Feedback.create!(message: "x", page_url: "https://example.com", status: "new")
    el = fb.element_references.create!(
      client_ref: "c1",
      tag_name: "button",
      selector: "#checkout",
      dom_path: "body > button",
      text_content: "Pay",
      attributes_snapshot: {},
      bounding_rect: { "x" => 0, "y" => 0, "width" => 1, "height" => 1 },
      viewport: { "width" => 100, "height" => 100 },
      metadata: { "friendly_label" => "Pay button" },
      captured_at: Time.current
    )
    fb.reload
    conf = ContextDrop::Assistant::FeedbackConfirmation.render_for_feedback(fb, smart: true)
    expect(conf[:metadata][:pins_summary]).to include("Pay button")
    expect(conf[:message]).not_to include("#checkout")
  end
end