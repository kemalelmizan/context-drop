# frozen_string_literal: true

class AddDeletedAtToContextDropFeedbacks < ActiveRecord::Migration[7.1]
  def change
    return if column_exists?(:context_drop_feedbacks, :deleted_at)

    add_column :context_drop_feedbacks, :deleted_at, :datetime, null: true
    add_index :context_drop_feedbacks, :deleted_at
  end
end

