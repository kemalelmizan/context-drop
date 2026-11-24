# frozen_string_literal: true

require "monitor"

module ContextDrop
  module MCP
    class EventStreamRegistry
      @mutex = Monitor.new
      @subscribers = []

      class << self
        def subscribe(queue)
          @mutex.synchronize { @subscribers << queue }
          queue
        end

        def unsubscribe(queue)
          @mutex.synchronize { @subscribers.delete(queue) }
        end

        def broadcast(occurrence)
          payload = occurrence.occurrence_payload
          @mutex.synchronize do
            @subscribers.each do |queue|
              queue << payload
            rescue StandardError
              nil
            end
          end
        end
      end
    end
  end
end