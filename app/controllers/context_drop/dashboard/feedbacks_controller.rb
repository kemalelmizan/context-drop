# frozen_string_literal: true

module ContextDrop
  module Dashboard
    class FeedbacksController < ApplicationController
      layout "context_drop/application"
      helper ContextDrop::DashboardHelper

      before_action :enforce_dashboard_authorization!
      before_action :resolve_navigation_shortcuts

      PER_PAGE = 25

      def index
        @status_counts = {
          "all" => ContextDrop::Feedback.active.count,
          "new" => ContextDrop::Feedback.new_records.count,
          "reviewed" => ContextDrop::Feedback.reviewed.count,
          "resolved" => ContextDrop::Feedback.resolved.count,
          "dismissed" => ContextDrop::Feedback.dismissed.count,
          "deleted" => ContextDrop::Feedback.deleted.count
        }

        @current_status = params[:status].to_s.strip
        scope = if @current_status == "deleted"
                  ContextDrop::Feedback.deleted.includes(:element_references, :attachments).recent
                elsif ContextDrop::Feedback::STATUSES.include?(@current_status)
                  ContextDrop::Feedback.active.where(status: @current_status).includes(:element_references, :attachments).recent
                else
                  @current_status = ""
                  ContextDrop::Feedback.active.includes(:element_references, :attachments).recent
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

        session[:context_drop_dashboard_index_url] = request.fullpath if respond_to?(:session) && request&.get?
      end

      def show
        @feedback = ContextDrop::Feedback
                    .includes(:element_references, :attachments)
                    .find(params[:id])

        nav_scope = @feedback.deleted? ? ContextDrop::Feedback.deleted : ContextDrop::Feedback.active

        # Newer feedback (previous in chronological newest-first list) and older feedback (next in list)
        @newer_feedback = nav_scope
                          .where(
                            "created_at > :ts OR (created_at = :ts AND id > :id)",
                            ts: @feedback.created_at,
                            id: @feedback.id
                          )
                          .order(created_at: :asc, id: :asc)
                          .select(:id, :status)
                          .first

        @older_feedback = nav_scope
                          .where(
                            "created_at < :ts OR (created_at = :ts AND id < :id)",
                            ts: @feedback.created_at,
                            id: @feedback.id
                          )
                          .order(created_at: :desc, id: :desc)
                          .select(:id, :status)
                          .first
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

      def resolve_navigation_shortcuts
        @host_app_path = resolve_host_app_path
        @triage_index_back_path = if respond_to?(:session) && session[:context_drop_dashboard_index_url].present?
                                    session[:context_drop_dashboard_index_url]
                                  else
                                    dashboard_feedbacks_path
                                  end
      end

      def resolve_host_app_path
        engine_prefix = (request.respond_to?(:script_name) && request.script_name.presence) || "/context_drop"
        if respond_to?(:session) && request&.referer.present?
          begin
            ref_uri = URI.parse(request.referer)
            same_host = ref_uri.host.nil? || (request.respond_to?(:host) && ref_uri.host == request.host)
            if same_host && ref_uri.path.present? && !ref_uri.path.start_with?(engine_prefix)
              full_ref = [ref_uri.path, ref_uri.query].compact.join("?")
              session[:context_drop_return_to] = full_ref
            end
          rescue URI::InvalidURIError
            # Ignore malformed referer headers
          end
        end

        return session[:context_drop_return_to] if respond_to?(:session) && session[:context_drop_return_to].present?

        if respond_to?(:main_app) && main_app.respond_to?(:root_path)
          main_app.root_path
        else
          "/"
        end
      rescue StandardError
        "/"
      end
    end
  end
end
