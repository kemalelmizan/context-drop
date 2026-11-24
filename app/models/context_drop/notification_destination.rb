# frozen_string_literal: true

module ContextDrop
  class NotificationDestination < ApplicationRecord
    self.table_name = "context_drop_notification_destinations"

    DESTINATION_TYPES = %w[lark webhook].freeze

    validates :name, :destination_type, presence: true
    validates :destination_type, inclusion: { in: DESTINATION_TYPES }
    validate :validate_event_types
    validate :validate_settings_shape
    validate :validate_destination_secrets

    scope :enabled, -> { where(enabled: true) }

    def secrets
      @secrets ||= ContextDrop::NotificationSecrets.decrypt(secrets_ciphertext)
    end

    def secrets=(hash)
      @secrets = (hash || {}).transform_keys(&:to_s).compact_blank
      self.secrets_ciphertext = @secrets.empty? ? nil : ContextDrop::NotificationSecrets.encrypt(@secrets)
    end

    def merge_secrets!(updates)
      current = secrets
      updates.each do |key, val|
        next if val.to_s.strip.empty?

        current[key.to_s] = val.to_s.strip
      end
      self.secrets = current
    end

    def subscribed_to?(event_name)
      Array(event_types).map(&:to_s).include?(event_name.to_s)
    end

    def masked_secrets
      secrets.transform_values { |v| ContextDrop::NotificationSecrets.mask_secret(v) }
    end

    def record_delivery!(status:, error: nil)
      update_columns(
        last_delivery_status: status.to_s,
        last_delivery_error: error&.to_s&.truncate(2000),
        last_delivered_at: Time.current,
        updated_at: Time.current
      )
    end

    private

    def validate_event_types
      invalid = Array(event_types).map(&:to_s) - ContextDrop::EventOccurrence::EVENT_NAMES
      errors.add(:event_types, "include unsupported events: #{invalid.join(', ')}") if invalid.any?
    end

    def validate_destination_secrets
      return unless enabled

      case destination_type
      when "lark"
        errors.add(:secrets, "require Lark app_id") if secrets["app_id"].to_s.strip.empty?
        if secrets["app_secret"].to_s.strip.empty? && secrets_ciphertext.blank?
          errors.add(:secrets, "require Lark app_secret")
        end
      end
    end

    def validate_settings_shape
      return unless enabled

      case destination_type
      when "lark"
        errors.add(:settings, "require receive_id for Lark") if settings.is_a?(Hash) && settings["receive_id"].to_s.strip.empty?
      when "webhook"
        url = settings.is_a?(Hash) ? settings["url"].to_s.strip : ""
        errors.add(:settings, "require HTTPS url for webhook") if url.empty?
      end
    end
  end
end