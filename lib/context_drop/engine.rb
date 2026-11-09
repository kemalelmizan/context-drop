# frozen_string_literal: true

module ContextDrop
  class Engine < ::Rails::Engine
    isolate_namespace ContextDrop

    initializer "context_drop.assets" do |app|
      if app.config.respond_to?(:assets) && app.config.assets.respond_to?(:paths)
        app.config.assets.paths << root.join("app/assets/javascripts").to_s
        app.config.assets.paths << root.join("app/assets/stylesheets").to_s
        app.config.assets.paths << root.join("app/javascript").to_s

        if app.config.assets.respond_to?(:precompile)
          app.config.assets.precompile += %w[
            context_drop/context_drop.js
            context_drop/application.css
          ]
        end
      end
    end

    initializer "context_drop.helpers" do
      ActiveSupport.on_load(:action_view) do
        include ContextDrop::WidgetHelper
      end
    end

    rake_tasks do
      load File.expand_path("../tasks/context_drop_tasks.rake", __dir__)
    end
  end
end
