# frozen_string_literal: true

require_relative "../spec_helper"
require_relative "../dummy/config/environment"

RSpec.describe "ContextDrop::Dashboard" do
  let(:app) { Rails.application }
  let(:session) do
    ActionDispatch::Integration::Session.new(app).tap do |s|
      s.default_url_options[:host] = "localhost"
    end
  end

  before do
    ContextDrop.reset_configuration!
    ContextDrop.configure do |config|
      config.enabled = true
      config.authorize_dashboard = ->(_c) { true }
    end

    ContextDrop::Feedback.delete_all
    ContextDrop::ElementReference.delete_all
    ContextDrop::Attachment.delete_all
  end

  describe "DashboardHelper#url_path_and_host" do
    let(:helper) do
      Class.new do
        include ContextDrop::DashboardHelper
      end.new
    end

    it "extracts path, query, and host for standard URLs" do
      path, host = helper.url_path_and_host("https://mcp-itpac.gotocompany.net/rails/adaptive/modeling/dimensions?view=grid")
      expect(path).to eq("/rails/adaptive/modeling/dimensions?view=grid")
      expect(host).to eq("mcp-itpac.gotocompany.net")
    end

    it "handles relative paths" do
      path, host = helper.url_path_and_host("/orders/123")
      expect(path).to eq("/orders/123")
      expect(host).to be_nil
    end

    it "handles nil or blank URLs safely" do
      path, host = helper.url_path_and_host(nil)
      expect(path).to eq("/")
      expect(host).to be_nil
    end
  end

  describe "GET /context_drop/dashboard/feedbacks" do
    let!(:fb1) do
      ContextDrop::Feedback.create!(
        status: "new",
        message: "fix the bug of the dimension data",
        page_url: "https://mcp-itpac.gotocompany.net/rails/adaptive/modeling/dimensions",
        submitter_type: "User",
        submitter_id: 2,
        created_at: 2.hours.ago
      )
    end

    let!(:fb2) do
      ContextDrop::Feedback.create!(
        status: "resolved",
        message: "these menus should be more like this",
        page_url: "https://mcp-itpac.gotocompany.net/rails/adaptive/modeling/level-sheets",
        submitter_type: "User",
        submitter_id: 2,
        created_at: 1.hour.ago
      )
    end

    before do
      fb1.element_references.create!(
        tag_name: "tbody",
        selector: "table.data-grid > tbody",
        text_content: "Dimensions table",
        bounding_rect: { "x" => 10, "y" => 20, "width" => 400, "height" => 200 }
      )
    end

    it "renders the table layout with colgroup, url path formatting, and status tabs" do
      session.get "/context_drop/dashboard/feedbacks",
                  headers: {
                    "HTTP_HOST" => "localhost",
                    "HTTP_REFERER" => "http://localhost/app/dimensions"
                  }

      expect(session.response.status).to eq(200)
      body = session.response.body

      # Navigation shortcuts in header
      expect(body).to include("Back to App")
      expect(body).to include("/app/dimensions")
      expect(body).to include("⌥⇧P")
      expect(body).to include("Freeze &amp; Pin")

      # Status tabs
      expect(body).to include("All")
      expect(body).to include("cd-tab-count")

      # Colgroup and fixed layout
      expect(body).to include("<table class=\"cd-table\">")
      expect(body).to include("<colgroup>")

      # URL Path and Host separation
      expect(body).to include("cd-url-path")
      expect(body).to include("/rails/adaptive/modeling/dimensions")
      expect(body).to include("mcp-itpac.gotocompany.net")

      # Selector chip and context count
      expect(body).to include("table.data-grid &gt; tbody")

      # Pagination info
      expect(body).to include("Showing <strong>1–2</strong> of <strong>2</strong> feedbacks")
    end

    it "filters by status correctly" do
      session.get "/context_drop/dashboard/feedbacks?status=resolved",
                  headers: { "HTTP_HOST" => "localhost" }

      expect(session.response.status).to eq(200)
      body = session.response.body

      expect(body).to include("these menus should be more like this")
      expect(body).not_to include("fix the bug of the dimension data")
    end
  end

  describe "GET /context_drop/dashboard/feedbacks/:id" do
    let!(:older_fb) do
      ContextDrop::Feedback.create!(
        status: "new",
        message: "First feedback",
        page_url: "http://localhost/items",
        created_at: 3.hours.ago
      )
    end

    let!(:current_fb) do
      ContextDrop::Feedback.create!(
        status: "new",
        message: "Second feedback",
        page_url: "http://localhost/items/2",
        created_at: 2.hours.ago
      )
    end

    let!(:newer_fb) do
      ContextDrop::Feedback.create!(
        status: "reviewed",
        message: "Third feedback",
        page_url: "http://localhost/items/3",
        created_at: 1.hour.ago
      )
    end

    before do
      current_fb.element_references.create!(
        tag_name: "button",
        selector: "#checkout-submit",
        text_content: "Submit Order",
        bounding_rect: { "x" => 10, "y" => 20, "width" => 120, "height" => 40 }
      )
    end

    it "renders breadcrumbs and prev/next shortcuts for newer and older feedbacks" do
      session.get "/context_drop/dashboard/feedbacks/#{current_fb.id}",
                  headers: { "HTTP_HOST" => "localhost" }

      expect(session.response.status).to eq(200)
      body = session.response.body

      # Breadcrumbs
      expect(body).to include("Feedback ##{current_fb.id}")
      expect(body).to include("cd-breadcrumbs")

      # Newer and Older shortcut links
      expect(body).to include("id=\"cd-nav-newer\"")
      expect(body).to include("/context_drop/dashboard/feedbacks/#{newer_fb.id}")
      expect(body).to include("id=\"cd-nav-older\"")
      expect(body).to include("/context_drop/dashboard/feedbacks/#{older_fb.id}")

      # Keyboard shortcut cues
      expect(body).to include("<kbd class=\"cd-kbd\">[</kbd>")
      expect(body).to include("<kbd class=\"cd-kbd\">]</kbd>")
      expect(body).to include("<kbd class=\"cd-kbd\" style=\"margin-left: 0.25rem;\">Esc</kbd>")

      # Element details
      expect(body).to include("&lt;button&gt;")
      expect(body).to include("#checkout-submit")
    end
  end
end
