# frozen_string_literal: true

require "securerandom"

module ContextDrop
  module FeedbackEvents
    class Publisher
      class << self
        def publish(event_name, feedback, **context)
          return unless persistence_ready?

          data = build_payload(event_name, feedback, context)
          occurrence = ContextDrop::EventOccurrence.create!(
            event_id: stable_event_id(event_name, feedback, data),
            name: event_name,
            feedback_id: feedback.respond_to?(:id) ? feedback.id : nil,
            data: data,
            occurred_at: Time.current
          )

          deliver_notifications(occurrence)
          deliver_mcp_webhook_subscriptions(occurrence)
          ContextDrop::MCP::EventStreamRegistry.broadcast(occurrence)
          occurrence
        rescue StandardError => e
          log_error("publish", e)
          nil
        end

        def map_lifecycle_callback(hook_name, feedback, previous_status: nil, dashboard_url: nil)
          ctx = { previous_status: previous_status, dashboard_url: dashboard_url }
          case hook_name
          when :on_feedback_created
            publish("feedback.created", feedback, **ctx)
          when :on_feedback_updated
            if previous_status.present? && previous_status.to_s != feedback.status.to_s
              publish("feedback.status_changed", feedback, **ctx)
            else
              publish("feedback.updated", feedback, **ctx)
            end
          when :on_feedback_deleted
            publish("feedback.deleted", feedback, **ctx)
          end
        end

        private

        def persistence_ready?
          defined?(ContextDrop::EventOccurrence) &&
            ContextDrop::EventOccurrence.connection.data_source_exists?("context_drop_event_occurrences")
        end

        def stable_event_id(event_name, feedback, _data)
          fb_id = feedback.respond_to?(:id) ? feedback.id : "unknown"
          "#{event_name}:#{fb_id}:#{SecureRandom.uuid}"
        end

        def build_payload(event_name, feedback, context)
          {
            event: event_name,
            feedback_id: feedback.id,
            environment: feedback.respond_to?(:environment_name) ? feedback.environment_name : ContextDrop.config.resolved_environment,
            status: feedback.status,
            previous_status: context[:previous_status],
            message: feedback.message.to_s.truncate(500),
            page_url: feedback.page_url,
            submitter_label: feedback.respond_to?(:submitter_label) ? feedback.submitter_label : nil,
            element_references_count: feedback.respond_to?(:element_references) ? feedback.element_references.size : 0,
            attachments_count: feedback.respond_to?(:attachments) ? feedback.attachments.size : 0,
            created_at: feedback.created_at&.iso8601,
            updated_at: feedback.updated_at&.iso8601,
            deleted_at: (feedback.deleted_at_value&.iso8601 if feedback.respond_to?(:deleted_at_value)),
            dashboard_url: context[:dashboard_url].presence
          }.compact
        end

        def deliver_notifications(occurrence)
          ContextDrop::Notifications::Deliverer.deliver_for_occurrence(occurrence)
        end

        def deliver_mcp_webhook_subscriptions(occurrence)
          return unless defined?(ContextDrop::McpEventSubscription)
          return unless ContextDrop::McpEventSubscription.connection.data_source_exists?("context_drop_mcp_event_subscriptions")

          ContextDrop::McpEventSubscription.active.find_each do |sub|
            next unless sub.matches_occurrence?(occurrence)

            ContextDrop::Notifications::WebhookClient.deliver_mcp_subscription(sub, occurrence)
          end
        end

        def log_error(phase, err)
          return unless defined?(Rails) && Rails.respond_to?(:logger) && Rails.logger

          Rails.logger.error("[ContextDrop::FeedbackEvents] #{phase}: #{err.class}: #{err.message}")
        end
      end
    end
  end
end