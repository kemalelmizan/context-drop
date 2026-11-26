# frozen_string_literal: true

require "securerandom"

module ContextDrop
  module Dashboard
    class IntegrationsController < ApplicationController
      layout "context_drop/application"
      helper ContextDrop::DashboardHelper

      before_action :enforce_dashboard_authorization!
      before_action :apply_dashboard_security_headers!
      before_action :ensure_tables!
      before_action :set_destination, only: %i[edit update destroy test_delivery]

      PERMITTED_EVENTS = ContextDrop::EventOccurrence::EVENT_NAMES

      def index
        @destinations = ContextDrop::NotificationDestination.order(created_at: :desc)
        @mcp_subscriptions = if subscription_table?
                               ContextDrop::McpEventSubscription.active.order(expires_at: :asc).limit(20)
                             else
                               []
                             end
      end

      def new
        @destination = ContextDrop::NotificationDestination.new(
          enabled: true,
          destination_type: params[:destination_type].presence || "lark",
          event_types: ["feedback.created"]
        )
      end

      def create
        @destination = ContextDrop::NotificationDestination.new(destination_params)
        apply_secret_params!(@destination)
        if @destination.save
          redirect_to dashboard_integrations_path, notice: "Notification destination \"#{@destination.name}\" created."
        else
          render :new, status: :unprocessable_entity
        end
      end

      def edit; end

      def update
        @destination.assign_attributes(destination_params)
        apply_secret_params!(@destination)
        if @destination.save
          redirect_to dashboard_integrations_path, notice: "Saved \"#{@destination.name}\"."
        else
          render :edit, status: :unprocessable_entity
        end
      end

      def destroy
        name = @destination.name
        @destination.destroy
        redirect_to dashboard_integrations_path, notice: "Removed \"#{name}\"."
      end

      def test_delivery
        occurrence = ContextDrop::EventOccurrence.new(
          event_id: "test:#{SecureRandom.uuid}",
          name: (@destination.event_types.first || "feedback.created"),
          data: {
            "feedback_id" => 0,
            "environment" => ContextDrop.config.resolved_environment,
            "status" => "new",
            "message" => "Test notification from ContextDrop dashboard.",
            "page_url" => "/",
            "dashboard_url" => dashboard_integrations_url(only_path: false)
          },
          occurred_at: Time.current
        )
        ContextDrop::Notifications::Deliverer.deliver_destination(@destination, occurrence)
        @destination.reload
        if @destination.last_delivery_status == "delivered"
          redirect_to dashboard_integrations_path, notice: "Test notification delivered for \"#{@destination.name}\"."
        else
          redirect_to dashboard_integrations_path,
                      alert: "Test failed: #{@destination.last_delivery_error.presence || 'unknown error'}"
        end
      rescue StandardError => e
        redirect_to dashboard_integrations_path, alert: "Test failed: #{e.message}"
      end

      private

      def set_destination
        @destination = ContextDrop::NotificationDestination.find(params[:id])
      end

      def destination_params
        raw = params.require(:notification_destination)
        permitted = raw.permit(
          :name,
          :enabled,
          :destination_type,
          event_types: [],
          settings: %i[url receive_id receive_id_type api_host]
        )
        permitted[:event_types] = Array(permitted[:event_types]).map(&:to_s).select do |ev|
          PERMITTED_EVENTS.include?(ev)
        end
        permitted[:settings] = (permitted[:settings] || {}).to_h.compact_blank
        permitted
      end

      def apply_secret_params!(destination)
        raw = params[:notification_destination] || {}
        secrets = {}
        case destination.destination_type
        when "lark"
          secrets["app_id"] = raw[:app_id].to_s.strip if raw[:app_id].present?
          secrets["app_secret"] = raw[:app_secret].to_s.strip if raw[:app_secret].present?
        when "webhook"
          secrets["signing_secret"] = raw[:signing_secret].to_s.strip if raw[:signing_secret].present?
        end
        destination.merge_secrets!(secrets) if secrets.any?
      end

      def enforce_dashboard_authorization!
        return if ContextDrop.config.dashboard_authorized?(self)

        render plain: "403 Forbidden — Not authorized to configure integrations", status: :forbidden
      end

      def apply_dashboard_security_headers!
        @cd_csp_nonce = SecureRandom.base64(16)
        response.set_header(
          "Content-Security-Policy",
          "default-src 'self'; script-src 'self' 'nonce-#{@cd_csp_nonce}'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'"
        )
        response.set_header("X-Frame-Options", "SAMEORIGIN")
        response.set_header("X-Content-Type-Options", "nosniff")
      end

      def ensure_tables!
        return if ContextDrop::NotificationDestination.connection.data_source_exists?("context_drop_notification_destinations")

        render plain: "Run ContextDrop engine migrations to enable integrations.", status: :service_unavailable
      end

      def subscription_table?
        ContextDrop::McpEventSubscription.connection.data_source_exists?("context_drop_mcp_event_subscriptions")
      end
    end
  end
end