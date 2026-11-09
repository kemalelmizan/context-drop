# frozen_string_literal: true

ContextDrop::Engine.routes.draw do
  get "config", to: "configs#show"
  get "assets/context_drop.js", to: "configs#widget_bundle"
  post "attachments", to: "attachments#create"
  post "feedback", to: "feedbacks#create"
  get "health", to: "health#show"
  post "mcp", to: "mcp#create"

  namespace :dashboard do
    root to: "feedbacks#index"
    resources :feedbacks, only: %i[index show update]
  end

  root to: "dashboard/feedbacks#index"
end
