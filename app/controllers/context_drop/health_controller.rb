# frozen_string_literal: true

module ContextDrop
  class HealthController < ApplicationController
    def show
      render json: { status: "ok", version: ContextDrop::VERSION }, status: :ok
    end
  end
end
