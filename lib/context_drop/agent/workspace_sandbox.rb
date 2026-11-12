# frozen_string_literal: true

require "digest"
require "fileutils"
require "securerandom"

module ContextDrop
  module Agent
    class WorkspaceSandbox
      class SandboxError < ContextDrop::Error; end

      MAX_FILE_BYTES = 256 * 1024 # 256 KB
      MAX_STAGED_EDITS = 100

      BLOCKED_RELATIVE_PATTERNS = [
        %r{\A\.git(?:/|\z)}i,
        %r{(?:^|/)\.env(?:\.(?!example\z|sample\z|template\z)[^/]+)?\z}i,
        %r{\Aconfig/master\.key\z}i,
        %r{\Aconfig/credentials(?:/|\.yml\.enc\z)}i,
        %r{\Atmp/context_drop_}i,
        %r{\.(?:pem|key|p12|pfx|jks|sqlite3|db)\z}i,
        %r{(?:^|/)id_(?:rsa|ed25519|ecdsa|dsa)}i,
        %r{\A(?:node_modules|vendor/bundle|vendor/cache|storage|log|tmp/cache|pkg)(?:/|\z)}i
      ].freeze

      SKIPPED_DIR_NAMES = %w[
        .git
        node_modules
        vendor
        storage
        log
        tmp
        pkg
        coverage
        .bundle
      ].freeze

      @edits_mutex = Mutex.new
      @staged_edits = {}

      class << self
        def staged_edits_store
          @staged_edits
        end

        def edits_mutex
          @edits_mutex
        end

        def clear_staged_edits!
          @edits_mutex.synchronize { @staged_edits.clear }
        end
      end

      attr_reader :root_realpath

      def initialize(workspace_root = nil)
        raw_root = (workspace_root || ContextDrop.config.resolved_workspace_root).to_s
        raise SandboxError, "Workspace root does not exist" unless Dir.exist?(raw_root)

        @root_realpath = File.realpath(raw_root)
      end

      def resolve_safe_path!(relative_path, allow_nonexistent: false)
        raw = relative_path.to_s.strip
        raise SandboxError, "File path is required" if raw.empty?
        raise SandboxError, "Invalid null byte in path" if raw.include?("\0")

        cleaned = raw.sub(%r{\A/+}, "")
        expanded = File.expand_path(cleaned, @root_realpath)
        ensure_inside_root!(expanded)

        rel_from_root = strip_root_prefix(expanded)
        ensure_not_denylisted!(rel_from_root)

        if File.exist?(expanded) || File.symlink?(expanded)
          real = File.realpath(expanded)
          ensure_inside_root!(real)
          real_rel = strip_root_prefix(real)
          ensure_not_denylisted!(real_rel)
          [real, real_rel]
        elsif allow_nonexistent
          parent = find_existing_ancestor(File.dirname(expanded))
          real_parent = File.realpath(parent)
          ensure_inside_root!(real_parent)
          remainder = expanded.delete_prefix(parent).sub(%r{\A/+}, "")
          target_abs = remainder.empty? ? real_parent : File.join(real_parent, remainder)
          ensure_inside_root!(target_abs)
          target_rel = strip_root_prefix(target_abs)
          ensure_not_denylisted!(target_rel)
          [target_abs, target_rel]
        else
          raise SandboxError, "File not found: #{rel_from_root}"
        end
      end

      def list_files(directory: ".", pattern: nil, limit: 200)
        abs_dir, _rel_dir = if directory.to_s.strip.empty? || directory.to_s.strip == "."
                              [@root_realpath, "."]
                            else
                              resolve_safe_path!(directory)
                            end
        raise SandboxError, "Not a directory: #{directory}" unless File.directory?(abs_dir)

        capped_limit = limit.to_i.clamp(1, 500)
        results = []
        matcher = pattern.to_s.strip.empty? ? nil : pattern.to_s.strip

        walk_workspace(abs_dir) do |abs_file, rel_file|
          if matcher
            next unless File.fnmatch?(matcher, rel_file, File::FNM_PATHNAME | File::FNM_EXTGLOB) ||
                        File.fnmatch?(matcher, File.basename(rel_file), File::FNM_EXTGLOB) ||
                        rel_file.include?(matcher)
          end

          results << rel_file
          break if results.size >= capped_limit
        end

        { files: results.sort, truncated: results.size >= capped_limit }
      end

      def read_file(path:, start_line: 1, end_line: 250)
        abs_path, rel_path = resolve_safe_path!(path)
        raise SandboxError, "Cannot read directory as file: #{rel_path}" if File.directory?(abs_path)

        size = File.size(abs_path)
        if size > MAX_FILE_BYTES
          raise SandboxError, "File #{rel_path} exceeds 256 KB safety limit (#{size} bytes)"
        end

        raw = File.binread(abs_path)
        raise SandboxError, "Binary file cannot be read as text: #{rel_path}" if binary_bytes?(raw)

        text = raw.force_encoding("UTF-8")
        text = text.encode("UTF-8", invalid: :replace, undef: :replace) unless text.valid_encoding?

        lines = text.lines
        total = lines.size
        s_line = [start_line.to_i, 1].max
        e_line = [end_line.to_i, s_line].max
        e_line = [e_line, s_line + 399, [total, 1].max].min

        slice = total.zero? ? [] : (lines[(s_line - 1)..(e_line - 1)] || [])
        numbered = slice.each_with_index.map do |line, idx|
          "#{s_line + idx}: #{line.chomp}"
        end.join("\n")

        {
          path: rel_path,
          total_lines: total,
          start_line: s_line,
          end_line: total.zero? ? 0 : [e_line, total].min,
          content: numbered
        }
      end

      def search_code(query:, directory: ".", max_results: 40)
        q = query.to_s
        raise SandboxError, "Search query cannot be empty" if q.strip.empty?

        abs_dir, _rel = if directory.to_s.strip.empty? || directory.to_s.strip == "."
                          [@root_realpath, "."]
                        else
                          resolve_safe_path!(directory)
                        end
        raise SandboxError, "Not a directory: #{directory}" unless File.directory?(abs_dir)

        capped = max_results.to_i.clamp(1, 100)
        matches = []
        down_q = q.downcase

        walk_workspace(abs_dir) do |abs_file, rel_file|
          next if File.size(abs_file) > MAX_FILE_BYTES

          raw = File.binread(abs_file)
          next if binary_bytes?(raw)

          text = raw.force_encoding("UTF-8")
          next unless text.valid_encoding?

          text.each_line.with_index(1) do |line, line_num|
            next unless line.downcase.include?(down_q)

            matches << {
              path: rel_file,
              line: line_num,
              snippet: line.chomp.strip[0, 220]
            }
            break if matches.size >= capped
          end
          break if matches.size >= capped
        end

        { query: q, matches: matches, truncated: matches.size >= capped }
      end

      # Stages a proposed file edit WITHOUT modifying disk. Requires explicit human approval via `apply_edit!`.
      def stage_edit(path:, old_string:, new_string:, summary: nil)
        old_s = old_string.to_s
        new_s = new_string.to_s
        creating_new = old_s.empty?

        abs_path, rel_path = resolve_safe_path!(path, allow_nonexistent: creating_new)
        raise SandboxError, "Cannot edit a directory: #{rel_path}" if File.directory?(abs_path)

        if File.exist?(abs_path)
          size = File.size(abs_path)
          raise SandboxError, "File #{rel_path} exceeds 256 KB limit" if size > MAX_FILE_BYTES

          raw = File.binread(abs_path)
          raise SandboxError, "Binary file cannot be edited: #{rel_path}" if binary_bytes?(raw)

          original_content = raw.force_encoding("UTF-8")
          raise SandboxError, "File #{rel_path} is not valid UTF-8" unless original_content.valid_encoding?

          if creating_new
            raise SandboxError, "File #{rel_path} already exists; provide `old_string` with exact context lines to replace."
          end

          occurrences = count_exact_occurrences(original_content, old_s)
          if occurrences.zero?
            raise SandboxError, "Could not find exact `old_string` match in #{rel_path}. Read the file first to verify exact whitespace."
          elsif occurrences > 1
            raise SandboxError, "`old_string` matched #{occurrences} places in #{rel_path}; include more surrounding context lines."
          end

          proposed_content = original_content.sub(old_s) { new_s }
          original_sha = Digest::SHA256.hexdigest(original_content)
        else
          raise SandboxError, "File #{rel_path} does not exist" unless creating_new

          original_content = ""
          proposed_content = new_s
          original_sha = "NEW_FILE"
        end

        if proposed_content.bytesize > MAX_FILE_BYTES
          raise SandboxError, "Proposed content exceeds 256 KB limit"
        end

        diff_info = build_unified_diff(rel_path, original_content, proposed_content, is_new: original_sha == "NEW_FILE")
        edit_id = "edit_#{SecureRandom.hex(8)}"

        record = {
          id: edit_id,
          workspace_root: @root_realpath,
          path: rel_path,
          summary: summary.to_s.strip.empty? ? "Update #{rel_path}" : summary.to_s.strip,
          is_new_file: original_sha == "NEW_FILE",
          original_sha256: original_sha,
          original_content: original_content,
          proposed_content: proposed_content,
          applied_sha256: nil,
          diff: diff_info[:diff],
          added_lines: diff_info[:added],
          removed_lines: diff_info[:removed],
          status: "pending",
          created_at: Time.now.utc.iso8601
        }

        self.class.edits_mutex.synchronize do
          store = self.class.staged_edits_store
          store.shift while store.size >= MAX_STAGED_EDITS
          store[edit_id] = record
        end

        serialize_edit_record(record)
      end

      def apply_edit!(edit_id)
        record = fetch_workspace_edit!(edit_id)
        unless record[:status] == "pending"
          raise SandboxError, "Edit #{edit_id} cannot be applied (current status: #{record[:status]})"
        end

        abs_path, _rel = resolve_safe_path!(record[:path], allow_nonexistent: record[:is_new_file])

        if record[:is_new_file]
          if File.exist?(abs_path)
            raise SandboxError, "Conflict: #{record[:path]} was created after this edit was proposed"
          end
        else
          raise SandboxError, "Conflict: #{record[:path]} no longer exists" unless File.exist?(abs_path)

          current_content = File.binread(abs_path).force_encoding("UTF-8")
          current_sha = Digest::SHA256.hexdigest(current_content)
          if current_sha != record[:original_sha256]
            raise SandboxError, "Conflict: #{record[:path]} has been modified on disk since this diff was proposed"
          end
        end

        atomic_write_text!(abs_path, record[:proposed_content])
        self.class.edits_mutex.synchronize do
          record[:applied_sha256] = Digest::SHA256.hexdigest(record[:proposed_content])
          record[:status] = "applied"
          record[:applied_at] = Time.now.utc.iso8601
        end

        serialize_edit_record(record)
      end

      def reject_edit!(edit_id)
        record = fetch_workspace_edit!(edit_id)
        unless record[:status] == "pending"
          raise SandboxError, "Edit #{edit_id} is already #{record[:status]}"
        end

        self.class.edits_mutex.synchronize do
          record[:status] = "rejected"
        end
        serialize_edit_record(record)
      end

      def revert_edit!(edit_id)
        record = fetch_workspace_edit!(edit_id)
        unless record[:status] == "applied"
          raise SandboxError, "Only applied edits can be reverted (current status: #{record[:status]})"
        end

        abs_path, _rel = resolve_safe_path!(record[:path], allow_nonexistent: false)
        current_content = File.binread(abs_path).force_encoding("UTF-8")
        current_sha = Digest::SHA256.hexdigest(current_content)

        if current_sha != record[:applied_sha256]
          raise SandboxError, "Conflict: #{record[:path]} was modified again after applying; refusing to overwrite"
        end

        if record[:is_new_file]
          File.delete(abs_path)
        else
          atomic_write_text!(abs_path, record[:original_content])
        end

        self.class.edits_mutex.synchronize do
          record[:status] = "reverted"
        end

        serialize_edit_record(record)
      end

      private

      def fetch_workspace_edit!(edit_id)
        rec = self.class.edits_mutex.synchronize { self.class.staged_edits_store[edit_id.to_s] }
        raise SandboxError, "Edit proposal '#{edit_id}' not found or expired" unless rec
        if rec[:workspace_root] != @root_realpath
          raise SandboxError, "Edit proposal belongs to a different workspace"
        end

        rec
      end

      def serialize_edit_record(rec)
        {
          id: rec[:id],
          path: rec[:path],
          summary: rec[:summary],
          is_new_file: rec[:is_new_file],
          diff: rec[:diff],
          added_lines: rec[:added_lines],
          removed_lines: rec[:removed_lines],
          status: rec[:status],
          created_at: rec[:created_at]
        }
      end

      def atomic_write_text!(abs_path, content)
        dir = File.dirname(abs_path)
        FileUtils.mkdir_p(dir)
        mode = File.exist?(abs_path) ? (File.stat(abs_path).mode & 0o777) : 0o644
        tmp = File.join(dir, ".cd_edit_#{SecureRandom.hex(6)}.tmp")
        File.open(tmp, File::WRONLY | File::CREAT | File::TRUNC, mode) do |f|
          f.write(content)
        end
        File.rename(tmp, abs_path)
      end

      def count_exact_occurrences(haystack, needle)
        count = 0
        idx = 0
        while (found = haystack.index(needle, idx))
          count += 1
          idx = found + [needle.length, 1].max
        end
        count
      end

      def build_unified_diff(rel_path, before_text, after_text, is_new: false)
        old_lines = before_text.lines.map(&:chomp)
        new_lines = after_text.lines.map(&:chomp)

        prefix = 0
        while prefix < old_lines.size && prefix < new_lines.size && old_lines[prefix] == new_lines[prefix]
          prefix += 1
        end

        old_suffix = old_lines.size - 1
        new_suffix = new_lines.size - 1
        while old_suffix >= prefix && new_suffix >= prefix && old_lines[old_suffix] == new_lines[new_suffix]
          old_suffix -= 1
          new_suffix -= 1
        end

        removed = prefix <= old_suffix ? old_lines[prefix..old_suffix] : []
        added = prefix <= new_suffix ? new_lines[prefix..new_suffix] : []

        ctx_before_start = [prefix - 3, 0].max
        ctx_before = prefix.positive? ? old_lines[ctx_before_start...prefix] : []
        ctx_after = (old_suffix + 1) < old_lines.size ? old_lines[(old_suffix + 1)..[old_suffix + 3, old_lines.size - 1].min] : []

        old_start = is_new ? 0 : ctx_before_start + 1
        new_start = ctx_before_start + 1
        old_len = is_new ? 0 : (ctx_before.size + removed.size + ctx_after.size)
        new_len = ctx_before.size + added.size + ctx_after.size

        header = [
          "--- #{is_new ? '/dev/null' : "a/#{rel_path}"}",
          "+++ b/#{rel_path}",
          "@@ -#{old_start},#{old_len} +#{new_start},#{new_len} @@"
        ]

        body = []
        ctx_before.each { |l| body << " #{l}" }
        removed.each { |l| body << "-#{l}" }
        added.each { |l| body << "+#{l}" }
        ctx_after.each { |l| body << " #{l}" }

        {
          diff: (header + body).join("\n"),
          added: added.size,
          removed: removed.size
        }
      end

      def walk_workspace(start_dir, &block)
        queue = [start_dir]
        until queue.empty?
          current_dir = queue.shift
          entries = Dir.children(current_dir).sort
          entries.each do |entry|
            full = File.join(current_dir, entry)
            next if File.symlink?(full)

            rel = strip_root_prefix(full)
            if File.directory?(full)
              next if SKIPPED_DIR_NAMES.include?(entry)
              next if denylisted?(rel)

              queue << full
            elsif File.file?(full)
              next if denylisted?(rel)

              block.call(full, rel)
            end
          end
        end
      end

      def binary_bytes?(raw)
        sample = raw.byteslice(0, 4096) || ""
        sample.include?("\0")
      end

      def find_existing_ancestor(dir)
        curr = dir
        while !File.exist?(curr) && curr != "/" && curr != "."
          parent = File.dirname(curr)
          break if parent == curr

          curr = parent
        end
        curr
      end

      def ensure_inside_root!(path_str)
        return if path_str == @root_realpath || path_str.start_with?("#{@root_realpath}/")

        raise SandboxError, "Access denied: path escapes workspace root"
      end

      def strip_root_prefix(abs_path)
        return "." if abs_path == @root_realpath

        abs_path.delete_prefix("#{@root_realpath}/")
      end

      def denylisted?(rel_path)
        BLOCKED_RELATIVE_PATTERNS.any? { |re| re.match?(rel_path) }
      end

      def ensure_not_denylisted!(rel_path)
        return unless denylisted?(rel_path)

        raise SandboxError, "Access denied: '#{rel_path}' is protected by ContextDrop security policy"
      end
    end
  end
end
