# frozen_string_literal: true

ContextDrop::Engine.routes.draw do
  match "config", to: "configs#cors_preflight", via: :options
  match "attachments", to: "configs#cors_preflight", via: :options
  match "feedback", to: "configs#cors_preflight", via: :options
  match "feedback/:id", to: "configs#cors_preflight", via: :options
  match "feedback/:feedback_id/attachments/:id", to: "configs#cors_preflight", via: :options
  match "health", to: "configs#cors_preflight", via: :options

  get "config", to: "configs#show"
  get "assets/context_drop.js", to: "configs#widget_bundle"
  post "attachments", to: "attachments#create"
  get "feedback", to: "feedbacks#index"
  post "feedback", to: "feedbacks#create"
  match "feedback/:id", to: "feedbacks#update", via: %i[patch put]
  delete "feedback/:id", to: "feedbacks#destroy"
  get "feedback/:feedback_id/attachments/:id", to: "feedbacks#attachment"
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
