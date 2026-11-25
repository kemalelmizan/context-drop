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

  describe "POST /context_drop/assistant/turn multimodal attachments" do
    let(:app) { Rails.application }
    let(:valid_png_b64) do
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
    end

    after do
      ContextDrop::Agent::LlmClient.transport = nil
      ENV.delete("ANTHROPIC_API_KEY")
    end

    it "validates and forwards data_url and signed_blob_id attachments to LlmClient and rejects disguised uploads" do
      ENV["ANTHROPIC_API_KEY"] = "sk-ant-test-multimodal"
      captured_conversations = []
      ContextDrop::Agent::LlmClient.transport = lambda do |conversation:, **|
        captured_conversations << conversation
        { text: "Inspected attached screenshot.", tool_calls: [], raw_assistant: [] }
      end

      sess = ActionDispatch::Integration::Session.new(app)
      sess.default_url_options[:host] = "localhost"
      sess.get "/context_drop/config", headers: { "HTTP_HOST" => "localhost", "HTTP_ACCEPT" => "application/json" }
      csrf = JSON.parse(sess.response.body)["csrf_token"]

      png_bytes = Base64.strict_decode64(valid_png_b64)
      blob = ActiveStorage::Blob.create_and_upload!(
        io: StringIO.new(png_bytes),
        filename: "blob-shot.png",
        content_type: "image/png"
      )

      sess.post "/context_drop/assistant/turn",
                params: {
                  mode: "ask",
                  page_url: "http://localhost/checkout",
                  messages: [{ role: "user", content: "What does this screenshot show?" }],
                  attachments: [
                    {
                      attachment_type: "screenshot",
                      filename: "inline.png",
                      data_url: "data:image/png;base64,#{valid_png_b64}"
                    },
                    {
                      attachment_type: "image",
                      filename: "blob-shot.png",
                      signed_blob_id: blob.signed_id
                    }
                  ]
                }.to_json,
                headers: {
                  "HTTP_HOST" => "localhost",
                  "CONTENT_TYPE" => "application/json",
                  "HTTP_ACCEPT" => "application/json",
                  "HTTP_X_CSRF_TOKEN" => csrf
                }

      expect(sess.response.status).to eq(200)
      body = JSON.parse(sess.response.body)
      expect(body["reply"]).to eq("Inspected attached screenshot.")
      expect(captured_conversations.size).to eq(1)
      images = captured_conversations.first.last[:images]
      expect(images.size).to eq(2)
      expect(images.first[:mime_type]).to eq("image/png")
      expect(images.first[:data]).to eq(valid_png_b64)
      expect(images.last[:data]).to eq(valid_png_b64)

      # Disguised HTML bytes fail UploadValidator magic-byte check with 422 before LlmClient runs
      disguised_b64 = Base64.strict_encode64("<html><script>alert(1)</script></html>")
      sess.post "/context_drop/assistant/turn",
                params: {
                  mode: "ask",
                  page_url: "http://localhost/checkout",
                  messages: [{ role: "user", content: "Check bad file" }],
                  attachments: [
                    {
                      attachment_type: "image",
                      filename: "evil.png",
                      data_url: "data:image/png;base64,#{disguised_b64}"
                    }
                  ]
                }.to_json,
                headers: {
                  "HTTP_HOST" => "localhost",
                  "CONTENT_TYPE" => "application/json",
                  "HTTP_ACCEPT" => "application/json",
                  "HTTP_X_CSRF_TOKEN" => csrf
                }

      expect(sess.response.status).to eq(422)
      expect(captured_conversations.size).to eq(1)
    end
  end
end