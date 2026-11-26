# frozen_string_literal: true

module ContextDrop
  module Assistant
    class BuildExecutor
      def initialize(registry: ToolRegistry.new, change_set:)
        @registry = registry
        @change_set = change_set
      end

      def execute_after_approval!
        target = ContextDrop.config.build_target_hash
        branch = branch_name

        result_branch = invoke_write!("git_create_branch", {
          "change_set_id" => @change_set.id,
          "branch_name" => branch,
          "base_branch" => target["default_base_branch"] || "main"
        })

        return error_result(result_branch) if result_branch[:is_error]

        @change_set.update!(branch_name: branch, status: "branch_pushed")

        patch_result = invoke_write!("git_apply_patches", {
          "change_set_id" => @change_set.id,
          "branch_name" => branch,
          "patches" => @change_set.patches
        })
        return error_result(patch_result) if patch_result[:is_error]

        push_result = invoke_write!("git_push_branch", {
          "change_set_id" => @change_set.id,
          "branch_name" => branch
        })
        return error_result(push_result) if push_result[:is_error]

        pr_result = invoke_write!("pull_request_open", {
          "change_set_id" => @change_set.id,
          "branch_name" => branch,
          "title" => pr_title,
          "body" => pr_body
        })
        return error_result(pr_result) if pr_result[:is_error]

        raw_pr_url = pr_result.dig(:data, "pr_url") || pr_result.dig(:data, :pr_url)
        pr_url = ContextDrop::UrlSafety.safe_external_http_url(raw_pr_url)
        @change_set.update!(
          status: "pr_open",
          pr_url: pr_url,
          summary: @change_set.summary.presence || pr_title
        )

        refresh_status!

        { change_set: @change_set.reload.as_widget_json, is_error: false }
      end

      def refresh_status!
        res = @registry.call_tool!("build", "build_status_get", {
          "change_set_id" => @change_set.id
        }, allow_write: false)

        return @change_set if res[:is_error]

        data = res[:data].is_a?(Hash) ? res[:data].transform_keys(&:to_s) : {}
        status = data["status"].to_s.presence
        preview = ContextDrop::UrlSafety.safe_external_http_url(data["preview_url"])

        attrs = {}
        attrs[:status] = status if status && ChangeSet::STATUSES.include?(status)
        attrs[:preview_url] = preview if preview
        @change_set.update!(attrs) if attrs.any?
        @change_set
      end

      private

      def error_result(res)
        msg = res[:error].to_s
        msg = res.dig(:data, :error).to_s if msg.empty? && res[:data].is_a?(Hash)
        msg = "Build tool failed" if msg.empty?
        { is_error: true, error: msg }
      end

      def branch_name
        existing = @change_set.branch_name.to_s.strip
        return existing unless existing.empty?

        stamp = Time.current.utc.strftime("%Y%m%d")
        "context-drop/#{@change_set.id}-#{stamp}"
      end

      def pr_title
        @change_set.summary.to_s.strip.presence || "ContextDrop change set ##{@change_set.id}"
      end

      def pr_body
        <<~BODY.strip
          Automated change proposed via ContextDrop Build mode.

          Page: #{@change_set.page_url}
          Change set: ##{@change_set.id}

          **Not merged to main** — review CI and merge when ready.
        BODY
      end

      def invoke_write!(name, args)
        @registry.call_tool!("build", name, args, allow_write: true).tap do |res|
          return res if res[:is_error]
        end
      end
    end
  end
end