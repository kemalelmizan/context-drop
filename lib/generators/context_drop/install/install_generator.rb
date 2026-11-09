# frozen_string_literal: true

require "rails/generators"

module ContextDrop
  module Generators
    class InstallGenerator < Rails::Generators::Base
      source_root File.expand_path("templates", __dir__)

      desc "Installs ContextDrop initializer, mounts Engine routes, copies migrations, and checks Active Storage."

      def create_initializer_file
        template "initializer.rb.tt", "config/initializers/context_drop.rb"
      end

      def mount_engine_routes
        routes_path = File.join(destination_root, "config/routes.rb")
        return unless File.exist?(routes_path)

        content = File.read(routes_path)
        return if content.include?("ContextDrop::Engine")

        route 'mount ContextDrop::Engine => "/context_drop"'
      end

      def copy_engine_migrations
        rake "context_drop:install:migrations"
      end

      def verify_active_storage
        migrations_dir = File.join(destination_root, "db/migrate")
        has_active_storage = Dir.exist?(migrations_dir) &&
                             Dir.glob(File.join(migrations_dir, "*create_active_storage_tables*.rb")).any?

        return if has_active_storage

        say_status(
          :info,
          "Active Storage migrations not detected. Run `bin/rails active_storage:install` if Active Storage is not yet installed.",
          :yellow
        )
      end

      def print_post_install_instructions
        say "\nContextDrop installed! Next steps:", :green
        say "  1. Run `bin/rails db:migrate` to create context_drop_* tables."
        say "  2. Set `CONTEXT_DROP_ENABLED=true` in your environment."
        say "  3. Add `<%= context_drop_widget %>` before `</body>` in `app/views/layouts/application.html.erb`."
      end
    end
  end
end
