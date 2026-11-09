# frozen_string_literal: true

module ContextDrop
  module Dashboard
    class FeedbacksController < ApplicationController
      layout "context_drop/application"

      before_action :enforce_dashboard_authorization!

      PER_PAGE = 25

      def index
        @status_counts = {
          "all" => ContextDrop::Feedback.count,
          "new" => ContextDrop::Feedback.new_records.count,
          "reviewed" => ContextDrop::Feedback.reviewed.count,
          "resolved" => ContextDrop::Feedback.resolved.count,
          "dismissed" => ContextDrop::Feedback.dismissed.count
        }

        scope = ContextDrop::Feedback.includes(:submitter, :element_references, :attachments).recent

        @current_status = params[:status].to_s.strip
        if ContextDrop::Feedback::STATUSES.include?(@current_status)
          scope = scope.where(status: @current_status)
        else
          @current_status = ""
        end

        @page_url_filter = params[:page_url].to_s.strip
        if @page_url_filter.present?
          scope = scope.where("context_drop_feedbacks.page_url LIKE ?", "%#{sanitize_sql_like(@page_url_filter)}%")
        end

        @search_query = (params[:q] || params[:query]).to_s.strip
        if @search_query.present?
          pattern = "%#{sanitize_sql_like(@search_query)}%"
          scope = scope.left_outer_joins(:element_references).where(
            "context_drop_feedbacks.message LIKE :q OR " \
            "context_drop_element_references.selector LIKE :q OR " \
            "context_drop_element_references.dom_path LIKE :q OR " \
            "context_drop_element_references.text_content LIKE :q",
            q: pattern
          ).distinct
        end

        @total_filtered = scope.count
        @page = [params[:page].to_i, 1].max
        @total_pages = [(@total_filtered.to_f / PER_PAGE).ceil, 1].max
        @feedbacks = scope.limit(PER_PAGE).offset((@page - 1) * PER_PAGE)
      end

      def show
        @feedback = ContextDrop::Feedback
                    .includes(:submitter, :element_references, :attachments)
                    .find(params[:id])
      end

      def update
        @feedback = ContextDrop::Feedback.find(params[:id])
        next_status = (params[:status] || params.dig(:feedback, :status)).to_s.strip

        unless ContextDrop::Feedback::STATUSES.include?(next_status)
          respond_to do |format|
            format.json { render json: { error: "Invalid status '#{next_status}'" }, status: :unprocessable_entity }
            format.html do
              redirect_to dashboard_feedback_path(@feedback), alert: "Invalid status '#{next_status}'."
            end
          end
          return
        end

        @feedback.update!(status: next_status)

        respond_to do |format|
          format.json do
            render json: {
              id: @feedback.id,
              status: @feedback.status,
              updated_at: @feedback.updated_at.iso8601
            }, status: :ok
          end
          format.html do
            redirect_to dashboard_feedback_path(@feedback), notice: "Feedback ##{@feedback.id} marked as #{@feedback.status}."
          end
        end
      end

      private

      def enforce_dashboard_authorization!
        return if ContextDrop.config.dashboard_authorized?(self)

        respond_to do |format|
          format.json { render json: { error: "Forbidden" }, status: :forbidden }
          format.any { render plain: "403 Forbidden — Not authorized to view ContextDrop Dashboard", status: :forbidden }
        end
      end

      def sanitize_sql_like(str)
        ActiveRecord::Base.sanitize_sql_like(str.to_s)
      rescue StandardError
        str.to_s.gsub(/[%_\\]/) { |m| "\\#{m}" }
      end
    end
  end
end
