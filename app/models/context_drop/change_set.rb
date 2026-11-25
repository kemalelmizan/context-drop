# frozen_string_literal: true

module ContextDrop
  class ChangeSet < ApplicationRecord
    self.table_name = "context_drop_change_sets"

    STATUSES = %w[
      draft
      approved
      branch_pushed
      pr_open
      checks_running
      preview_ready
      merged
      deployed
      abandoned
    ].freeze

    belongs_to :feedback, class_name: "ContextDrop::Feedback", optional: true
    belongs_to :submitter, polymorphic: true, optional: true

    validates :status, inclusion: { in: STATUSES }

    def self.create_with_approval_token!(attrs = {})
      raw = SecureRandom.urlsafe_base64(32)
      record = create!(attrs.merge(approval_token_digest: digest_token(raw)))
      [record, raw]
    end

    def approve!(raw_token:)
      raise ContextDrop::Error, "Invalid approval token" unless secure_compare(raw_token, approval_token_digest)

      update!(status: "approved")
    end

    def store_patches!(patches)
      meta = metadata.is_a?(Hash) ? metadata.deep_dup : {}
      meta["patches"] = patches
      update!(metadata: meta)
    end

    def patches
      Array(metadata.is_a?(Hash) ? metadata["patches"] : nil)
    end

    def secure_compare(raw, digest)
      return false if raw.to_s.strip.empty? || digest.to_s.strip.empty?

      ActiveSupport::SecurityUtils.secure_compare(self.class.digest_token(raw), digest)
    end

    def as_widget_json
      {
        id: id,
        status: status,
        page_url: page_url,
        summary: summary,
        branch_name: branch_name,
        pr_url: pr_url,
        preview_url: preview_url,
        feedback_id: feedback_id,
        patches: patches,
        not_on_main: !%w[merged deployed].include?(status),
        created_at: created_at&.iso8601,
        updated_at: updated_at&.iso8601
      }
    end

    def self.digest_token(raw)
      secret = OwnershipToken.resolved_secret
      OpenSSL::HMAC.hexdigest("SHA256", secret, "cd_change_set:v1:#{raw}")
    end
  end
end