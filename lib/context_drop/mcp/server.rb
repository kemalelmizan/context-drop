# frozen_string_literal: true

require_relative "tools/list_feedbacks"
require_relative "tools/get_feedback"
require_relative "tools/get_feedback_attachment"
require_relative "tools/update_feedback_status"
require_relative "prompts/investigate_feedback"
require_relative "dispatcher"
require_relative "stdio_runner"

module ContextDrop
  module MCP
    class Server
      class << self
        def handle_http_payload(payload)
          Dispatcher.call(payload)
        end

        def run_stdio(input: $stdin, output: $stdout, error: $stderr)
          StdioRunner.new(input: input, output: output, error: error).run
        end
      end
    end
  end
end
