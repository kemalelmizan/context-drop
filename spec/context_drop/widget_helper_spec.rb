# frozen_string_literal: true

require_relative "../spec_helper"

RSpec.describe "ContextDrop::WidgetHelper" do
  class DummyViewContext
    include ContextDrop::WidgetHelper

    attr_accessor :controller

    def initialize(controller = nil)
      @controller = controller
    end
  end

  before do
    ContextDrop.reset_configuration!
  end

  it "returns nil and emits no HTML when ContextDrop is disabled" do
    ContextDrop.config.enabled = false
    view = DummyViewContext.new
    expect(view.context_drop_widget).to be_nil
  end

  it "returns nil when allow_anonymous is false and no submitter is authenticated" do
    ContextDrop.configure do |config|
      config.enabled = true
      config.allow_anonymous = false
      config.current_submitter = ->(_c) { nil }
    end

    view = DummyViewContext.new(Object.new)
    expect(view.context_drop_widget).to be_nil
  end

  it "renders <context-drop-widget> and script tag with per-page overrides when enabled" do
    ContextDrop.configure do |config|
      config.enabled = true
      config.position = :bottom_right
    end

    view = DummyViewContext.new
    html = view.context_drop_widget(
      position: :bottom_left,
      placeholder: "Report a bug on this page",
      metadata: { release: "v1.2.3" }
    )

    expect(html).to include("<context-drop-widget")
    expect(html).to include('data-position="bottom_left"')
    expect(html).to include('data-placeholder="Report a bug on this page"')
    expect(html).to include("v1.2.3")
    expect(html).to include("context_drop.js")
    # Global config position remains unchanged
    expect(ContextDrop.config.position).to eq(:bottom_right)
  end
end
