# frozen_string_literal: true

class AddEnvironmentToContextDropFeedbacks < ActiveRecord::Migration[7.1]
  def change
    return if column_exists?(:context_drop_feedbacks, :environment)

    add_column :context_drop_feedbacks, :environment, :string, null: false, default: "development"
    add_index :context_drop_feedbacks, :environment
  end
end
