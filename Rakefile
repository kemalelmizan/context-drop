# frozen_string_literal: true

require "json"
require "shellwords"
require "bundler/gem_tasks"
require "rake/testtask"

module ContextDropReleaseExtension
  protected

  def sign_git_tag?
    !%w[n no nil false off 0].include?(ENV["sign_tag"].to_s.downcase)
  end

  def tag_version
    tag_cmd = ["git", "tag"]
    tag_cmd << "-s" if sign_git_tag?
    tag_cmd.push("-m", "Version #{version}", version_tag)

    tagged = false
    Bundler.ui.debug(tag_cmd)
    Bundler::SharedHelpers.chdir(base) do
      unless Kernel.system(*tag_cmd)
        raise("Running `#{tag_cmd.shelljoin}` failed. Ensure git signing (user.signingkey / gpg.format) is configured, or pass sign_tag=no.")
      end
      tagged = true
    end

    Bundler.ui.confirm "Tagged #{version_tag}#{sign_git_tag? ? ' (signed)' : ''}."
    yield if block_given?
  rescue RuntimeError
    if tagged
      Bundler.ui.error "Untagging #{version_tag} due to error."
      sh_with_status %W[git tag -d #{version_tag}]
    end
    raise
  end
end

Bundler::GemHelper.prepend(ContextDropReleaseExtension)

Rake::TestTask.new(:test) do |t|
  t.libs << "lib"
  t.libs << "spec"
  t.pattern = "spec/**/*_spec.rb"
  t.verbose = false
end

namespace :assets do
  desc "Build the TypeScript widget bundle and NPM dist/ artifacts"
  task :build do
    sh "npm run build"
  end
end

namespace :version do
  desc "Synchronize version across RubyGem, package.json, and TypeScript sources (e.g. rake 'version:bump[0.2.1]')"
  task :bump, [:new_version] do |_, args|
    new_version = args[:new_version].to_s.strip
    unless new_version.match?(/\A\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?\z/)
      abort "Usage: bundle exec rake 'version:bump[X.Y.Z]' (got #{new_version.inspect})"
    end

    root = File.expand_path(__dir__)

    version_rb = File.join(root, "lib/context_drop/version.rb")
    updated_rb = File.read(version_rb).sub(/VERSION\s*=\s*"[^"]+"/, %(VERSION = "#{new_version}"))
    File.write(version_rb, updated_rb)

    ts_types = File.join(root, "src/server/types.ts")
    updated_ts = File.read(ts_types).sub(/export const VERSION\s*=\s*"[^"]+";/, %(export const VERSION = "#{new_version}";))
    File.write(ts_types, updated_ts)

    sh "npm", "version", new_version, "--no-git-tag-version", "--allow-same-version"
    sh "npm", "run", "build"

    puts "Synchronized ContextDrop version to #{new_version} across RubyGem and NPM."
  end
end

namespace :release do
  desc "Verify RubyGem, package.json, and TypeScript VERSION constants match"
  task :verify_versions do
    root = File.expand_path(__dir__)
    gem_version = Bundler::GemHelper.instance.gemspec.version.to_s
    pkg_version = JSON.parse(File.read(File.join(root, "package.json"))).fetch("version")
    ts_content = File.read(File.join(root, "src/server/types.ts"))
    ts_version = ts_content[/export const VERSION\s*=\s*"([^"]+)"/, 1]

    if [gem_version, pkg_version, ts_version].uniq.size != 1
      abort <<~MSG
        Version mismatch detected before release!
          lib/context_drop/version.rb : #{gem_version}
          package.json                : #{pkg_version}
          src/server/types.ts         : #{ts_version}
        Run `bundle exec rake "version:bump[#{gem_version}]"` to synchronize them first.
      MSG
    end
  end

  desc "Publish context-drop NPM package to npmjs.org (skip with npm_push=no)"
  task :npm_push do
    next if %w[n no nil false off 0].include?(ENV["npm_push"].to_s.downcase)

    pkg_version = JSON.parse(File.read(File.expand_path("package.json", __dir__))).fetch("version")
    existing_out = IO.popen(%W[npm view context-drop@#{pkg_version} version], err: [:child, :out], &:read)
    if $?.success? && existing_out.strip == pkg_version
      Bundler.ui.confirm "context-drop@#{pkg_version} is already published on npmjs.org, skipping."
      next
    end

    Bundler.ui.confirm "Publishing context-drop@#{pkg_version} to npmjs.org..."
    abort "npm publish failed!" unless Kernel.system("npm", "publish", "--access", "public")
    Bundler.ui.confirm "Pushed context-drop@#{pkg_version} to npmjs.org."
  end
end

Rake::Task["build"].enhance(["assets:build"])
Rake::Task["release:guard_clean"].enhance(["release:verify_versions"])
Rake::Task["release"].enhance do
  Rake::Task["release:npm_push"].invoke
end
Rake::Task["release"].clear_comments
Rake::Task["release"].add_description(
  "Create signed tag v#{ContextDrop::VERSION}, build & push context_drop-#{ContextDrop::VERSION}.gem to RubyGems, " \
  "and publish context-drop@#{ContextDrop::VERSION} to NPM (skip with gem_push=no / npm_push=no / sign_tag=no)"
)

task default: :test
