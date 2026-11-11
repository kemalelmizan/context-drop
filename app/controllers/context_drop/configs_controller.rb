# frozen_string_literal: true

module ContextDrop
  class ConfigsController < ApplicationController
    skip_forgery_protection only: [:widget_bundle] if respond_to?(:skip_forgery_protection)
    before_action :enforce_submission_authorization!, only: [:show]

    def show
      token = form_authenticity_token if respond_to?(:form_authenticity_token, true)
      render json: ContextDrop.config.public_widget_config.merge(csrf_token: token), status: :ok
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
