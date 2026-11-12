# frozen_string_literal: true

ContextDrop::Engine.routes.draw do
  get "config", to: "configs#show"
  get "assets/context_drop.js", to: "configs#widget_bundle"
  post "attachments", to: "attachments#create"
  post "feedback", to: "feedbacks#create"
  get "health", to: "health#show"
  post "mcp", to: "mcp#create"

  scope "agent" do
    get "status", to: "agent#status"
    get "feedbacks", to: "agent#feedbacks"
    post "keys", to: "agent#save_keys"
    delete "keys", to: "agent#destroy_keys"
    post "chat", to: "agent#chat"
    post "edits/:id/apply", to: "agent#apply_edit"
    post "edits/:id/reject", to: "agent#reject_edit"
    post "edits/:id/revert", to: "agent#revert_edit"
  end

  namespace :dashboard do
    root to: "feedbacks#index"
    resources :feedbacks, only: %i[index show update]
  end

  root to: "dashboard/feedbacks#index"
end
