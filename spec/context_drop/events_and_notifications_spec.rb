# frozen_string_literal: true

require_relative "../spec_helper"
require_relative "../dummy/config/environment"

RSpec.describe "ContextDrop MCP Events & Notifications" do
  before do
    ContextDrop.reset_configuration!
    ContextDrop.configure do |config|
      config.enabled = true
      config.mcp_enabled = true
      config.mcp_api_key = "test_mcp_key"
    end

    if ContextDrop::EventOccurrence.connection.data_source_exists?("context_drop_event_occurrences")
      ContextDrop::EventOccurrence.delete_all
      ContextDrop::NotificationDestination.delete_all
    end
  end

  describe "ContextDrop::MCP::Events" do
    it "lists feedback lifecycle event types with delivery modes" do
      result = ContextDrop::MCP::Events.list
      names = result[:events].map { |e| e[:name] }
      expect(names).to include("feedback.created", "feedback.deleted")
      expect(result[:events].first[:delivery]).to include("poll", "push", "webhook")
    end

    it "polls occurrences after a publish" do
      skip "Event tables not migrated" unless ContextDrop::EventOccurrence.connection.data_source_exists?("context_drop_event_occurrences")

      fb = ContextDrop::Feedback.create!(
        message: "Event pipeline test",
        page_url: "https://example.com/a",
        status: "new"
      )
      ContextDrop::FeedbackEvents::Publisher.publish("feedback.created", fb, dashboard_url: "/context_drop/dashboard/feedbacks/#{fb.id}")

      polled = ContextDrop::MCP::Events.poll("name" => "feedback.created", "cursor" => nil)
      expect(polled[:events].size).to eq(1)
      expect(polled[:events].first[:data]["feedback_id"]).to eq(fb.id)
    end
  end

  describe "ContextDrop::NotificationSecrets" do
    it "round-trips encrypted secrets" do
      payload = { "app_secret" => "super-secret", "app_id" => "cli_test" }
      blob = ContextDrop::NotificationSecrets.encrypt(payload)
      decoded = ContextDrop::NotificationSecrets.decrypt(blob)
      expect(decoded["app_secret"]).to eq("super-secret")
    end
  end

  describe "dashboard integrations" do
    it "creates a webhook destination" do
      skip "Notification tables not migrated" unless ContextDrop::NotificationDestination.connection.data_source_exists?("context_drop_notification_destinations")

      dest = ContextDrop::NotificationDestination.create!(
        name: "Hooks",
        destination_type: "webhook",
        event_types: ["feedback.created"],
        settings: { "url" => "https://example.com/hooks/contextdrop" },
        secrets: { "signing_secret" => "whsec_test" }
      )
      expect(dest.subscribed_to?("feedback.created")).to be(true)
    end
  end
end