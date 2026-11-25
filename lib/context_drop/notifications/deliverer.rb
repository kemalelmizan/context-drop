# frozen_string_literal: true

module ContextDrop
  module Notifications
    class Deliverer
      class << self
        def deliver_for_occurrence(occurrence)
          return unless destinations_ready?

          ContextDrop::NotificationDestination.enabled.find_each do |destination|
            next unless destination.subscribed_to?(occurrence.name)

            deliver_destination(destination, occurrence)
          end
        end

        def deliver_destination(destination, occurrence)
          case destination.destination_type
          when "lark"
            LarkClient.deliver(destination, occurrence)
          when "webhook"
            WebhookClient.deliver_destination(destination, occurrence)
          else
            raise LarkClient::DeliveryError, "Unknown destination type #{destination.destination_type}"
          end
          destination.record_delivery!(status: "delivered")
        rescue StandardError => e
          destination.record_delivery!(status: "failed", error: e.message)
          log_error(destination, e)
        end

        private

        def destinations_ready?
          defined?(ContextDrop::NotificationDestination) &&
            ContextDrop::NotificationDestination.connection.data_source_exists?("context_drop_notification_destinations")
        end

        def log_error(destination, err)
          return unless defined?(Rails) && Rails.respond_to?(:logger) && Rails.logger

          safe_msg = ContextDrop::SecretRedactor.scrub(err.message, extra_secrets: destination.secrets.values)
          Rails.logger.warn(
            "[ContextDrop::Notifications] destination ##{destination.id} #{destination.name}: #{err.class}: #{safe_msg}"
          )
        end
      end
    end
  end
end