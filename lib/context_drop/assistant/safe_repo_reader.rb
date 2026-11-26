# frozen_string_literal: true

module ContextDrop
  module Assistant
    class SafeRepoReader
      class AccessDeniedError < ContextDrop::Error; end

      DEFAULT_ALLOWED_GLOBS = %w[
        app/**
        config/locales/**
        config/routes.rb
        config/routes/**
        frontend/**
        public/**
        src/**
      ].freeze

      class << self
        def read_file(path:, root: nil, allowed_globs: DEFAULT_ALLOWED_GLOBS, start_line: 1, end_line: 400)
          sandbox = ContextDrop::Agent::WorkspaceSandbox.new(root)
          _abs_path, rel_path = sandbox.resolve_safe_path!(path)
          enforce_allowed_globs!(rel_path, allowed_globs)

          sandbox.read_file(path: rel_path, start_line: start_line, end_line: end_line)
        rescue ContextDrop::Agent::WorkspaceSandbox::SandboxError => e
          raise AccessDeniedError, e.message
        end

        def search(query:, root: nil, directory: ".", allowed_globs: DEFAULT_ALLOWED_GLOBS, max_results: 40)
          sandbox = ContextDrop::Agent::WorkspaceSandbox.new(root)
          raw = sandbox.search_code(query: query, directory: directory, max_results: max_results * 2)
          filtered = Array(raw[:matches]).select { |m| path_allowed_by_globs?(m[:path], allowed_globs) }.first(max_results)
          {
            query: raw[:query],
            matches: filtered,
            truncated: filtered.size >= max_results
          }
        rescue ContextDrop::Agent::WorkspaceSandbox::SandboxError => e
          raise AccessDeniedError, e.message
        end

        def enforce_allowed_globs!(rel_path, allowed_globs)
          return if allowed_globs.nil?

          globs = Array(allowed_globs).map { |g| g.to_s.strip }.reject(&:empty?)
          return if globs.empty?
          return if path_allowed_by_globs?(rel_path, globs)

          raise AccessDeniedError, "Access denied: '#{rel_path}' is outside allowed Build globs"
        end

        def path_allowed_by_globs?(rel_path, allowed_globs)
          globs = Array(allowed_globs).map { |g| g.to_s.strip }.reject(&:empty?)
          return true if globs.empty?

          normalized = rel_path.to_s.sub(%r{\A\./}, "").sub(%r{\A/+}, "")
          globs.any? { |glob| match_glob?(glob, normalized) }
        end

        def match_glob?(glob, rel_path)
          clean_glob = glob.to_s.sub(%r{\A\./}, "").sub(%r{\A/+}, "")
          return true if clean_glob == "**" || clean_glob == "**/*"

          if clean_glob.end_with?("/**")
            prefix = clean_glob.delete_suffix("/**")
            return true if rel_path == prefix || rel_path.start_with?("#{prefix}/")
          end

          regex = glob_to_regex(clean_glob)
          regex.match?(rel_path)
        end

        private

        def glob_to_regex(glob)
          escaped = Regexp.escape(glob)
          pattern = escaped
                    .gsub('\*\*/', "(?:.+/)?")
                    .gsub('\*\*', ".*")
                    .gsub('\*', "[^/]*")
                    .gsub('\?', "[^/]")
          /\A#{pattern}\z/
        end
      end
    end
  end
end
