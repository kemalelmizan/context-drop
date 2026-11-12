# frozen_string_literal: true

module ContextDrop
  class ConfigsController < ApplicationController
    skip_forgery_protection only: %i[widget_bundle cors_preflight] if respond_to?(:skip_forgery_protection)
    before_action :enforce_submission_authorization!, only: [:show]

    def show
      token = form_authenticity_token if respond_to?(:form_authenticity_token, true)
      agent_ok = ContextDrop.config.local_agent_allowed? && ContextDrop.config.loopback_request?(request)
      render json: ContextDrop.config.public_widget_config(agent_enabled: agent_ok).merge(csrf_token: token), status: :ok
    end

    def cors_preflight
      origin = request.headers["Origin"].to_s.strip
      if !origin.empty? && ContextDrop.config.origin_allowed?(origin)
        head :no_content
      else
        head :forbidden
      end
    end

    def widget_bundle
      bundle_path = ContextDrop::Engine.root.join("app/assets/javascripts/context_drop/context_drop.js")
      if File.exist?(bundle_path)
        send_file bundle_path, type: "application/javascript", disposition: "inline"
      else
        head :not_found
      end
    end
  end
end
