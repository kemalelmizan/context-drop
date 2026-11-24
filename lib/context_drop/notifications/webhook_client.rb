# frozen_string_literal: true

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

        def validate_https_uri!(url)
          uri = URI.parse(url)
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
          http = Net::HTTP.new(uri.host, uri.port)
          http.use_ssl = uri.scheme == "https"
          http.open_timeout = 8
          http.read_timeout = 12
          req = Net::HTTP::Post.new(uri.request_uri, headers)
          req.body = body
          res = http.request(req)
          return res if res.is_a?(Net::HTTPSuccess)

          raise DeliveryError, "HTTP #{res.code}: #{res.body.to_s.truncate(300)}"
        end

        def private_or_local_host?(host)
          down = host.to_s.strip.downcase
          return true if %w[localhost metadata.google.internal].include?(down)

          if down.match?(/\A\d{1,3}(\.\d{1,3}){3}\z/)
            octets = down.split(".").map(&:to_i)
            return true if octets[0] == 10
            return true if octets[0] == 127
            return true if octets[0] == 0
            return true if octets[0] == 169 && octets[1] == 254
            return true if octets[0] == 192 && octets[1] == 168
            return true if octets[0] == 172 && octets[1] >= 16 && octets[1] <= 31
          end

          false
        end
      end
    end
  end
end