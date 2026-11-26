# frozen_string_literal: true

require "ipaddr"
require "json"
require "net/http"
require "openssl"
require "uri"
require_relative "../../context_drop/base64_util"

module ContextDrop
  module Notifications
    class WebhookClient
      class DeliveryError < StandardError; end

      USER_AGENT = "ContextDrop-Webhook/1.0"

      class << self
        def deliver_destination(destination, occurrence)
          url = destination.settings["url"].to_s.strip
          raise DeliveryError, "Webhook URL missing" if url.empty?

          uri = validate_https_uri!(url)
          body = JSON.generate(occurrence.occurrence_payload)
          headers = signed_headers(secret: destination.secrets["signing_secret"].to_s, body: body, msg_id: occurrence.event_id)
          headers["Content-Type"] = "application/json"
          headers["User-Agent"] = USER_AGENT
          post_json(uri, body, headers)
        end

        def deliver_mcp_subscription(subscription, occurrence)
          uri = validate_https_uri!(subscription.callback_url)
          body = JSON.generate(occurrence.occurrence_payload)
          headers = signed_headers(
            secret: subscription.signing_secret,
            body: body,
            msg_id: occurrence.event_id
          )
          headers["Content-Type"] = "application/json"
          headers["User-Agent"] = USER_AGENT
          post_json(uri, body, headers)
          subscription.update_columns(last_cursor: occurrence.cursor, updated_at: Time.current)
        end

        def validate_https_uri!(url, allow_local_http: nil)
          allow_dev_http = if allow_local_http.nil?
                             defined?(ContextDrop) && ContextDrop.respond_to?(:config) && ContextDrop.config.insecure_webhooks_allowed?
                           else
                             !!allow_local_http
                           end

          uri = URI.parse(url.to_s.strip)
          raise DeliveryError, "Webhook URL must not include credentials" unless uri.userinfo.nil?

          if allow_dev_http && uri.is_a?(URI::HTTP) && !uri.host.to_s.strip.empty? && loopback_host?(uri.host)
            return uri
          end

          raise DeliveryError, "Webhook URL must use HTTPS" unless uri.is_a?(URI::HTTPS)
          raise DeliveryError, "Webhook URL host missing" if uri.host.to_s.strip.empty?
          raise DeliveryError, "Webhook URL blocked (private network)" if private_or_local_host?(uri.host)

          uri
        rescue URI::InvalidURIError => e
          raise DeliveryError, "Invalid webhook URL: #{e.message}"
        end

        def signed_headers(secret:, body:, msg_id:)
          timestamp = Time.now.to_i.to_s
          base = "#{msg_id}.#{timestamp}.#{body}"
          sig = if secret.to_s.strip.empty?
                  ""
                else
                  "v1,#{ContextDrop::Base64Util.strict_encode64(OpenSSL::HMAC.digest("SHA256", secret, base))}"
                end
          {
            "webhook-id" => msg_id,
            "webhook-timestamp" => timestamp,
            "webhook-signature" => sig
          }
        end

        private

        def post_json(uri, body, headers)
          allow_local = defined?(ContextDrop) && ContextDrop.respond_to?(:config) && ContextDrop.config.insecure_webhooks_allowed?
          pinned_ip = ContextDrop::SsrfGuard.resolve_public_ip!(uri.host, allow_loopback: allow_local)
          http = Net::HTTP.new(uri.host, uri.port)
          http.ipaddr = pinned_ip if pinned_ip
          http.use_ssl = uri.scheme == "https"
          http.open_timeout = 8
          http.read_timeout = 12
          req = Net::HTTP::Post.new(uri.request_uri, headers)
          req.body = body
          res = http.request(req)
          return res if res.is_a?(Net::HTTPSuccess)

          raise DeliveryError, "HTTP #{res.code}: #{res.body.to_s.truncate(300)}"
        rescue ContextDrop::SsrfGuard::SsrfError => e
          raise DeliveryError, e.message
        end

        def loopback_host?(host)
          ContextDrop::SsrfGuard.loopback_host?(host)
        end

        def private_or_local_host?(host)
          ContextDrop::SsrfGuard.disallowed_hostname?(host)
        end
      end
    end
  end
end
