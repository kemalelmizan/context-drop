# frozen_string_literal: true

require "tmpdir"
require_relative "../spec_helper"
require_relative "../dummy/config/environment"

RSpec.describe "ContextDrop::Agent (BYOK Vault, Workspace Sandbox & Security Wall)" do
  let(:app) { Rails.application }
  let(:session) do
    ActionDispatch::Integration::Session.new(app).tap do |s|
      s.default_url_options[:host] = "localhost"
    end
  end

  before do
    ContextDrop.reset_configuration!
    ContextDrop::Agent::WorkspaceSandbox.clear_staged_edits!
  end

  after do
    ContextDrop::Agent::LlmClient.transport = nil
    ContextDrop.reset_configuration!
    ContextDrop::Agent::WorkspaceSandbox.clear_staged_edits!
  end

  describe "ContextDrop::Agent::KeyStore" do
    it "encrypts BYOK keys on disk with AES-256-GCM and only exposes masked hints" do
      Dir.mktmpdir("cd_keystore_spec") do |dir|
        vault_file = File.join(dir, "byok.enc")
        store = ContextDrop::Agent::KeyStore.new(store_path: vault_file, env_vars: {})

        status = store.save_provider_config!(
          provider: "anthropic",
          api_key: "sk-ant-api03-super-secret-9876",
          model: "claude-sonnet-4-20250514"
        )

        expect(status[:active_provider]).to eq("anthropic")
        anth = status[:providers].find { |p| p[:id] == "anthropic" }
        expect(anth[:configured]).to eq(true)
        expect(anth[:source]).to eq("vault")
        expect(anth[:masked_key]).to eq("••••9876")

        # Raw file on disk must NOT contain plaintext secret
        raw_disk = File.read(vault_file)
        expect(raw_disk.include?("super-secret-9876")).to eq(false)
        expect(File.stat(vault_file).mode & 0o777).to eq(0o600)

        # Internal resolution decrypts cleanly
        creds = store.resolve_credentials!(provider: "anthropic")
        expect(creds[:api_key]).to eq("sk-ant-api03-super-secret-9876")

        # Clearing removes saved key
        cleared = store.clear_provider_key!(provider: "anthropic")
        anth_after = cleared[:providers].find { |p| p[:id] == "anthropic" }
        expect(anth_after[:configured]).to eq(false)
      end
    end

    it "auto-detects ENV provider keys when no vault entry is set" do
      Dir.mktmpdir("cd_keystore_env_spec") do |dir|
        store = ContextDrop::Agent::KeyStore.new(
          store_path: File.join(dir, "byok.enc"),
          env_vars: { "GEMINI_API_KEY" => "AIzaSyTestGeminiKey4321" }
        )

        status = store.providers_status
        expect(status[:active_provider]).to eq("gemini")
        gem_entry = status[:providers].find { |p| p[:id] == "gemini" }
        expect(gem_entry[:configured]).to eq(true)
        expect(gem_entry[:source]).to eq("env")
        expect(gem_entry[:masked_key]).to eq("••••4321")
      end
    end
  end

  describe "ContextDrop::Agent::WorkspaceSandbox" do
    it "blocks path traversal, symlinks escaping root, .git hooks, .env secrets, and Rails master keys" do
      Dir.mktmpdir("cd_workspace_spec") do |root|
        FileUtils.mkdir_p(File.join(root, "app/views/orders"))
        FileUtils.mkdir_p(File.join(root, "config"))
        FileUtils.mkdir_p(File.join(root, ".git/hooks"))
        File.write(File.join(root, "app/views/orders/show.html.erb"), "<button id=\"pay-btn\">Pay</button>\n")
        File.write(File.join(root, ".env"), "DATABASE_URL=postgres://secret\n")
        File.write(File.join(root, ".env.example"), "DATABASE_URL=postgres://localhost/dev\n")
        File.write(File.join(root, "config/master.key"), "deadbeef12345678\n")
        File.write(File.join(root, ".git/hooks/pre-commit"), "#!/bin/sh\n")

        sandbox = ContextDrop::Agent::WorkspaceSandbox.new(root)

        # Allowed normal files and .env.example
        read_res = sandbox.read_file(path: "app/views/orders/show.html.erb")
        expect(read_res[:content]).to include("pay-btn")
        expect(sandbox.read_file(path: ".env.example")[:content]).to include("localhost/dev")

        # Blocked traversal & protected files
        expect { sandbox.read_file(path: "../../etc/passwd") }.to raise_error(ContextDrop::Agent::WorkspaceSandbox::SandboxError, /escapes workspace/)
        expect { sandbox.read_file(path: ".env") }.to raise_error(ContextDrop::Agent::WorkspaceSandbox::SandboxError, /protected/)
        expect { sandbox.read_file(path: "config/master.key") }.to raise_error(ContextDrop::Agent::WorkspaceSandbox::SandboxError, /protected/)
        expect { sandbox.read_file(path: ".git/hooks/pre-commit") }.to raise_error(ContextDrop::Agent::WorkspaceSandbox::SandboxError, /protected/)

        # Symlink escape check
        Dir.mktmpdir("cd_outside_spec") do |outside|
          secret_outside = File.join(outside, "outside.txt")
          File.write(secret_outside, "top secret")
          File.symlink(secret_outside, File.join(root, "app/escaped_link.txt"))

          expect { sandbox.read_file(path: "app/escaped_link.txt") }.to raise_error(
            ContextDrop::Agent::WorkspaceSandbox::SandboxError,
            /escapes workspace/
          )
        end
      end
    end

    it "stages edits without writing to disk, enforces SHA-256 concurrency checks on apply, and supports revert" do
      Dir.mktmpdir("cd_edit_spec") do |root|
        target = File.join(root, "app/views/checkout.html.erb")
        FileUtils.mkdir_p(File.dirname(target))
        original = "<div class=\"card\">\n  <button id=\"pay-btn\" disabled>Pay Now</button>\n</div>\n"
        File.write(target, original)

        sandbox = ContextDrop::Agent::WorkspaceSandbox.new(root)
        staged = sandbox.stage_edit(
          path: "app/views/checkout.html.erb",
          old_string: "  <button id=\"pay-btn\" disabled>Pay Now</button>",
          new_string: "  <button id=\"pay-btn\" class=\"btn-primary\">Pay Now</button>",
          summary: "Enable checkout CTA button"
        )

        expect(staged[:status]).to eq("pending")
        expect(staged[:added_lines]).to eq(1)
        expect(staged[:removed_lines]).to eq(1)
        # Disk is still untouched before human approval
        expect(File.read(target)).to eq(original)

        applied = sandbox.apply_edit!(staged[:id])
        expect(applied[:status]).to eq("applied")
        expect(File.read(target)).to include("class=\"btn-primary\"")

        reverted = sandbox.revert_edit!(staged[:id])
        expect(reverted[:status]).to eq("reverted")
        expect(File.read(target)).to eq(original)
      end
    end
  end

  describe "ContextDrop::Agent::LlmClient SSRF defenses" do
    it "blocks metadata IP 169.254.169.254, private LAN IPs, and non-loopback HTTP URLs" do
      expect do
        ContextDrop::Agent::LlmClient.validate_custom_base_url!("http://169.254.169.254/latest/meta-data", resolve_dns: false)
      end.to raise_error(ContextDrop::Agent::LlmClient::LlmError)

      expect do
        ContextDrop::Agent::LlmClient.validate_custom_base_url!("https://169.254.169.254/v1", resolve_dns: false)
      end.to raise_error(ContextDrop::Agent::LlmClient::LlmError, /Blocked disallowed/)

      expect do
        ContextDrop::Agent::LlmClient.validate_custom_base_url!("https://192.168.1.10/v1", resolve_dns: false)
      end.to raise_error(ContextDrop::Agent::LlmClient::LlmError, /Blocked disallowed/)

      expect do
        ContextDrop::Agent::LlmClient.validate_custom_base_url!("http://openrouter.ai/api/v1", resolve_dns: false)
      end.to raise_error(ContextDrop::Agent::LlmClient::LlmError, /must use https/)

      # Allows local Ollama loopback HTTP and public HTTPS
      ollama_uri = ContextDrop::Agent::LlmClient.validate_custom_base_url!("http://127.0.0.1:11434/v1", resolve_dns: false)
      expect(ollama_uri.host).to eq("127.0.0.1")
    end
  end

  describe "ContextDrop::AgentController HTTP security wall & end-to-end orchestration" do
    it "returns 404 Not Found in production even if local_agent_enabled is set true" do
      ContextDrop.configure do |config|
        config.enabled = true
        config.environment = "production"
        config.local_agent_enabled = true
        config.authorize_dashboard = ->(_c) { true }
      end

      session.get "/context_drop/agent/status",
                  headers: { "HTTP_HOST" => "localhost", "REMOTE_ADDR" => "127.0.0.1" }
      expect(session.response.status).to eq(404)
    end

    it "returns 403 Forbidden for non-loopback IPs, X-Forwarded-For tunnels, DNS-rebinding Hosts, or cross-Origin posts" do
      ContextDrop.configure do |config|
        config.enabled = true
        config.environment = "development"
        config.local_agent_enabled = true
        config.authorize_dashboard = ->(_c) { true }
      end

      # Non-loopback LAN IP
      session.get "/context_drop/agent/status",
                  headers: { "HTTP_HOST" => "localhost", "REMOTE_ADDR" => "192.168.1.44" }
      expect(session.response.status).to eq(403)

      # Reverse proxy tunnel X-Forwarded-For
      session.get "/context_drop/agent/status",
                  headers: {
                    "HTTP_HOST" => "localhost",
                    "REMOTE_ADDR" => "127.0.0.1",
                    "HTTP_X_FORWARDED_FOR" => "203.0.113.50"
                  }
      expect(session.response.status).to eq(403)

      # DNS-rebinding Host header
      session.get "/context_drop/agent/status",
                  headers: { "HTTP_HOST" => "attacker-rebind.com", "REMOTE_ADDR" => "127.0.0.1" }
      expect(session.response.status).to eq(403)
    end

    it "runs local loopback agent chat, stages proposed edits safely, and applies on explicit approval" do
      Dir.mktmpdir("cd_controller_agent_spec") do |workspace|
        view_path = File.join(workspace, "app/views/demo.html.erb")
        FileUtils.mkdir_p(File.dirname(view_path))
        File.write(view_path, "<section id=\"hero\">\n  <button id=\"cta\">Old Label</button>\n</section>\n")

        ContextDrop.configure do |config|
          config.enabled = true
          config.environment = "development"
          config.local_agent_enabled = true
          config.local_agent_workspace_root = workspace
          config.local_agent_key_store_path = File.join(workspace, "tmp/context_drop_byok.enc")
          config.authorize_dashboard = ->(_c) { true }
        end

        # Acquire CSRF token from /config on loopback
        session.get "/context_drop/config",
                    headers: { "HTTP_HOST" => "localhost", "REMOTE_ADDR" => "127.0.0.1" }
        expect(session.response.status).to eq(200)
        cfg_json = JSON.parse(session.response.body)
        expect(cfg_json["environment"]).to eq("development")
        expect(cfg_json.dig("agent", "enabled")).to eq(true)
        csrf_token = cfg_json["csrf_token"]

        # Save BYOK key into encrypted server vault
        session.post "/context_drop/agent/keys",
                     params: { provider: "anthropic", api_key: "sk-ant-test-1234" }.to_json,
                     headers: {
                       "HTTP_HOST" => "localhost",
                       "REMOTE_ADDR" => "127.0.0.1",
                       "CONTENT_TYPE" => "application/json",
                       "HTTP_X_CSRF_TOKEN" => csrf_token
                     }
        expect(session.response.status).to eq(200)

        # Stub LLM two-step turn: step 1 calls propose_file_edit, step 2 summarizes
        call_count = 0
        ContextDrop::Agent::LlmClient.transport = lambda do |**_kwargs|
          call_count += 1
          if call_count == 1
            {
              text: "",
              tool_calls: [
                {
                  id: "call_1",
                  name: "propose_file_edit",
                  arguments: {
                    "path" => "app/views/demo.html.erb",
                    "old_string" => "  <button id=\"cta\">Old Label</button>",
                    "new_string" => "  <button id=\"cta\">Complete Checkout</button>",
                    "summary" => "Update CTA button copy"
                  }
                }
              ],
              raw_assistant: []
            }
          else
            {
              text: "I located `button#cta` in `app/views/demo.html.erb` and staged the label fix below.",
              tool_calls: [],
              raw_assistant: []
            }
          end
        end

        session.post "/context_drop/agent/chat",
                     params: {
                       messages: [{ role: "user", content: "Fix the pinned CTA button label" }],
                       page_url: "http://localhost:3000/demo",
                       element_references: [{ tag_name: "button", selector: "#cta", dom_path: "section#hero > button#cta" }]
                     }.to_json,
                     headers: {
                       "HTTP_HOST" => "localhost",
                       "REMOTE_ADDR" => "127.0.0.1",
                       "CONTENT_TYPE" => "application/json",
                       "HTTP_X_CSRF_TOKEN" => csrf_token
                     }

        expect(session.response.status).to eq(200)
        chat_res = JSON.parse(session.response.body)
        expect(chat_res["reply"]).to include("staged the label fix")
        expect(chat_res["proposed_edits"].size).to eq(1)
        edit_id = chat_res["proposed_edits"].first["id"]

        # File is still unmodified until user clicks Apply
        expect(File.read(view_path)).to include("Old Label")

        # User clicks Apply Change
        session.post "/context_drop/agent/edits/#{edit_id}/apply",
                     headers: {
                       "HTTP_HOST" => "localhost",
                       "REMOTE_ADDR" => "127.0.0.1",
                       "CONTENT_TYPE" => "application/json",
                       "HTTP_X_CSRF_TOKEN" => csrf_token
                     }
        expect(session.response.status).to eq(200)
        expect(File.read(view_path)).to include("Complete Checkout")
      end
    end

    it "resolves environment-adaptive selection_mode (smart in production, verbose in staging/dev)" do
      ContextDrop.configure do |config|
        config.enabled = true
        config.environment = "production"
        config.authorize_submission = ->(_ctrl) { true }
      end
      expect(ContextDrop.configuration.resolved_selection_mode).to eq("smart")

      session.get "/context_drop/config",
                  headers: { "HTTP_HOST" => "localhost", "REMOTE_ADDR" => "127.0.0.1" }
      expect(session.response.status).to eq(200)
      prod_cfg = JSON.parse(session.response.body)
      expect(prod_cfg.dig("features", "selection_mode")).to eq("smart")
      expect(prod_cfg.dig("features", "smart_capture_padding")).to eq(84)

      ContextDrop.configuration.environment = "staging"
      expect(ContextDrop.configuration.resolved_selection_mode).to eq("verbose")

      ContextDrop.configuration.environment = "development"
      expect(ContextDrop.configuration.resolved_selection_mode).to eq("verbose")

      ContextDrop.configuration.selection_mode = :smart
      expect(ContextDrop.configuration.resolved_selection_mode).to eq("smart")

      expect { ContextDrop.configuration.selection_mode = :invalid_mode }.to raise_error(ArgumentError)
    end
  end
end
