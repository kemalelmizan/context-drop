# frozen_string_literal: true

class CreateContextDropAttachments < ActiveRecord::Migration[7.1]
  def change
    json_type = connection.adapter_name.downcase.include?("postgres") ? :jsonb : :json

    create_table :context_drop_attachments do |t|
      t.references :feedback,
                   null: false,
                   foreign_key: { to_table: :context_drop_feedbacks, on_delete: :cascade },
                   index: { name: "idx_context_drop_attachments_on_feedback_id" }
      t.references :element_reference,
                   null: true,
                   foreign_key: { to_table: :context_drop_element_references, on_delete: :nullify },
                   index: { name: "idx_context_drop_attachments_on_element_ref_id" }
      t.string :attachment_type, null: false
      t.public_send(json_type, :metadata, null: false, default: {})

      t.timestamps
    end

    add_index :context_drop_attachments, :attachment_type
  end
end
