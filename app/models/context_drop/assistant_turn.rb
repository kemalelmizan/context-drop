# frozen_string_literal: true

module ContextDrop
  class AssistantTurn < ApplicationRecord
    self.table_name = "context_drop_assistant_turns"

    MODES = %w[ask build feedback].freeze

    belongs_to :change_set, class_name: "ContextDrop::ChangeSet", optional: true
    belongs_to :submitter, polymorphic: true, optional: true

    validates :mode, inclusion: { in: MODES }
  end
end