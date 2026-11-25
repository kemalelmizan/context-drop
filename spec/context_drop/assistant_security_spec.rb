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

  describe "Secret-logging guard & post-iteration security audit fixes (SEC-H069, SEC-H033, SEC-H013, SEC-H038, SEC-H027)" do
    let(:app) { Rails.application }

    it "registers ContextDrop secret keys in Rails filter_parameters and scrubs secrets from error strings" do
      param_filter = ActiveSupport::ParameterFilter.new(Rails.application.config.filter_parameters)
      filtered_hash = param_filter.filter(
        "api_key" => "sk-ant-123",
        "signing_secret" => "whsec_123",
        "ownership_token" => "42.nonce.sig",
        "approval_token" => "raw_approve_tok",
        "message" => "visible text"
      )
      expect(filtered_hash["api_key"]).to eq("[FILTERED]")
      expect(filtered_hash["signing_secret"]).to eq("[FILTERED]")
      expect(filtered_hash["ownership_token"]).to eq("[FILTERED]")
      expect(filtered_hash["approval_token"]).to eq("[FILTERED]")
      expect(filtered_hash["message"]).to eq("visible text")

      ContextDrop.configure { |c| c.mcp_api_key = "mcp_live_secret_token_9999" }
      raw_err = "Upstream failed: Authorization: Bearer eyJhbGciOiJIUzI1NiJ9 key=sk-ant-api03-1234567890abcdef whsec_9876543210 url=https://a.example/x?ownership_token=42.ab.cd mcp=mcp_live_secret_token_9999"
      scrubbed = ContextDrop::SecretRedactor.scrub(raw_err)
      expect(scrubbed).not_to include("eyJhbGciOiJIUzI1NiJ9")
      expect(scrubbed).not_to include("sk-ant-api03-1234567890abcdef")
      expect(scrubbed).not_to include("whsec_9876543210")
      expect(scrubbed).not_to include("42.ab.cd")
      expect(scrubbed).not_to include("mcp_live_secret_token_9999")
      expect(scrubbed).to include("[FILTERED]")

      if ContextDrop::NotificationDestination.connection.data_source_exists?("context_drop_notification_destinations")
        dest = ContextDrop::NotificationDestination.create!(
          name: "Scrubbed Hook",
          destination_type: "webhook",
          enabled: true,
          event_types: ["feedback.created"],
          settings: { "url" => "https://hooks.example.com/cd" },
          secrets: { "signing_secret" => "whsec_custom_signing_secret_123" }
        )
        dest.record_delivery!(status: "failed", error: "Echoed whsec_custom_signing_secret_123 and Bearer secret_bearer_tok_123")
        expect(dest.reload.last_delivery_error).not_to include("whsec_custom_signing_secret_123")
        expect(dest.last_delivery_error).not_to include("secret_bearer_tok_123")
      end
    end

    it "enforces 0600 permissions on fallback notification.key, sanitizes WidgetHelper metadata, blocks metadata-IP MCP URLs, and sets Referrer-Policy on attachments" do
      # 1. NotificationSecrets fallback file mode 0600
      key_path = ContextDrop::NotificationSecrets.send(:resolved_master_key_path)
      File.delete(key_path) if File.exist?(key_path)
      ContextDrop.configure { |c| c.ownership_secret = nil }
      encrypted = ContextDrop::NotificationSecrets.encrypt({ "signing_secret" => "s1" })
      expect(ContextDrop::NotificationSecrets.decrypt(encrypted)["signing_secret"]).to eq("s1")
      expect(File.stat(key_path).mode & 0o777).to eq(0o600)

      # 2. WidgetHelper strips forbidden secret keys from data-metadata HTML attribute
      view_cls = Class.new do
        include ContextDrop::WidgetHelper
      end
      html = view_cls.new.context_drop_widget(
        metadata: { "plan" => "enterprise", "token" => "leak_tok_123", "password" => "hunter2" }
      )
      expect(html).to include("enterprise")
      expect(html).not_to include("leak_tok_123")
      expect(html).not_to include("hunter2")

      # 3. MCP::RemoteClient blocks private/metadata IPs and ignores allow_insecure_http in production
      expect do
        ContextDrop::MCP::RemoteClient.validate_endpoint_uri!("aws_meta", "https://169.254.169.254/mcp")
      end.to raise_error(ContextDrop::MCP::RemoteClient::RemoteError)

      ContextDrop.configure { |c| c.environment = "production" }
      expect do
        ContextDrop::MCP::RemoteClient.validate_endpoint_uri!(
          "staging",
          "http://staging.example.com/mcp",
          allow_insecure_http: true
        )
      end.to raise_error(ContextDrop::MCP::RemoteClient::RemoteError)

      # 4. Attachment download response includes Referrer-Policy: no-referrer & X-Content-Type-Options: nosniff
      ContextDrop.configure do |c|
        c.environment = "development"
        c.ownership_secret = "test-attachment-headers-secret-key-012345"
      end
      png_b64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
      sess = ActionDispatch::Integration::Session.new(app)
      sess.default_url_options[:host] = "localhost"
      sess.get "/context_drop/config", headers: { "HTTP_HOST" => "localhost", "HTTP_ACCEPT" => "application/json" }
      csrf = JSON.parse(sess.response.body)["csrf_token"]

      sess.post "/context_drop/feedback",
                params: {
                  feedback: {
                    message: "Header check",
                    page_url: "http://localhost/app",
                    attachments: [{ attachment_type: "screenshot", filename: "a.png", data_url: "data:image/png;base64,#{png_b64}" }]
                  }
                }.to_json,
                headers: {
                  "HTTP_HOST" => "localhost",
                  "CONTENT_TYPE" => "application/json",
                  "HTTP_ACCEPT" => "application/json",
                  "HTTP_X_CSRF_TOKEN" => csrf
                }
      expect(sess.response.status).to eq(201)
      created = JSON.parse(sess.response.body)
      att_id = created.dig("feedback", "attachments", 0, "id")
      tok = created["ownership_token"]

      sess.get "/context_drop/feedback/#{created['id']}/attachments/#{att_id}?ownership_token=#{CGI.escape(tok)}",
               headers: { "HTTP_HOST" => "localhost" }
      expect(sess.response.status).to eq(200)
      expect(sess.response.headers["Referrer-Policy"]).to eq("no-referrer")
      expect(sess.response.headers["X-Content-Type-Options"]).to eq("nosniff")
    end
  end
end