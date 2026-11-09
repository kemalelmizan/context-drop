# frozen_string_literal: true

class CreateContextDropElementReferences < ActiveRecord::Migration[7.1]
  def change
    json_type = connection.adapter_name.downcase.include?("postgres") ? :jsonb : :json

    create_table :context_drop_element_references do |t|
      t.references :feedback,
                   null: false,
                   foreign_key: { to_table: :context_drop_feedbacks, on_delete: :cascade },
                   index: { name: "idx_context_drop_element_refs_on_feedback_id" }
      t.string :client_ref, null: true
      t.string :tag_name, null: false
      t.string :selector, null: false
      t.string :dom_path, null: true
      t.text :text_content, null: true
      t.public_send(json_type, :attributes_snapshot, null: false, default: {})
      t.public_send(json_type, :bounding_rect, null: false, default: {})
      t.public_send(json_type, :viewport, null: false, default: {})
      t.public_send(json_type, :metadata, null: false, default: {})
      t.datetime :captured_at, null: true

      t.timestamps
    end

    add_index :context_drop_element_references, :selector
    add_index :context_drop_element_references, :tag_name
  end
end
