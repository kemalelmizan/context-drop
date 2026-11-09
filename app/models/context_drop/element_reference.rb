# frozen_string_literal: true

module ContextDrop
  class ElementReference < ApplicationRecord
    self.table_name = "context_drop_element_references"

    belongs_to :feedback,
               class_name: "ContextDrop::Feedback",
               inverse_of: :element_references

    has_many :attachments,
             class_name: "ContextDrop::Attachment",
             foreign_key: :element_reference_id,
             dependent: :nullify,
             inverse_of: :element_reference

    validates :tag_name, presence: true
    validates :selector, presence: true
    validate :validate_bounding_rect

    before_validation :normalize_fields

    private

    def normalize_fields
      self.tag_name = tag_name.to_s.strip.downcase if tag_name.present?
      self.attributes_snapshot = {} unless attributes_snapshot.is_a?(Hash)
      self.bounding_rect = {} unless bounding_rect.is_a?(Hash)
      self.viewport = {} unless viewport.is_a?(Hash)
      self.metadata = {} unless metadata.is_a?(Hash)
    end

    def validate_bounding_rect
      unless bounding_rect.is_a?(Hash) && bounding_rect.any?
        errors.add(:bounding_rect, "must be a non-empty coordinate hash")
        return
      end

      required_keys = %w[x y width height]
      stringified_keys = bounding_rect.keys.map(&:to_s)
      missing = required_keys - stringified_keys
      return if missing.empty?

      errors.add(:bounding_rect, "is missing required keys: #{missing.join(', ')}")
    end
  end
end
