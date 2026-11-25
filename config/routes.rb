# frozen_string_literal: true

ContextDrop::Engine.routes.draw do
  match "config", to: "configs#cors_preflight", via: :options
  match "attachments", to: "configs#cors_preflight", via: :options
  match "feedback", to: "configs#cors_preflight", via: :options
  match "feedback/:id", to: "configs#cors_preflight", via: :options
  match "feedback/:id/comments", to: "configs#cors_preflight", via: :options
  match "feedback/:feedback_id/attachments/:id", to: "configs#cors_preflight", via: :options
  match "health", to: "configs#cors_preflight", via: :options
  match "assistant/turn", to: "configs#cors_preflight", via: :options
  match "assistant/change_sets/:id", to: "configs#cors_preflight", via: :options
  match "assistant/change_sets/:id/approve", to: "configs#cors_preflight", via: :options

  get "config", to: "configs#show"
  get "assets/context_drop.js", to: "configs#widget_bundle"
  post "attachments", to: "attachments#create"
  get "feedback", to: "feedbacks#index"
  post "feedback", to: "feedbacks#create"
  match "feedback/:id", to: "feedbacks#update", via: %i[patch put]
  delete "feedback/:id", to: "feedbacks#destroy"
  post "feedback/:id/comments", to: "feedbacks#create_comment"
  get "feedback/:feedback_id/attachments/:id", to: "feedbacks#attachment"
  get "health", to: "health#show"
  post "mcp", to: "mcp#create"
  get "mcp/events/stream", to: "mcp_events#stream"

  scope "assistant" do
    get "status", to: "assistant#status"
    post "turn", to: "assistant#turn"
    get "change_sets/:id", to: "assistant#show_change_set"
    post "change_sets/:id/approve", to: "assistant#approve_change_set"
  end

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
    resources :integrations, only: %i[index new create edit update destroy] do
      post :test_delivery, on: :member
    end
    resources :feedbacks, only: %i[index show update] do
      post :comments, on: :member, action: :create_comment
      get "attachments/:attachment_id", on: :member, action: :attachment, as: :attachment
    end
  end

  root to: "dashboard/feedbacks#index"
end
