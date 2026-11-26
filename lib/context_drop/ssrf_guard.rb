# frozen_string_literal: true

require "ipaddr"
require "resolv"
require "socket"
require "uri"

module ContextDrop
  module SsrfGuard
    class SsrfError < ContextDrop::Error; end

    LOOPBACK_HOSTS = %w[localhost 127.0.0.1 ::1 [::1]].freeze
    INTERNAL_HOST_SUFFIXES = %w[.localhost .local .internal .nip.io .sslip.io .xip.io].freeze
    DEFAULT_LARK_HOSTS = %w[open.larksuite.com open.feishu.cn].freeze

    EMBEDDED_PRIVATE_IPV4_RE = /(?:^|[.-])(?:
      127(?:\.\d{1,3}){3}|
      10(?:\.\d{1,3}){3}|
      169\.254(?:\.\d{1,3}){2}|
      192\.168(?:\.\d{1,3}){2}|
      172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2}|
      100\.(?:6[4-9]|[7-9]\d|1[01]\d|12[0-7])(?:\.\d{1,3}){2}|
      0\.0\.0\.0
    )(?:[.-]|$)/ix

    CGNAT_RANGE = IPAddr.new("100.64.0.0/10")
    THIS_NET_RANGE = IPAddr.new("0.0.0.0/8")
    IPV4_MULTICAST_RANGE = IPAddr.new("224.0.0.0/4")
    IPV6_MULTICAST_RANGE = IPAddr.new("ff00::/8")

    module_function

    def loopback_host?(host)
      clean = normalize_host(host)
      return false if clean.empty?
      return true if %w[localhost 127.0.0.1 ::1].include?(clean) || clean.end_with?(".localhost")

      ip = parse_ip(clean)
      !ip.nil? && ip.loopback?
    end

    def disallowed_ip?(ip_or_str)
      ip = ip_or_str.is_a?(IPAddr) ? unwrap_mapped_ipv6(ip_or_str) : parse_ip(ip_or_str)
      return true if ip.nil?

      return true if ip.loopback? || ip.private? || ip.link_local?

      if ip.ipv4?
        return true if CGNAT_RANGE.include?(ip) || THIS_NET_RANGE.include?(ip) || IPV4_MULTICAST_RANGE.include?(ip)
      elsif ip.ipv6?
        return true if ip.to_s == "::" || IPV6_MULTICAST_RANGE.include?(ip)
      end

      false
    end

    def disallowed_hostname?(host)
      clean = normalize_host(host)
      return true if clean.empty?
      return true if %w[localhost metadata metadata.google.internal].include?(clean)
      return true if INTERNAL_HOST_SUFFIXES.any? { |suffix| clean.end_with?(suffix) }
      return true if EMBEDDED_PRIVATE_IPV4_RE.match?(clean)

      ip = parse_ip(clean)
      return disallowed_ip?(ip) if ip

      false
    end

    def validate_lark_api_host!(api_host_str, allowed_hosts: nil, allow_local_http: false)
      uri = URI.parse(api_host_str.to_s.strip)
      raise SsrfError, "Lark API host missing" if uri.host.to_s.strip.empty?
      raise SsrfError, "Lark API host must not include credentials" unless uri.userinfo.nil?

      clean = normalize_host(uri.host)
      if allow_local_http && uri.is_a?(URI::HTTP) && loopback_host?(clean)
        return uri
      end

      raise SsrfError, "Lark API host must use HTTPS" unless uri.is_a?(URI::HTTPS)
      raise SsrfError, "Lark API host blocked (private or internal network)" if disallowed_hostname?(clean)

      permitted = (DEFAULT_LARK_HOSTS + Array(allowed_hosts)).map { |h| normalize_host(h) }.reject(&:empty?).uniq
      unless permitted.include?(clean)
        raise SsrfError, "Lark API host '#{clean}' is not in allowed Lark hosts (#{permitted.join(', ')})"
      end

      uri
    rescue URI::InvalidURIError => e
      raise SsrfError, "Invalid Lark API host: #{e.message}"
    end

    # Resolves DNS for `uri.host`, verifies every returned address is public (unless `allow_loopback` is true
    # for an explicit local development endpoint), and returns a validated IP string to pin on `Net::HTTP#ipaddr=`.
    def resolve_public_ip!(host, allow_loopback: false)
      clean = normalize_host(host)
      raise SsrfError, "Host missing" if clean.empty?

      if allow_loopback && loopback_host?(clean)
        return nil
      end

      if disallowed_hostname?(clean)
        raise SsrfError, "Blocked disallowed private/metadata host '#{clean}'"
      end

      literal_ip = parse_ip(clean)
      if literal_ip
        raise SsrfError, "Blocked disallowed IP address '#{literal_ip}'" if disallowed_ip?(literal_ip)

        return literal_ip.to_s
      end

      addrs = Resolv.getaddresses(clean)
      if addrs.empty?
        begin
          addrs = Addrinfo.getaddrinfo(clean, nil, nil, :STREAM).map(&:ip_address).uniq
        rescue SocketError
          addrs = []
        end
      end

      raise SsrfError, "Unable to resolve host '#{clean}'" if addrs.empty?

      addrs.each do |addr_str|
        if disallowed_ip?(addr_str)
          raise SsrfError, "Blocked DNS rebinding / private IP resolution (#{addr_str}) for host '#{clean}'"
        end
      end

      addrs.first
    end

    def normalize_host(host)
      host.to_s.strip.downcase.delete_prefix("[").delete_suffix("]").chomp(".")
    end

    def parse_ip(str)
      raw = normalize_host(str)
      return nil if raw.empty?

      unwrap_mapped_ipv6(IPAddr.new(raw))
    rescue IPAddr::InvalidAddressError
      nil
    end

    def unwrap_mapped_ipv6(ip)
      ip.ipv6? && ip.ipv4_mapped? ? ip.native : ip
    end
  end
end
