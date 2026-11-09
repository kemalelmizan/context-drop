# frozen_string_literal: true

require "json"
begin
  require "logger"
rescue LoadError
  # Logger gem is optional outside full Rails environment
end

module ContextDrop
  module MCP
    class StdioRunner
      def initialize(input: $stdin, output: $stdout, error: $stderr)
        @input = input
        @output = output
        @error = error
      end

      def run
        isolate_stdio_logging!
        @output.sync = true if @output.respond_to?(:sync=)

        while (line = @input.gets)
          stripped = line.strip
          next if stripped.empty?

          response = process_line(stripped)
          next if response.nil?

          @output.puts(JSON.generate(response))
          @output.flush if @output.respond_to?(:flush)
        end
      end

      def process_line(line)
        parsed = JSON.parse(line)
        ContextDrop::MCP::Dispatcher.call(parsed)
      rescue JSON::ParserError => e
        {
          jsonrpc: "2.0",
          id: nil,
          error: {
            code: -32_700,
            message: "Parse error: #{e.message}"
          }
        }
      end

      private

      def isolate_stdio_logging!
        return unless defined?(Logger)

        stderr_logger = Logger.new(@error)
        stderr_logger.level = ENV["CONTEXT_DROP_MCP_DEBUG"] == "1" ? Logger::DEBUG : Logger::WARN

        Rails.logger = stderr_logger if defined?(Rails) && Rails.respond_to?(:logger=)
        ActiveRecord::Base.logger = stderr_logger if defined?(ActiveRecord::Base) && ActiveRecord::Base.respond_to?(:logger=)
      end
    end
  end
end
