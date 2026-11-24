# frozen_string_literal: true

module ContextDrop
  class EventOccurrence < ApplicationRecord
    self.table_name = "context_drop_event_occurrences"

    EVENT_NAMES = %w[
      feedback.created
      feedback.updated
      feedback.status_changed
      feedback.deleted
    ].freeze

    validates :event_id, :name, :occurred_at, presence: true
    validates :name, inclusion: { in: EVENT_NAMES }

    scope :chronological, -> { order(occurred_at: :asc, id: :asc) }
    scope :named, ->(event_name) { where(name: event_name) }

    def cursor
      id.to_s
    end

    def occurrence_payload
      {
        eventId: event_id,
        name: name,
        timestamp: occurred_at.iso8601(3),
        cursor: cursor,
        data: data.is_a?(Hash) ? data : {}
      }
    end
  end
end