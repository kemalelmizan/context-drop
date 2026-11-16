# frozen_string_literal: true

module ContextDrop
  class Comment < ApplicationRecord
    self.table_name = "context_drop_comments"

    belongs_to :feedback,
               class_name: "ContextDrop::Feedback",
               inverse_of: :comments

    has_many :attachments,
             class_name: "ContextDrop::Attachment",
             foreign_key: :comment_id,
             inverse_of: :comment,
             dependent: :destroy

    validate :ensure_body_or_attachments_present
    validate :ensure_attachments_limit

    before_validation :normalize_metadata

    def display_author_label
      return author_label.to_s if author_label.present?
      return "#{author_type}##{author_id}" if author_type.present? && author_id.present?

      "Submitter"
    end

    private

    def normalize_metadata
      self.metadata = {} unless metadata.is_a?(Hash)
    end

    def ensure_body_or_attachments_present
      has_body = body.to_s.strip != ""
      has_attachments = attachments.reject(&:marked_for_destruction?).any?
      return if has_body || has_attachments

      errors.add(:base, "Comment must include text or an image attachment")
    end

    def ensure_attachments_limit
      max_att = ContextDrop.config.max_attachments.to_i
      return unless attachments.reject(&:marked_for_destruction?).size > max_att

      errors.add(:attachments, "exceeds maximum allowed (#{max_att})")
    end
  end
end
