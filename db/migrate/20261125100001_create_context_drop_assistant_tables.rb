# frozen_string_literal: true

class CreateContextDropAssistantTables < ActiveRecord::Migration[7.1]
  def change
    create_table :context_drop_change_sets do |t|
      t.string :status, null: false, default: "draft"
      t.string :page_url
      t.text :summary
      t.string :branch_name
      t.string :pr_url
      t.string :preview_url
      t.json :metadata, null: false, default: {}
      t.string :session_id
      t.string :approval_token_digest
      t.references :feedback, null: true, foreign_key: { to_table: :context_drop_feedbacks, on_delete: :nullify }
      t.references :submitter, polymorphic: true, null: true, index: true
      t.timestamps
    end

    add_index :context_drop_change_sets, :status
    add_index :context_drop_change_sets, :session_id

    create_table :context_drop_assistant_turns do |t|
      t.string :mode, null: false
      t.string :session_id
      t.string :provider
      t.string :model
      t.json :tool_names, null: false, default: []
      t.references :change_set, null: true, foreign_key: { to_table: :context_drop_change_sets, on_delete: :nullify }
      t.references :submitter, polymorphic: true, null: true, index: true
      t.integer :duration_ms
      t.timestamps
    end

    add_index :context_drop_assistant_turns, :mode
    add_index :context_drop_assistant_turns, :session_id
  end
end