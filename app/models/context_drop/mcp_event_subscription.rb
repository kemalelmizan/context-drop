# frozen_string_literal: true

module ContextDrop
  class McpEventSubscription < ApplicationRecord
    self.table_name = "context_drop_mcp_event_subscriptions"

    scope :active, -> { where("expires_at > ?", Time.current) }

    validates :subscription_id, :event_name, :callback_url, :signing_secret, :expires_at, presence: true

    def expired?
      expires_at <= Time.current
    end

    def matches_occurrence?(occurrence)
      return false unless occurrence.name == event_name

      arg_env = arguments.is_a?(Hash) ? arguments["environment"].to_s.strip : ""
      return true if arg_env.empty?

      data_env = occurrence.data.is_a?(Hash) ? occurrence.data["environment"].to_s.strip : ""
      arg_env.casecmp?(data_env)
    end
  end
end