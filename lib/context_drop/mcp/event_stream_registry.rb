# frozen_string_literal: true

require "monitor"

module ContextDrop
  module MCP
    class EventStreamRegistry
      MAX_SUBSCRIBERS = 50
      MAX_QUEUE_DEPTH = 100

      class CapacityError < ContextDrop::Error; end

      @mutex = Monitor.new
      @subscribers = []

      class << self
        def create_queue!
          SizedQueue.new(MAX_QUEUE_DEPTH)
        end

        def subscribe(queue = nil)
          q = queue || create_queue!
          @mutex.synchronize do
            if @subscribers.size >= MAX_SUBSCRIBERS
              raise CapacityError, "Maximum concurrent MCP event stream subscribers reached"
            end

            @subscribers << q
          end
          q
        end

        def unsubscribe(queue)
          @mutex.synchronize { @subscribers.delete(queue) }
        end

        def subscriber_count
          @mutex.synchronize { @subscribers.size }
        end

        def reset!
          @mutex.synchronize { @subscribers.clear }
        end

        def broadcast(occurrence)
          payload = occurrence.occurrence_payload
          @mutex.synchronize do
            @subscribers.each do |queue|
              if queue.is_a?(SizedQueue)
                queue.push(payload, true)
              else
                queue << payload
              end
            rescue ThreadError, StandardError
              nil
            end
          end
        end
      end
    end
  end
end
