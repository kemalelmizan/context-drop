# frozen_string_literal: true

require "json"
require "openssl"
require "securerandom"
require "fileutils"
require "digest"
require_relative "../context_drop/base64_util"

module ContextDrop
  class NotificationSecrets
    CIPHER_NAME = "aes-256-gcm"

    class << self
      def encrypt(hash)
        return nil if hash.nil? || hash.empty?

        cipher = OpenSSL::Cipher.new(CIPHER_NAME)
        cipher.encrypt
        cipher.key = master_key
        iv = cipher.random_iv
        cipher.auth_data = ""
        ciphertext = cipher.update(JSON.generate(hash)) + cipher.final
        tag = cipher.auth_tag
        {
          "v" => 1,
          "iv" => ContextDrop::Base64Util.strict_encode64(iv),
          "tag" => ContextDrop::Base64Util.strict_encode64(tag),
          "ciphertext" => ContextDrop::Base64Util.strict_encode64(ciphertext)
        }
      end

      def decrypt(blob)
        return {} if blob.nil? || blob.empty?
        return blob if blob.is_a?(Hash) && blob["ciphertext"].nil?

        payload = blob.is_a?(Hash) ? blob : JSON.parse(blob.to_s)
        cipher = OpenSSL::Cipher.new(CIPHER_NAME)
        cipher.decrypt
        cipher.key = master_key
        cipher.iv = ContextDrop::Base64Util.strict_decode64(payload["iv"].to_s)
        cipher.auth_tag = ContextDrop::Base64Util.strict_decode64(payload["tag"].to_s)
        cipher.auth_data = ""
        JSON.parse(cipher.update(ContextDrop::Base64Util.strict_decode64(payload["ciphertext"].to_s)) + cipher.final)
      rescue StandardError
        {}
      end

      def mask_secret(raw)
        str = raw.to_s.strip
        return nil if str.empty?
        return "••••••••" if str.length <= 6

        "••••#{str[-4, 4]}"
      end

      private

      def master_key
        [
          ContextDrop.config.ownership_secret,
          ENV["CONTEXT_DROP_OWNERSHIP_SECRET"],
          ENV["CONTEXT_DROP_SECRET_KEY"]
        ].each do |candidate|
          explicit = candidate.to_s.strip
          return Digest::SHA256.digest(explicit) if explicit.bytesize >= 16
        end

        path = resolved_master_key_path
        if File.exist?(path)
          raw = File.binread(path)
          File.chmod(0o600, path) rescue nil
          return raw if raw.bytesize == 32
        end

        FileUtils.mkdir_p(File.dirname(path))
        raw = SecureRandom.random_bytes(32)
        tmp_path = "#{path}.tmp.#{SecureRandom.hex(4)}"
        File.open(tmp_path, File::WRONLY | File::CREAT | File::TRUNC, 0o600) do |f|
          f.binmode
          f.write(raw)
        end
        File.chmod(0o600, tmp_path) rescue nil
        File.rename(tmp_path, path)
        raw
      end

      def resolved_master_key_path
        root = if defined?(Rails) && Rails.respond_to?(:root) && Rails.root
                 Rails.root.to_s
               else
                 Dir.pwd
               end
        File.join(root, "tmp", "context_drop_notification.key")
      end
    end
  end
end