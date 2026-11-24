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
          "updated" => ContextDrop::Feedback.updated_records.count,
          "fixed" => ContextDrop::Feedback.fixed.count,
          "reviewed" => ContextDrop::Feedback.reviewed.count,
          "dismissed" => ContextDrop::Feedback.dismissed.count,
          "deleted" => ContextDrop::Feedback.deleted.count
        }

        @current_status = params[:status].to_s.strip
        scope = if @current_status == "deleted"
                  ContextDrop::Feedback.deleted.includes(:element_references, :attachments, :comments).recent
                elsif ContextDrop::Feedback::STATUSES.include?(@current_status)
                  ContextDrop::Feedback.active.where(status: @current_status).includes(:element_references, :attachments, :comments).recent
                else
                  @current_status = ""
                  ContextDrop::Feedback.active.includes(:element_references, :attachments, :comments).recent
                end

        @page_url_filter = params[:page_url].to_s.strip
        if @page_url_filter.present?
          scope = scope.where("context_drop_feedbacks.page_url LIKE ?", "%#{sanitize_sql_like(@page_url_filter)}%")
        end

        @search_query = (params[:q] || params[:query]).to_s.strip
        if @search_query.present?
          pattern = "%#{sanitize_sql_like(@search_query)}%"
          scope = scope.left_outer_joins(:element_references, :comments).where(
            "context_drop_feedbacks.message LIKE :q OR " \
            "context_drop_comments.body LIKE :q OR " \
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
                    .includes(:element_references, :attachments, comments: :attachments)
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

        previous_status = @feedback.status
        @feedback.update!(status: next_status)
        invoke_lifecycle_callback(
          :on_feedback_updated,
          @feedback,
          previous_status: previous_status,
          dashboard_url: dashboard_feedback_url(@feedback)
        )

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

      def attachment
        @feedback = ContextDrop::Feedback.find_by(id: params[:id])
        if @feedback.nil?
          head :not_found
          return
        end

        att = ContextDrop::Attachment.where(feedback_id: @feedback.id).find_by(id: params[:attachment_id])
        head(:not_found) unless att && stream_context_drop_attachment!(att)
      end

      def create_comment
        @feedback = ContextDrop::Feedback.find(params[:id])
        body = (params[:body] || params.dig(:comment, :body)).to_s.strip.presence
        raw_files = Array(params[:images] || params.dig(:comment, :images)).reject(&:blank?)

        if raw_files.size > ContextDrop.config.max_attachments.to_i
          redirect_to dashboard_feedback_path(@feedback),
                      alert: "Too many images attached (maximum #{ContextDrop.config.max_attachments})."
          return
        end

        comment = nil
        ContextDrop::Feedback.transaction do
          comment = @feedback.comments.build(
            author_type: "Dashboard",
            author_label: "Team",
            body: body,
            metadata: {}
          )

          pending_attachments = raw_files.map do |file|
            validated = ContextDrop::UploadValidator.validate!(file)
            att_meta = {}
            if validated[:dimensions]
              att_meta["image_dimensions"] = {
                "width" => validated[:dimensions][0],
                "height" => validated[:dimensions][1]
              }
            end
            att = comment.attachments.build(
              feedback: @feedback,
              attachment_type: "image",
              metadata: att_meta
            )
            [att, validated]
          end

          unless comment.valid?
            redirect_to dashboard_feedback_path(@feedback), alert: comment.errors.full_messages.join(", ")
            raise ActiveRecord::Rollback
          end

          comment.save!

          pending_attachments.each do |att, validated|
            next unless att.respond_to?(:file)

            att.file.attach(
              io: validated[:io],
              filename: validated[:filename],
              content_type: validated[:content_type]
            )
          end

          @feedback.update!(status: "updated")
        end

        return if performed?

        respond_to do |format|
          format.json do
            render json: {
              id: comment.id,
              feedback_id: @feedback.id,
              status: @feedback.status,
              created_at: comment.created_at&.iso8601
            }, status: :created
          end
          format.html do
            redirect_to dashboard_feedback_path(@feedback), notice: "Comment added to Feedback ##{@feedback.id}."
          end
        end
      rescue ContextDrop::UploadValidator::ValidationError => e
        respond_to do |format|
          format.json { render json: { error: e.message }, status: :unprocessable_entity }
          format.html { redirect_to dashboard_feedback_path(@feedback), alert: e.message }
        end
      end

      private

      def invoke_lifecycle_callback(hook_name, feedback, **context)
        return unless ContextDrop.config.respond_to?(hook_name)

        callback = ContextDrop.config.public_send(hook_name)
        callback.call(feedback) if callback.respond_to?(:call)
        ContextDrop::FeedbackEvents::Publisher.map_lifecycle_callback(
          hook_name,
          feedback,
          **context
        )
      rescue StandardError => e
        Rails.logger.error("[ContextDrop] #{hook_name} callback error: #{e.class}: #{e.message}") if defined?(Rails.logger) && Rails.logger
      end

      def dashboard_feedback_url(feedback)
        url_for(controller: "context_drop/dashboard/feedbacks", action: :show, id: feedback.id, only_path: false)
      rescue StandardError
        "/context_drop/dashboard/feedbacks/#{feedback.id}"
      end

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
