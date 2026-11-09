# frozen_string_literal: true

Rails.application.routes.draw do
  mount ContextDrop::Engine => "/context_drop"
end
