# frozen_string_literal: true

require_relative "application"
Rails.application.initialize!

migration_paths = [File.expand_path("../../../db/migrate", __dir__)].select { |p| Dir.exist?(p) }
if defined?(ActiveStorage::Engine)
  as_migrate = ActiveStorage::Engine.root.join("db/migrate").to_s
  migration_paths << as_migrate if Dir.exist?(as_migrate)
end
if defined?(ActiveRecord::MigrationContext) && migration_paths.any?
  context = ActiveRecord::MigrationContext.new(migration_paths)
  context.migrate if context.needs_migration?
end
