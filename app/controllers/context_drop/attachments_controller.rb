# frozen_string_literal: true

module ContextDrop
  class AttachmentsController < ApplicationController
    before_action :enforce_submission_authorization!
    before_action :enforce_rate_limit!

    def create
      validated = ContextDrop::UploadValidator.validate!(params[:file])

      blob_args = {
        io: validated[:io],
        filename: validated[:filename],
        content_type: validated[:content_type]
      }
      if ContextDrop.config.active_storage_service
        blob_args[:service_name] = ContextDrop.config.active_storage_service
      end

      blob = ActiveStorage::Blob.create_and_upload!(**blob_args)

      render json: {
        signed_blob_id: blob.signed_id,
        filename: validated[:filename],
        content_type: validated[:content_type],
        byte_size: validated[:byte_size],
        dimensions: validated[:dimensions]
      }, status: :created
    end
  end
end
