# frozen_string_literal: true

require_relative "../spec_helper"
require_relative "../dummy/config/environment"

RSpec.describe "ContextDrop Assistant" do
  before do
    ContextDrop.reset_configuration!
    ContextDrop.configure do |c|
      c.enabled = true
      c.assistant_enabled = true
      c.assistant_modes_by_environment = { development: %w[ask build feedback], production: %w[ask feedback] }
    end
  end

  describe "configuration" do
    it "defaults production modes to ask and feedback only" do
      ContextDrop.configure { |c| c.environment = "production" }
      expect(ContextDrop.config.resolved_assistant_modes).to eq(%w[ask feedback])
      expect(ContextDrop.config.build_enabled?).to eq(false)
    end

    it "includes build on development" do
      ContextDrop.configure { |c| c.environment = "development" }
      expect(ContextDrop.config.resolved_assistant_modes).to include("build")
    end

    it "rejects forbidden Ask tool names" do
    expect do
      ContextDrop.config.register_ask_tool(
        name: "git_push_branch",
        description: "bad",
        parameters: { type: "object", properties: {} }
      ) { {} }
    end.to_raise_error(ContextDrop::Error)
    end
  end

  describe ContextDrop::ChangeSet do
    it "creates with approval token digest" do
      record, raw = ContextDrop::ChangeSet.create_with_approval_token!(
        status: "draft",
        summary: "Test",
        metadata: { "patches" => [] }
      )
      expect(record.id).to be_truthy
      record.approve!(raw_token: raw)
      expect(record.reload.status).to eq("approved")
    end
  end

  describe ContextDrop::Assistant::FeedbackConfirmation do
    it "renders confirmation with metadata placeholders" do
      fb = ContextDrop::Feedback.create!(
        message: "Help",
        page_url: "https://example.com/checkout",
        status: "new"
      )
      conf = ContextDrop::Assistant::FeedbackConfirmation.render_for_feedback(fb, smart: true)
      expect(conf[:message]).to include("##{fb.id}")
      expect(conf[:metadata][:status]).to eq("new")
      expect(conf[:metadata][:page_url]).to include("checkout")
    end
  end

  describe ContextDrop::Assistant::ToolRegistry do
    it "excludes write build tools until approval" do
      registry = ContextDrop::Assistant::ToolRegistry.new
      names = registry.tools_for_mode("build", allow_write: false).map { |t| t[:name] }
      expect(names).to include("propose_change_set")
      expect(names).not_to include("git_push_branch")

      write_names = registry.tools_for_mode("build", allow_write: true).map { |t| t[:name] }
      expect(write_names).to include("git_push_branch")
    end
  end
end