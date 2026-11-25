# frozen_string_literal: true

module ContextDrop
  module Assistant
    module BuildPack
      READ_TOOLS = [
        {
          name: "build_context_resolve",
          description: "Resolve page_url and element references to routes and allowed edit globs.",
          required: true
        },
        {
          name: "repo_read_file",
          description: "Read a repository file from an allowlisted path.",
          required: true
        },
        {
          name: "repo_search",
          description: "Search repository source with scoped query.",
          required: true
        },
        {
          name: "build_status_get",
          description: "Return CI/preview status for a change_set_id.",
          required: true
        }
      ].freeze

      WRITE_TOOLS = [
        { name: "git_create_branch", description: "Create feature branch from default base.", required: true },
        { name: "git_apply_patches", description: "Commit patches on the feature branch.", required: true },
        { name: "git_push_branch", description: "Push feature branch to remote.", required: true },
        { name: "pull_request_open", description: "Open a pull request.", required: true },
        { name: "change_set_abandon", description: "Abandon branch/PR for a change set.", required: true }
      ].freeze

      RESOURCES = [
        { uri: "host://build/policy", description: "Allowed paths and branch naming." },
        { uri: "host://build/repo", description: "Default branch and repository metadata." },
        { uri: "host://change_sets/{id}", description: "Branch, PR, checks, preview URL." }
      ].freeze
    end
  end
end