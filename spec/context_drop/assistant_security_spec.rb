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

  describe "ChangeSet ACL hardening (SEC-A007)" do
    let(:app) { Rails.application }

    build_session = lambda do |rack_app|
      ActionDispatch::Integration::Session.new(rack_app).tap do |s|
        s.default_url_options[:host] = "localhost"
      end
    end

    fetch_csrf = lambda do |sess|
      sess.get "/context_drop/config", headers: { "HTTP_HOST" => "localhost", "HTTP_ACCEPT" => "application/json" }
      JSON.parse(sess.response.body)["csrf_token"]
    end

    after do
      ContextDrop::Agent::LlmClient.transport = nil
      ENV.delete("ANTHROPIC_API_KEY")
    end

    it "hashes session_id on ChangeSets and blocks cross-session GET and turn change_set_id hijacking" do
      ENV["ANTHROPIC_API_KEY"] = "sk-ant-test-changeset"
      ContextDrop.configure do |c|
        c.environment = "development"
        c.rate_limit = { max_requests: 100, period: 3600 }
        c.authorize_assistant_mode = ->(_controller, _mode) { true }
      end

      step_count = 0
      ContextDrop::Agent::LlmClient.transport = lambda do |**|
        step_count += 1
        if step_count == 1
          {
            text: "",
            tool_calls: [
              {
                id: "call_1",
                name: "propose_change_set",
                arguments: { "summary" => "Fix checkout copy", "patches" => [] }
              }
            ],
            raw_assistant: []
          }
        else
          { text: "Proposed draft.", tool_calls: [], raw_assistant: [] }
        end
      end

      sess_a = build_session.call(app)
      csrf_a = fetch_csrf.call(sess_a)
      sess_a.post "/context_drop/assistant/turn",
                  params: {
                    mode: "build",
                    page_url: "http://localhost/checkout",
                    messages: [{ role: "user", content: "Update button text" }]
                  }.to_json,
                  headers: {
                    "HTTP_HOST" => "localhost",
                    "CONTENT_TYPE" => "application/json",
                    "HTTP_ACCEPT" => "application/json",
                    "HTTP_X_CSRF_TOKEN" => csrf_a
                  }

      expect(sess_a.response.status).to eq(200)
      created_cs = JSON.parse(sess_a.response.body)["change_set"]
      cs_record = ContextDrop::ChangeSet.find(created_cs["id"])
      expect(cs_record.session_id.length).to eq(32)
      expect(cs_record.session_id).not_to eq("127.0.0.1")

      # Owner session A can read its own ChangeSet
      sess_a.get "/context_drop/assistant/change_sets/#{cs_record.id}",
                 headers: { "HTTP_HOST" => "localhost", "HTTP_ACCEPT" => "application/json" }
      expect(sess_a.response.status).to eq(200)

      # Stranger session B gets 403 on GET and on POST /assistant/turn with change_set_id
      sess_b = build_session.call(app)
      csrf_b = fetch_csrf.call(sess_b)
      sess_b.get "/context_drop/assistant/change_sets/#{cs_record.id}",
                 headers: { "HTTP_HOST" => "localhost", "HTTP_ACCEPT" => "application/json" }
      expect(sess_b.response.status).to eq(403)

      sess_b.post "/context_drop/assistant/turn",
                  params: {
                    mode: "build",
                    change_set_id: cs_record.id,
                    page_url: "http://localhost/checkout",
                    messages: [{ role: "user", content: "Overwrite patches" }]
                  }.to_json,
                  headers: {
                    "HTTP_HOST" => "localhost",
                    "CONTENT_TYPE" => "application/json",
                    "HTTP_ACCEPT" => "application/json",
                    "HTTP_X_CSRF_TOKEN" => csrf_b
                  }
      expect(sess_b.response.status).to eq(403)
    end

    it "prevents session_id fallback when a ChangeSet is attributed to a submitter and requires submitter on staging" do
      FakeStaffActor = Struct.new(:id) unless defined?(FakeStaffActor)
      active_actor = FakeStaffActor.new(1)

      ENV["ANTHROPIC_API_KEY"] = "sk-ant-test-staging"
      ContextDrop.configure do |c|
        c.environment = "staging"
        c.assistant_modes_by_environment = { staging: %w[ask build feedback] }
        c.rate_limit = { max_requests: 100, period: 3600 }
        c.current_submitter = ->(_controller) { active_actor }
        c.authorize_assistant_mode = ->(_controller, _mode) { true }
      end

      called = false
      ContextDrop::Agent::LlmClient.transport = lambda do |**|
        if !called
          called = true
          {
            text: "",
            tool_calls: [
              { id: "c1", name: "propose_change_set", arguments: { "summary" => "Staging patch", "patches" => [] } }
            ],
            raw_assistant: []
          }
        else
          { text: "Done", tool_calls: [], raw_assistant: [] }
        end
      end

      shared_sess = build_session.call(app)
      csrf = fetch_csrf.call(shared_sess)

      shared_sess.post "/context_drop/assistant/turn",
                       params: {
                         mode: "build",
                         page_url: "https://staging.example.com/app",
                         messages: [{ role: "user", content: "Create staging patch" }]
                       }.to_json,
                       headers: {
                         "HTTP_HOST" => "localhost",
                         "CONTENT_TYPE" => "application/json",
                         "HTTP_ACCEPT" => "application/json",
                         "HTTP_X_CSRF_TOKEN" => csrf
                       }
      expect(shared_sess.response.status).to eq(200)
      cs_id = JSON.parse(shared_sess.response.body).dig("change_set", "id")

      # Switching to Staff #2 on the EXACT SAME browser session cookie must return 403 (no session_id fallback)
      active_actor = FakeStaffActor.new(2)
      shared_sess.get "/context_drop/assistant/change_sets/#{cs_id}",
                      headers: { "HTTP_HOST" => "localhost", "HTTP_ACCEPT" => "application/json" }
      expect(shared_sess.response.status).to eq(403)

      # Unauthenticated caller on staging cannot propose an anonymous ChangeSet by default
      active_actor = nil
      called = false
      shared_sess.post "/context_drop/assistant/turn",
                       params: {
                         mode: "build",
                         page_url: "https://staging.example.com/app",
                         messages: [{ role: "user", content: "Anonymous build attempt" }]
                       }.to_json,
                       headers: {
                         "HTTP_HOST" => "localhost",
                         "CONTENT_TYPE" => "application/json",
                         "HTTP_ACCEPT" => "application/json",
                         "HTTP_X_CSRF_TOKEN" => csrf
                       }
      expect(shared_sess.response.status).to eq(403)
    end
  end
end