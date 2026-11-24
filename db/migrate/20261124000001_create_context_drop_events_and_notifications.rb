# frozen_string_literal: true

class CreateContextDropEventsAndNotifications < ActiveRecord::Migration[7.1]
  def change
    create_table :context_drop_event_occurrences do |t|
      t.string :event_id, null: false
      t.string :name, null: false
      t.bigint :feedback_id
      t.json :data, null: false, default: {}
      t.datetime :occurred_at, null: false
      t.timestamps
    end
    add_index :context_drop_event_occurrences, :event_id, unique: true
    add_index :context_drop_event_occurrences, %i[name occurred_at id], name: "idx_cd_events_name_time"
    add_index :context_drop_event_occurrences, :feedback_id

    create_table :context_drop_notification_destinations do |t|
      t.string :name, null: false
      t.boolean :enabled, null: false, default: true
      t.string :destination_type, null: false
      t.json :event_types, null: false, default: []
      t.json :settings, null: false, default: {}
      t.text :secrets_ciphertext
      t.string :last_delivery_status
      t.text :last_delivery_error
      t.datetime :last_delivered_at
      t.timestamps
    end
    add_index :context_drop_notification_destinations, :enabled
    add_index :context_drop_notification_destinations, :destination_type, name: "idx_cd_notif_dest_type"

    create_table :context_drop_mcp_event_subscriptions do |t|
      t.string :subscription_id, null: false
      t.string :event_name, null: false
      t.json :arguments, null: false, default: {}
      t.string :callback_url, null: false
      t.string :signing_secret, null: false
      t.string :delivery_mode, null: false, default: "webhook"
      t.datetime :expires_at, null: false
      t.string :last_cursor
      t.timestamps
    end
    add_index :context_drop_mcp_event_subscriptions, :subscription_id, unique: true
    add_index :context_drop_mcp_event_subscriptions, :expires_at
    add_index :context_drop_mcp_event_subscriptions, :event_name
  end
end