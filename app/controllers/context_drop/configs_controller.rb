# frozen_string_literal: true

module ContextDrop
  class ConfigsController < ApplicationController
    before_action :enforce_submission_authorization!, only: [:show]

    def show
      render json: ContextDrop.config.public_widget_config, status: :ok
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
