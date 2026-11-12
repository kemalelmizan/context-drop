# frozen_string_literal: true

require_relative "../spec_helper"

RSpec.describe "ContextDrop::Configuration" do
  before do
    ContextDrop.reset_configuration!
  end

  it "initializes with safe defaults and disabled state" do
    cfg = ContextDrop.config
    expect(cfg.enabled).to eq(false)
    expect(cfg.position).to eq(:bottom_right)
    expect(cfg.storage).to eq(:active_storage)
    expect(cfg.allow_anonymous).to eq(true)
    expect(cfg.max_attachments).to eq(10)
    expect(cfg.max_element_references).to eq(10)
    expect(cfg.max_attachment_size).to eq(10 * 1024 * 1024)
    expect(cfg.mcp_enabled).to eq(false)
    expect(cfg.mcp_api_key).to be_nil
  end

  it "validates position values and rejects invalid corners" do
    ContextDrop.configure do |config|
      config.position = :top_left
    end
    expect(ContextDrop.config.position).to eq(:top_left)

    expect do
      ContextDrop.config.position = :center_middle
    end.to raise_error(ArgumentError, /Invalid ContextDrop position/)
  end

  it "always preserves mandatory excluded selectors alongside custom selectors" do
    ContextDrop.configure do |config|
      config.excluded_selectors = [".secret-billing-card"]
    end

    selectors = ContextDrop.config.effective_excluded_selectors
    expect(selectors).to include("[data-feedback-ignore]")
    expect(selectors).to include("[data-feedback-sensitive]")
    expect(selectors).to include("input[type='password']")
    expect(selectors).to include("input[type='hidden']")
    expect(selectors).to include("[autocomplete^='cc-']")
    expect(selectors).to include(".secret-billing-card")
  end

  it "resolves polymorphic submitter and enforces allow_anonymous" do
    fake_employee = Struct.new(:id, :class_name).new(42, "Employee")
    fake_controller = Struct.new(:current_employee).new(fake_employee)

    ContextDrop.configure do |config|
      config.allow_anonymous = false
      config.current_submitter = ->(controller) { controller.current_employee }
    end

    expect(ContextDrop.config.resolve_submitter(fake_controller)).to eq(fake_employee)
    expect(ContextDrop.config.submission_authorized?(fake_controller)).to eq(true)

    anon_controller = Struct.new(:current_employee).new(nil)
    expect(ContextDrop.config.submission_authorized?(anon_controller)).to eq(false)
  end

  it "serializes public_widget_config without leaking server procs or MCP API keys" do
    ContextDrop.configure do |config|
      config.enabled = true
      config.mcp_enabled = true
      config.mcp_api_key = "super_secret_mcp_token"
    end

    pub = ContextDrop.config.public_widget_config(position: :bottom_left)
    expect(pub[:enabled]).to eq(true)
    expect(pub[:position]).to eq("bottom_left")
    expect(pub[:features][:element_selection]).to eq(true)
    expect(pub[:limits][:max_attachments]).to eq(10)
    expect(pub[:privacy][:excluded_selectors]).to include("[data-feedback-ignore]")
    expect(pub.key?(:mcp_api_key)).to eq(false)
    expect(pub.key?(:current_submitter)).to eq(false)
  end

  it "defaults enable_local_agent to false and uses verbose selection mode for local development" do
    cfg = ContextDrop.config
    expect(cfg.local_agent_enabled).to eq(false)
    expect(cfg.enable_local_agent).to eq(false)
    expect(cfg.local_agent_allowed?).to eq(false)

    # In local development without agent enabled, public widget config has agent disabled and verbose selection mode
    pub = cfg.public_widget_config
    expect(pub.dig(:agent, :enabled)).to eq(false)
    expect(pub.dig(:features, :selection_mode)).to eq("verbose")

    # Enabling via enable_local_agent = true sets local_agent_enabled and activates local agent
    ContextDrop.configure do |c|
      c.environment = "development"
      c.enable_local_agent = true
    end
    expect(ContextDrop.config.enable_local_agent).to eq(true)
    expect(ContextDrop.config.local_agent_enabled).to eq(true)
    expect(ContextDrop.config.local_agent_allowed?).to eq(true)
    expect(ContextDrop.config.public_widget_config.dig(:agent, :enabled)).to eq(true)

    # Enabling via local_agent_enabled = true alias also works
    ContextDrop.configure do |c|
      c.local_agent_enabled = false
    end
    expect(ContextDrop.config.enable_local_agent).to eq(false)
    expect(ContextDrop.config.local_agent_enabled).to eq(false)
    expect(ContextDrop.config.local_agent_allowed?).to eq(false)
  end
end
