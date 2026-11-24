# frozen_string_literal: true

require "uri"

module ContextDrop
  module DashboardHelper
    def url_path_and_host(raw_url)
      return ["/", nil] if raw_url.blank?

      uri = URI.parse(raw_url.to_s)
      host = uri.host.presence
      path = uri.path.presence || "/"
      query = uri.query.present? ? "?#{uri.query}" : ""
      [path + query, host]
    rescue URI::InvalidURIError
      [raw_url.to_s, nil]
    end

    def split_submitter_label(raw_label)
      label = raw_label.to_s.strip
      return ["Anonymous", nil] if label.empty?

      if (match = /\A(.+?)\s*\((.+)\)\z/.match(label))
        [match[1].strip, match[2].strip]
      else
        [label, nil]
      end
    end

    def format_breakable_text(raw_text)
      str = raw_text.to_s
      return "".html_safe if str.empty?

      segments = str.gsub(%r{[/?&=@]}) { |delim| "#{delim}\0" }.split("\0", -1)
      segments.reject(&:empty?).map { |seg| ERB::Util.html_escape(seg) }.join("<wbr>").html_safe
    end

    def cd_icon_arrow_left(size: 14)
      %(<svg width="#{size}" height="#{size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>).html_safe
    end

    def cd_icon_arrow_right(size: 14)
      %(<svg width="#{size}" height="#{size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>).html_safe
    end

    def cd_icon_search(size: 14)
      %(<svg width="#{size}" height="#{size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>).html_safe
    end

    def cd_icon_link(size: 14)
      %(<svg width="#{size}" height="#{size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>).html_safe
    end

    def cd_icon_external_link(size: 13)
      %(<svg width="#{size}" height="#{size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>).html_safe
    end

    def cd_icon_pin(size: 13)
      %(<svg width="#{size}" height="#{size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 2a8 8 0 0 0-8 8c0 5.25 8 12 8 12s8-6.75 8-12a8 8 0 0 0-8-8z"></path><circle cx="12" cy="10" r="3"></circle></svg>).html_safe
    end

    def cd_icon_attachment(size: 13)
      %(<svg width="#{size}" height="#{size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"></path></svg>).html_safe
    end

    def cd_icon_user(size: 13)
      %(<svg width="#{size}" height="#{size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>).html_safe
    end

    def cd_icon_comment(size: 13)
      %(<svg width="#{size}" height="#{size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>).html_safe
    end

    # Serve binaries through the mounted engine (not host Active Storage URLs) so
    # screenshots work when the host app uses a relative URL root or proxies storage.
    def cd_dashboard_attachment_path(attachment)
      attachment_dashboard_feedback_path(attachment.feedback_id, attachment_id: attachment.id)
    end
  end
end

