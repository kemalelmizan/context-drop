# frozen_string_literal: true

require "json"
require "net/http"
require "uri"

module ContextDrop
  module Notifications
    class LarkClient
      class DeliveryError < StandardError; end

      class << self
        def deliver(destination, occurrence)
          settings = destination.settings.is_a?(Hash) ? destination.settings : {}
          secrets = destination.secrets
          app_id = secrets["app_id"].to_s.strip
          app_secret = secrets["app_secret"].to_s.strip
          receive_id = settings["receive_id"].to_s.strip
          receive_id_type = settings["receive_id_type"].to_s.strip.presence || "chat_id"
          api_host = settings["api_host"].to_s.strip.presence || "https://open.larksuite.com"

          raise DeliveryError, "Lark app_id missing" if app_id.empty?
          raise DeliveryError, "Lark app_secret missing" if app_secret.empty?
          raise DeliveryError, "Lark receive_id missing" if receive_id.empty?

          validate_api_host!(api_host)
          token = fetch_tenant_access_token(api_host, app_id, app_secret)
          card = build_message_card(occurrence)
          post_message(api_host, token, receive_id_type, receive_id, card)
        end

        def validate_api_host!(api_host, allow_local_http: nil)
          allow_dev_http = if allow_local_http.nil?
                             defined?(ContextDrop) && ContextDrop.respond_to?(:config) && ContextDrop.config.insecure_webhooks_allowed?
                           else
                             !!allow_local_http
                           end
          extra_hosts = defined?(ContextDrop) && ContextDrop.respond_to?(:config) ? ContextDrop.config.lark_allowed_hosts : []
          ContextDrop::SsrfGuard.validate_lark_api_host!(
            api_host,
            allowed_hosts: extra_hosts,
            allow_local_http: allow_dev_http
          )
        rescue ContextDrop::SsrfGuard::SsrfError => e
          raise DeliveryError, e.message
        end

        def escape_lark_md(raw)
          raw.to_s
             .gsub("&", "&amp;")
             .gsub("<", "&lt;")
             .gsub(">", "&gt;")
             .gsub(/([\[\]()*_~`])/, '\\\\\1')
        end

        def build_message_card(occurrence)
          data = occurrence.data.is_a?(Hash) ? occurrence.data : {}
          title = event_title(occurrence.name)
          env = escape_lark_md(data["environment"].to_s)
          status = escape_lark_md(data["status"].to_s)
          prev = escape_lark_md(data["previous_status"].to_s)
          status_line = prev.present? ? "#{prev} → #{status}" : status
          msg = escape_lark_md(data["message"].to_s.slice(0, 1000))
          page = escape_lark_md(data["page_url"].to_s.slice(0, 500))
          dash = ContextDrop::UrlSafety.safe_href(data["dashboard_url"])

          lines = [
            "**Feedback ##{escape_lark_md(data['feedback_id'])}** · `#{env}`",
            "**Status:** #{status_line}",
            msg.present? ? "> #{msg}" : nil,
            page.present? ? "**Page:** #{page}" : nil
          ].compact.join("\n")

          card = {
            config: { wide_screen_mode: true },
            header: {
              template: header_color(occurrence.name),
              title: { tag: "plain_text", content: title }
            },
            elements: [
              { tag: "div", text: { tag: "lark_md", content: lines } }
            ]
          }
          if dash.present?
            card[:elements] << {
              tag: "action",
              actions: [
                {
                  tag: "button",
                  text: { tag: "plain_text", content: "Open in Dashboard" },
                  type: "primary",
                  multi_url: {
                    url: dash,
                    pc_url: dash,
                    android_url: dash,
                    ios_url: dash
                  }
                }
              ]
            }
          end
          JSON.generate(card)
        end

        private

        def fetch_tenant_access_token(api_host, app_id, app_secret)
          uri = URI.join("#{api_host.chomp('/')}/", "open-apis/auth/v3/tenant_access_token/internal")
          body = JSON.generate(app_id: app_id, app_secret: app_secret)
          res = post_json(uri, body, "Content-Type" => "application/json")
          parsed = JSON.parse(res.body)
          raise DeliveryError, parsed["msg"].to_s unless parsed["code"].to_i.zero?

          parsed["tenant_access_token"].to_s
        end

        def post_message(api_host, token, receive_id_type, receive_id, card)
          uri = URI.join("#{api_host.chomp('/')}/", "open-apis/im/v1/messages")
          uri.query = URI.encode_www_form(receive_id_type: receive_id_type)
          payload = {
            receive_id: receive_id,
            msg_type: "interactive",
            content: card
          }
          res = post_json(uri, JSON.generate(payload), "Authorization" => "Bearer #{token}", "Content-Type" => "application/json")
          parsed = JSON.parse(res.body)
          raise DeliveryError, parsed["msg"].to_s unless parsed["code"].to_i.zero?

          true
        end

        def event_title(name)
          {
            "feedback.created" => "New ContextDrop feedback",
            "feedback.updated" => "Feedback updated",
            "feedback.status_changed" => "Feedback status changed",
            "feedback.deleted" => "Feedback deleted"
          }[name] || "ContextDrop feedback event"
        end

        def header_color(name)
          case name
          when "feedback.created" then "blue"
          when "feedback.status_changed" then "orange"
          when "feedback.deleted" then "red"
          else "wathet"
          end
        end

        def post_json(uri, body, headers)
          allow_local = defined?(ContextDrop) && ContextDrop.respond_to?(:config) && ContextDrop.config.insecure_webhooks_allowed?
          pinned_ip = ContextDrop::SsrfGuard.resolve_public_ip!(uri.host, allow_loopback: allow_local)
          http = Net::HTTP.new(uri.host, uri.port)
          http.ipaddr = pinned_ip if pinned_ip
          http.use_ssl = uri.scheme == "https"
          http.open_timeout = 8
          http.read_timeout = 15
          req = Net::HTTP::Post.new(uri.request_uri, headers)
          req.body = body
          res = http.request(req)
          return res if res.is_a?(Net::HTTPSuccess)

          raise DeliveryError, "HTTP #{res.code}: #{res.body.to_s.truncate(300)}"
        rescue ContextDrop::SsrfGuard::SsrfError => e
          raise DeliveryError, e.message
        end
      end
    end
  end
end
