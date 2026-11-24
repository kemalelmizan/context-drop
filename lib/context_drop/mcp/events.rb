# frozen_string_literal: true

require "json"
require "securerandom"

module ContextDrop
  module MCP
    module Events
      EXTENSION_ID = "io.modelcontextprotocol/events"
      POLL_DEFAULT_MS = 3_000
      SUBSCRIPTION_TTL_HOURS = 24

      class << self
        def event_types
          @event_types ||= [
            event_type_entry("feedback.created", "A new ContextDrop feedback submission was persisted."),
            event_type_entry("feedback.updated", "Feedback content or attachments were updated without a status transition."),
            event_type_entry("feedback.status_changed", "Feedback status changed (triage workflow)."),
            event_type_entry("feedback.deleted", "Feedback was soft-deleted.")
          ].freeze
        end
        def capability_payload
          { listChanged: false }
        end

        def list(_params = {})
          { events: event_types }
        end

        def poll(params)
          name = params["name"].to_s
          arguments = params["arguments"].is_a?(Hash) ? params["arguments"] : {}
          cursor = params["cursor"]
          env = arguments["environment"].to_s.strip

          scope = occurrence_scope(name)
          scope = scope.where("context_drop_event_occurrences.id > ?", cursor.to_i) if cursor.present?

          if env.present? && scope.klass.column_names.include?("data")
            # SQLite JSON filtering via LIKE for portability in tests; AR records filter in Ruby below.
          end

          records = scope.limit(50).to_a
          if env.present?
            records = records.select do |row|
              row.data.is_a?(Hash) && row.data["environment"].to_s.casecmp?(env)
            end
          end

          events = records.map(&:occurrence_payload)
          next_cursor = records.last&.cursor
          {
            events: events,
            cursor: next_cursor,
            nextPollMs: POLL_DEFAULT_MS,
            truncated: false
          }
        end

        def subscribe(params, request: nil)
          ensure_subscription_table!
          name = params["name"].to_s
          arguments = params["arguments"].is_a?(Hash) ? params["arguments"] : {}
          callback_url = params["callbackUrl"].to_s.strip
          ttl_hours = (params["ttlHours"] || SUBSCRIPTION_TTL_HOURS).to_i.clamp(1, 168)

          raise ContextDrop::Error, "callbackUrl is required" if callback_url.empty?

          ContextDrop::Notifications::WebhookClient.validate_https_uri!(callback_url)
          signing_secret = SecureRandom.hex(32)
          subscription = ContextDrop::McpEventSubscription.create!(
            subscription_id: SecureRandom.uuid,
            event_name: name,
            arguments: arguments,
            callback_url: callback_url,
            signing_secret: signing_secret,
            delivery_mode: "webhook",
            expires_at: ttl_hours.hours.from_now
          )

          verification_token = nil
          if request
            verification_token = perform_callback_verification(request, subscription, signing_secret)
          end

          {
            subscriptionId: subscription.subscription_id,
            expiresAt: subscription.expires_at.iso8601,
            signingSecret: signing_secret,
            verificationChallenge: verification_token
          }
        end

        def unsubscribe(params)
          ensure_subscription_table!
          sub_id = params["subscriptionId"].to_s.strip
          sub = ContextDrop::McpEventSubscription.find_by(subscription_id: sub_id)
          sub&.destroy
          { removed: !sub.nil? }
        end

        private

        def occurrence_scope(name)
          ensure_occurrence_table!
          scope = ContextDrop::EventOccurrence.chronological
          scope = scope.named(name) if name.present?
          scope
        end

        def ensure_occurrence_table!
          return if ContextDrop::EventOccurrence.connection.data_source_exists?("context_drop_event_occurrences")

          raise ContextDrop::Error, "ContextDrop events persistence is not installed (run engine migrations)"
        end

        def ensure_subscription_table!
          return if ContextDrop::McpEventSubscription.connection.data_source_exists?("context_drop_mcp_event_subscriptions")

          raise ContextDrop::Error, "ContextDrop MCP webhook subscriptions are not installed (run engine migrations)"
        end

        def perform_callback_verification(_request, subscription, signing_secret)
          challenge = SecureRandom.hex(16)
          occurrence = ContextDrop::EventOccurrence.new(
            event_id: "verification:#{subscription.subscription_id}",
            name: subscription.event_name,
            data: { "verification" => true, "challenge" => challenge },
            occurred_at: Time.current
          )
          ContextDrop::Notifications::WebhookClient.deliver_mcp_subscription(subscription, occurrence)
          challenge
        rescue StandardError
          nil
        end

        def event_type_entry(name, description)
          {
            name: name,
            description: description,
            inputSchema: environment_filter_schema,
            payloadSchema: feedback_payload_schema,
            delivery: %w[poll push webhook]
          }
        end

        def environment_filter_schema
          {
            type: "object",
            properties: {
              environment: {
                type: "string",
                description: "Optional ContextDrop environment filter (e.g. staging, production)."
              }
            },
            additionalProperties: false
          }
        end

        def feedback_payload_schema
          {
            type: "object",
            properties: {
              feedback_id: { type: "integer" },
              environment: { type: "string" },
              status: { type: "string" },
              previous_status: { type: %w[string null] },
              message: { type: "string" },
              page_url: { type: "string" },
              dashboard_url: { type: "string" }
            },
            required: %w[feedback_id environment status page_url]
          }
        end
      end
    end
  end
end