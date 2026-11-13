# frozen_string_literal: true

module ContextDrop
  class Feedback < ApplicationRecord
    self.table_name = "context_drop_feedbacks"

    STATUSES = %w[new reviewed resolved dismissed].freeze

    belongs_to :submitter, polymorphic: true, optional: true

    has_many :element_references,
             class_name: "ContextDrop::ElementReference",
             foreign_key: :feedback_id,
             inverse_of: :feedback,
             dependent: :destroy

    has_many :attachments,
             class_name: "ContextDrop::Attachment",
             foreign_key: :feedback_id,
             inverse_of: :feedback,
             dependent: :destroy

    scope :active, lambda {
      column_names.include?("deleted_at") ? where(deleted_at: nil) : all
    }
    scope :deleted, lambda {
      column_names.include?("deleted_at") ? where.not(deleted_at: nil) : none
    }
    scope :new_records, -> { active.where(status: "new") }
    scope :reviewed, -> { active.where(status: "reviewed") }
    scope :resolved, -> { active.where(status: "resolved") }
    scope :dismissed, -> { active.where(status: "dismissed") }
    scope :recent, -> { order(created_at: :desc, id: :desc) }
    scope :for_environment, lambda { |env|
      normalized = env.to_s.strip.downcase
      if normalized.present? && column_names.include?("environment")
        where(environment: normalized)
      else
        all
      end
    }

    validates :page_url, presence: true
    validates :status, presence: true, inclusion: { in: STATUSES }
    validate :ensure_content_or_context_present
    validate :ensure_collection_limits

    before_validation :normalize_defaults

    def mark_reviewed!
      update!(status: "reviewed")
    end

    def mark_resolved!
      update!(status: "resolved")
    end

    def mark_dismissed!
      update!(status: "dismissed")
    end

    def deleted?
      if has_attribute?(:deleted_at)
        !self[:deleted_at].nil?
      elsif metadata.is_a?(Hash)
        metadata["deleted_at"].present?
      else
        false
      end
    end

    def deleted_at_value
      if has_attribute?(:deleted_at)
        self[:deleted_at]
      elsif metadata.is_a?(Hash) && metadata["deleted_at"].present?
        begin
          Time.iso8601(metadata["deleted_at"].to_s)
        rescue ArgumentError
          nil
        end
      end
    end

    def soft_delete!(timestamp = Time.current)
      if has_attribute?(:deleted_at)
        update_columns(deleted_at: timestamp, updated_at: timestamp)
        self[:deleted_at] = timestamp
        self[:updated_at] = timestamp
      else
        next_meta = (metadata.is_a?(Hash) ? metadata.dup : {}).merge("deleted_at" => timestamp.utc.iso8601)
        update_columns(metadata: next_meta, updated_at: timestamp)
        self[:metadata] = next_meta
        self[:updated_at] = timestamp
      end
      true
    end

    def restore!
      now = Time.current
      if has_attribute?(:deleted_at)
        update_columns(deleted_at: nil, updated_at: now)
        self[:deleted_at] = nil
        self[:updated_at] = now
      elsif metadata.is_a?(Hash)
        next_meta = metadata.except("deleted_at")
        update_columns(metadata: next_meta, updated_at: now)
        self[:metadata] = next_meta
        self[:updated_at] = now
      end
      true
    end

    def environment_name
      if has_attribute?(:environment) && self[:environment].present?
        self[:environment].to_s
      elsif metadata.is_a?(Hash) && metadata["environment"].present?
        metadata["environment"].to_s
      else
        ContextDrop.config.resolved_environment
      end
    end

    def submitter_label
      return "Anonymous" if submitter_type.blank? && submitter_id.blank?

      target_submitter = begin
        submitter
      rescue NameError
        nil
      end

      if target_submitter
        if target_submitter.respond_to?(:email) && target_submitter.email.present?
          "#{submitter_type}##{submitter_id} (#{target_submitter.email})"
        elsif target_submitter.respond_to?(:name) && target_submitter.name.present?
          "#{submitter_type}##{submitter_id} (#{target_submitter.name})"
        else
          "#{submitter_type}##{submitter_id}"
        end
      else
        "#{submitter_type}##{submitter_id}"
      end
    end

    private

    def normalize_defaults
      self.status = "new" if status.blank?
      self.metadata = {} unless metadata.is_a?(Hash)
      resolved_env = ContextDrop.config.resolved_environment
      if has_attribute?(:environment) && self[:environment].blank?
        self[:environment] = resolved_env
      end
      self.metadata["environment"] ||= resolved_env
    end

    def ensure_content_or_context_present
      has_message = message.to_s.strip != ""
      has_attachments = attachments.reject(&:marked_for_destruction?).any?
      has_elements = element_references.reject(&:marked_for_destruction?).any?

      return if has_message || has_attachments || has_elements

      errors.add(:base, "Feedback must include a message, an attachment, or a selected DOM element")
    end

    def ensure_collection_limits
      max_att = ContextDrop.config.max_attachments.to_i
      max_el = ContextDrop.config.max_element_references.to_i

      if attachments.reject(&:marked_for_destruction?).size > max_att
        errors.add(:attachments, "exceeds maximum allowed (#{max_att})")
      end

      return unless element_references.reject(&:marked_for_destruction?).size > max_el

      errors.add(:element_references, "exceeds maximum allowed (#{max_el})")
    end
  end
end
