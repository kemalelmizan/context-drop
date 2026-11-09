# frozen_string_literal: true

class CreateContextDropFeedbacks < ActiveRecord::Migration[7.1]
  def change
    json_type = connection.adapter_name.downcase.include?("postgres") ? :jsonb : :json

    create_table :context_drop_feedbacks do |t|
      t.references :submitter, polymorphic: true, null: true, index: { name: "idx_context_drop_feedbacks_on_submitter" }
      t.string :session_id, null: true
      t.text :message, null: true
      t.string :page_url, null: false
      t.string :user_agent, null: true
      t.public_send(json_type, :metadata, null: false, default: {})
      t.string :status, null: false, default: "new"

      t.timestamps
    end

    add_index :context_drop_feedbacks, :status
    add_index :context_drop_feedbacks, :created_at
    add_index :context_drop_feedbacks, :page_url
  end
end
