# frozen_string_literal: true

module ContextDrop
  class Attachment < ApplicationRecord
    self.table_name = "context_drop_attachments"

    ATTACHMENT_TYPES = %w[image screenshot file].freeze

    belongs_to :feedback,
               class_name: "ContextDrop::Feedback",
               inverse_of: :attachments

    belongs_to :element_reference,
               class_name: "ContextDrop::ElementReference",
               optional: true,
               inverse_of: :attachments

    has_one_attached :file if respond_to?(:has_one_attached)

    validates :attachment_type, presence: true, inclusion: { in: ATTACHMENT_TYPES }

    before_validation :normalize_metadata

    private

    def normalize_metadata
      self.metadata = {} unless metadata.is_a?(Hash)
    end
  end
end
