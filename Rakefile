# frozen_string_literal: true

require "bundler/gem_tasks"
require "rake/testtask"

Rake::TestTask.new(:test) do |t|
  t.libs << "lib"
  t.libs << "spec"
  t.pattern = "spec/**/*_spec.rb"
  t.verbose = false
end

namespace :assets do
  desc "Build the decoupled TypeScript widget into app/assets/javascripts/context_drop/context_drop.js"
  task :build do
    sh "npm run build"
  end
end

task default: :test
