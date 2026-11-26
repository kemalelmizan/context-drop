# frozen_string_literal: true

module ContextDrop
  module Assistant
    module PatchValidator
      MAX_PATCHES = 20
      MAX_TOTAL_PATCH_BYTES = 256 * 1024 # 256 KB

      FORBIDDEN_PATCH_PATTERNS = [
        %r{\A\.git(?:/|\z)}i,
        %r{\A\.github(?:/|\z)}i,
        %r{\A\.circleci(?:/|\z)}i,
        %r{\A\.buildkite(?:/|\z)}i,
        %r{\A\.gitlab-ci}i,
        %r{(?:^|/)Jenkinsfile}i,
        %r{(?:^|/)Dockerfile}i,
        %r{(?:^|/)docker-compose}i,
        %r{\AProcfile}i,
        %r{(?:^|/)Gemfile(?:\.lock)?\z}i,
        %r{\.gemspec\z}i,
        %r{\ARakefile\z}i,
        %r{(?:^|/)(?:package\.json|package-lock\.json|yarn\.lock|pnpm-lock\.yaml)\z}i,
        %r{\A(?:bin|script)(?:/|\z)}i,
        %r{\Aconfig/(?:initializers|environments)(?:/|\z)}i,
        %r{\Aconfig/(?:application|boot|environment|puma)\.rb\z}i,
        %r{(?:^|/)\.env(?:\.(?!example\z|sample\z|template\z)[^/]+)?\z}i,
        %r{\Aconfig/master\.key\z}i,
        %r{\Aconfig/credentials(?:/|\.yml\.enc\z)}i,
        %r{\Atmp/context_drop_}i,
        %r{\.(?:pem|key|p12|pfx|jks|sqlite3|db)\z}i,
        %r{(?:^|/)id_(?:rsa|ed25519|ecdsa|dsa)}i
      ].freeze

      module_function

      def validate_patches!(raw_patches, allowed_globs: nil)
        list = Array(raw_patches)
        if list.size > MAX_PATCHES
          raise ContextDrop::Error, "propose_change_set exceeds maximum patch count (#{MAX_PATCHES})"
        end

        total_bytes = 0
        normalized = list.map do |entry|
          hash = entry.is_a?(Hash) ? entry.transform_keys(&:to_s) : {}
          norm_path = validate_patch_path!(hash["path"], allowed_globs: allowed_globs)
          old_s = hash["old_string"].to_s
          new_s = hash["new_string"].to_s
          total_bytes += old_s.bytesize + new_s.bytesize
          if total_bytes > MAX_TOTAL_PATCH_BYTES
            raise ContextDrop::Error, "propose_change_set patches exceed 256 KB total size limit"
          end

          {
            "path" => norm_path,
            "old_string" => old_s,
            "new_string" => new_s
          }
        end

        normalized
      end

      def validate_patch_path!(raw_path, allowed_globs: nil)
        path = raw_path.to_s.strip
        raise ContextDrop::Error, "Patch path is required" if path.empty?
        if path.match?(/[\r\n\0]/)
          raise ContextDrop::Error, "Invalid control character in patch path"
        end
        if path.start_with?("/", "\\") || path.match?(/\A[a-zA-Z]:/)
          raise ContextDrop::Error, "Patch path must be repository-relative: '#{path}'"
        end

        segments = path.split(%r{[\\/]+})
        if segments.empty? || segments.include?(".") && segments.size == 1 || segments.include?("..")
          raise ContextDrop::Error, "Patch path traversal denied: '#{path}'"
        end

        clean = segments.reject { |s| s.empty? || s == "." }.join("/")
        raise ContextDrop::Error, "Patch path is required" if clean.empty?

        if FORBIDDEN_PATCH_PATTERNS.any? { |re| re.match?(clean) }
          raise ContextDrop::Error, "Patch target '#{clean}' is protected by ContextDrop Build security policy"
        end

        globs = Array(allowed_globs).map { |g| g.to_s.strip }.reject(&:empty?)
        if globs.any? && !SafeRepoReader.path_allowed_by_globs?(clean, globs)
          raise ContextDrop::Error, "Patch target '#{clean}' is outside allowed Build globs"
        end

        clean
      end
    end
  end
end
