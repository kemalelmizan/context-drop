# frozen_string_literal: true

module ContextDrop
  module MCP
    module Tools
      class ListFeedbacks
        MAX_LIMIT = 100
        DEFAULT_LIMIT = 20

        DEFINITION = {
          name: "list_feedbacks",
          description: "List and search ContextDrop feedback submissions filtered by status, page_url, or free-text query.",
          inputSchema: {
            type: "object",
            properties: {
              status: {
                type: "string",
                enum: %w[new reviewed resolved dismissed],
                description: "Filter feedback by workflow status."
              },
              page_url: {
                type: "string",
                description: "Filter feedback by originating page URL substring (e.g. '/checkout')."
              },
              query: {
                type: "string",
                description: "Free-text search matching feedback message or attached DOM element selectors, paths, or text."
              },
              limit: {
                type: "integer",
                description: "Maximum records to return (default 20, max 100)."
              },
              offset: {
                type: "integer",
                description: "Pagination offset (default 0)."
              }
            }
          }
        }.freeze

        def self.call(args = {})
          params = stringify_keys(args)
          scope = ContextDrop::Feedback.includes(:submitter, :element_references, :attachments).recent

          status = params["status"].to_s.strip
          if status.present?
            unless ContextDrop::Feedback::STATUSES.include?(status)
              return error_result("Invalid status '#{status}'. Must be one of: #{ContextDrop::Feedback::STATUSES.join(', ')}")
            end

            scope = scope.where(status: status)
          end

          page_url = params["page_url"].to_s.strip
          if page_url.present?
            scope = scope.where("context_drop_feedbacks.page_url LIKE ?", "%#{escape_like(page_url)}%")
          end

          query = params["query"].to_s.strip
          if query.present?
            pattern = "%#{escape_like(query)}%"
            scope = scope.left_outer_joins(:element_references).where(
              "context_drop_feedbacks.message LIKE :q OR " \
              "context_drop_element_references.selector LIKE :q OR " \
              "context_drop_element_references.dom_path LIKE :q OR " \
              "context_drop_element_references.text_content LIKE :q",
              q: pattern
            ).distinct
          end

          raw_limit = params["limit"] ? params["limit"].to_i : DEFAULT_LIMIT
          limit = raw_limit.clamp(1, MAX_LIMIT)
          offset = [params["offset"].to_i, 0].max

          total_count = scope.count
          records = scope.limit(limit).offset(offset).map { |fb| serialize_summary(fb) }

          {
            content: [
              {
                type: "text",
                text: JSON.pretty_generate(
                  total: total_count,
                  limit: limit,
                  offset: offset,
                  feedbacks: records
                )
              }
            ],
            isError: false
          }
        end

        def self.serialize_summary(feedback)
          {
            id: feedback.id,
            status: feedback.status,
            message: feedback.message,
            page_url: feedback.page_url,
            submitter: feedback.submitter_label,
            attachments_count: feedback.attachments.size,
            element_references_count: feedback.element_references.size,
            element_selectors: feedback.element_references.map(&:selector),
            created_at: feedback.created_at&.iso8601
          }
        end

        def self.error_result(msg)
          {
            content: [{ type: "text", text: JSON.generate(error: msg) }],
            isError: true
          }
        end

        def self.escape_like(str)
          ActiveRecord::Base.sanitize_sql_like(str.to_s)
        rescue StandardError
          str.to_s.gsub(/[%_\\]/) { |m| "\\#{m}" }
        end

        def self.stringify_keys(hash)
          hash.is_a?(Hash) ? hash.transform_keys(&:to_s) : {}
        end
      end
    end
  end
end
