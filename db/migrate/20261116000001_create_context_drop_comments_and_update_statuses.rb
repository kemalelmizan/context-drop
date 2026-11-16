# frozen_string_literal: true

class CreateContextDropCommentsAndUpdateStatuses < ActiveRecord::Migration[7.1]
  def up
    json_type = connection.adapter_name.downcase.include?("postgres") ? :jsonb : :json

    create_table :context_drop_comments do |t|
      t.references :feedback,
                   null: false,
                   foreign_key: { to_table: :context_drop_feedbacks, on_delete: :cascade },
                   index: { name: "idx_context_drop_comments_on_feedback_id" }
      t.string :author_type, null: true
      t.string :author_id, null: true
      t.string :author_label, null: true
      t.text :body, null: true
      t.public_send(json_type, :metadata, null: false, default: {})

      t.timestamps
    end

    add_reference :context_drop_attachments,
                  :comment,
                  null: true,
                  foreign_key: { to_table: :context_drop_comments, on_delete: :cascade },
                  index: { name: "idx_context_drop_attachments_on_comment_id" }

    execute <<~SQL.squish
      UPDATE context_drop_feedbacks
      SET status = 'fixed'
      WHERE status = 'resolved'
    SQL
  end

  def down
    execute <<~SQL.squish
      UPDATE context_drop_feedbacks
      SET status = 'resolved'
      WHERE status = 'fixed'
    SQL

    remove_reference :context_drop_attachments, :comment, foreign_key: { to_table: :context_drop_comments }
    drop_table :context_drop_comments
  end
end
