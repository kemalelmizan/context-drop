# frozen_string_literal: true

namespace :context_drop do
  desc "Start the ContextDrop Model Context Protocol (MCP) server over stdio"
  task :mcp do
    # Reserve original STDOUT strictly for MCP JSON-RPC frames while loading the Rails environment
    mcp_stdout = $stdout.dup
    $stdout.reopen($stderr)

    Rake::Task["environment"].invoke if Rake::Task.task_defined?("environment")

    ContextDrop::MCP::Server.run_stdio(input: $stdin, output: mcp_stdout, error: $stderr)
  end
end
