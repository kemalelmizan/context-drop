# frozen_string_literal: true

module ContextDrop
  class ApplicationRecord < ActiveRecord::Base
    self.abstract_class = true
  end
end
