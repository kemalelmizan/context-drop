# frozen_string_literal: true

require "json"

module ContextDrop
  class Configuration
    VALID_POSITIONS = %i[bottom_right bottom_left top_right top_left].freeze
    VALID_SELECTION_MODES = %i[auto smart verbose].freeze
    LOOPBACK_IPS = %w[127.0.0.1 ::1 ::ffff:127.0.0.1 0:0:0:0:0:0:0:1].freeze
    LOOPBACK_HOST_PATTERN = /\A(?:localhost|127\.0\.0\.1|\[::1\]|[a-z0-9-]+\.localhost)(?::\d+)?\z/i

    MANDATORY_EXCLUDED_SELECTORS = [
      "[data-feedback-ignore]",
      "[data-feedback-sensitive]",
      "input[type='password']",
      "input[type='hidden']",
      "[autocomplete^='cc-']"
    ].freeze

    DEFAULT_ALLOWED_CONTENT_TYPES = %w[
      image/png
      image/jpeg
      image/webp
      image/gif
    ].freeze

    attr_accessor :enabled,
                  :environment,
                  :storage,
                  :active_storage_service,
                  :allow_anonymous,
                  :max_attachments,
                  :max_element_references,
                  :max_attachment_size,
                  :allowed_content_types,
                  :max_image_dimensions,
                  :element_selection,
                  :screenshot_capture,
                  :element_capture_padding,
                  :smart_capture_padding,
                  :excluded_selectors,
                  :current_submitter,
                  :authorize_submission,
                  :authorize_dashboard,
                  :rate_limit,
                  :on_feedback_created,
                  :mcp_enabled,
                  :mcp_api_key,
                  :authorize_mcp,
                  :mcp_environments,
                  :local_agent_enabled,
                  :enable_local_agent,
                  :local_agent_workspace_root,
                  :local_agent_key_store_path

    attr_reader :position, :selection_mode

    def initialize
      @enabled = false
      @environment = nil # Auto-resolves from Rails.env / RAILS_ENV / RACK_ENV
      @position = :bottom_right
      @selection_mode = :auto # :smart in production, :verbose in development/staging
      @storage = :active_storage
      @active_storage_service = nil
      @allow_anonymous = true

      @max_attachments = 10
      @max_element_references = 10
      @max_attachment_size = 10 * 1024 * 1024 # 10 MB
      @allowed_content_types = DEFAULT_ALLOWED_CONTENT_TYPES.dup
      @max_image_dimensions = [4096, 4096]

      @element_selection = true
      @screenshot_capture = true
      @element_capture_padding = 16
      @smart_capture_padding = 84

      @excluded_selectors = MANDATORY_EXCLUDED_SELECTORS.dup

      @current_submitter = lambda do |controller|
        controller.respond_to?(:current_user, true) ? controller.send(:current_user) : nil
      end

      @authorize_submission = ->(_controller) { true }

      @authorize_dashboard = lambda do |controller|
        user = controller.respond_to?(:current_user, true) ? controller.send(:current_user) : nil
        is_admin = user.respond_to?(:admin?) && user.admin?
        is_dev = defined?(Rails) && Rails.respond_to?(:env) && Rails.env.development?
        Boolean(is_admin || is_dev)
      end

      @rate_limit = { max_requests: 20, period: 3600 }
      @on_feedback_created = ->(_feedback) {}

      @mcp_enabled = false
      @mcp_api_key = nil
      @authorize_mcp = nil
      @mcp_environments = {}

      @local_agent_enabled = ENV.fetch("CONTEXT_DROP_LOCAL_AGENT_ENABLED", "false") == "true"
      @enable_local_agent = @local_agent_enabled
      @local_agent_workspace_root = nil
      @local_agent_key_store_path = nil
    end

    def enable_local_agent
      @local_agent_enabled
    end

    def enable_local_agent=(value)
      @local_agent_enabled = Boolean(value)
      @enable_local_agent = @local_agent_enabled
    end

    def local_agent_enabled=(value)
      @local_agent_enabled = Boolean(value)
      @enable_local_agent = @local_agent_enabled
    end

    def position=(value)
      sym = value.to_s.strip.to_sym
      unless VALID_POSITIONS.include?(sym)
        raise ArgumentError, "Invalid ContextDrop position #{value.inspect}. Must be one of: #{VALID_POSITIONS.join(', ')}"
      end

      @position = sym
    end

    def selection_mode=(value)
      sym = value.nil? ? :auto : value.to_s.strip.downcase.to_sym
      unless VALID_SELECTION_MODES.include?(sym)
        raise ArgumentError, "Invalid ContextDrop selection_mode #{value.inspect}. Must be one of: #{VALID_SELECTION_MODES.join(', ')}"
      end

      @selection_mode = sym
    end

    def resolved_selection_mode(override = nil)
      candidate = override.nil? ? @selection_mode : override.to_s.strip.downcase.to_sym
      return "smart" if candidate == :smart
      return "verbose" if candidate == :verbose

      rails_production? ? "smart" : "verbose"
    end

    def resolved_environment
      explicit = @environment.to_s.strip
      return explicit.downcase unless explicit.empty?

      if defined?(Rails) && Rails.respond_to?(:env) && Rails.env
        env_str = Rails.env.to_s.strip
        return env_str.downcase unless env_str.empty?
      end

      fallback = (ENV["CONTEXT_DROP_ENV"] || ENV["RAILS_ENV"] || ENV["RACK_ENV"] || "development").to_s.strip
      fallback.empty? ? "development" : fallback.downcase
    end

    def rails_production?
      (defined?(Rails) && Rails.respond_to?(:env) && Rails.env&.production?) || resolved_environment == "production"
    end

    def local_environment?
      return false if rails_production?

      resolved_environment == "development"
    end

    # Local agentic coding sidebar is strictly restricted to non-production `development` environments.
    def local_agent_allowed?
      return false if rails_production?

      Boolean(@local_agent_enabled) && local_environment?
    end

    def resolved_workspace_root
      explicit = @local_agent_workspace_root.to_s.strip
      return explicit unless explicit.empty?

      if defined?(Rails) && Rails.respond_to?(:root) && Rails.root
        Rails.root.to_s
      else
        Dir.pwd
      end
    end

    def resolved_key_store_path
      explicit = @local_agent_key_store_path.to_s.strip
      return explicit unless explicit.empty?

      File.join(resolved_workspace_root, "tmp", "context_drop_byok.enc")
    end

    # Verifies that an HTTP request originates from strict local loopback without external proxy forwarding
    # or non-local Host headers (DNS-rebinding defense).
    def loopback_request?(request)
      return false if request.nil?

      remote_addr = (request.respond_to?(:remote_addr) ? request.remote_addr : nil).to_s.strip
      remote_ip = (request.respond_to?(:remote_ip) ? request.remote_ip : nil).to_s.strip

      addr_ok = (!remote_addr.empty? && LOOPBACK_IPS.include?(remote_addr)) ||
                (remote_addr.empty? && LOOPBACK_IPS.include?(remote_ip))
      ip_ok = remote_ip.empty? || LOOPBACK_IPS.include?(remote_ip)
      return false unless addr_ok && ip_ok

      if request.respond_to?(:headers) && request.headers
        xff = request.headers["X-Forwarded-For"].to_s.strip
        unless xff.empty?
          hops = xff.split(",").map(&:strip).reject(&:empty?)
          return false unless hops.all? { |hop| LOOPBACK_IPS.include?(hop) }
        end
      end

      host_with_port = if request.respond_to?(:host_with_port) && request.host_with_port
                         request.host_with_port.to_s
                       elsif request.respond_to?(:host) && request.host
                         request.host.to_s
                       else
                         ""
                       end
      return false if !host_with_port.empty? && !LOOPBACK_HOST_PATTERN.match?(host_with_port)

      true
    rescue StandardError
      false
    end

    # Returns normalized remote MCP environment definitions merged from `config.mcp_environments`,
    # `ENV["CONTEXT_DROP_REMOTE_ENVIRONMENTS"]`, and `ENV["CONTEXT_DROP_<ENV>_MCP_URL"]` pairs.
    def effective_mcp_environments(env_vars = ENV)
      merged = {}

      raw_json = env_vars["CONTEXT_DROP_REMOTE_ENVIRONMENTS"].to_s.strip
      unless raw_json.empty?
        begin
          parsed = JSON.parse(raw_json)
          if parsed.is_a?(Hash)
            parsed.each do |name, cfg|
              norm = normalize_mcp_env_entry(name, cfg)
              merged[norm[:name]] = norm[:config] if norm
            end
          end
        rescue JSON::ParserError
          # Ignore malformed JSON env variable
        end
      end

      env_vars.each do |key, val|
        match = /\ACONTEXT_DROP_([A-Z0-9_]+)_MCP_URL\z/.match(key.to_s)
        next unless match

        env_token_key = match[1]
        next if env_token_key.empty?

        url_str = val.to_s.strip
        next if url_str.empty?

        env_name = env_token_key.downcase
        api_key = env_vars["CONTEXT_DROP_#{env_token_key}_MCP_API_KEY"].to_s.strip
        norm = normalize_mcp_env_entry(env_name, { url: url_str, api_key: api_key })
        merged[norm[:name]] = norm[:config] if norm
      end

      if @mcp_environments.is_a?(Hash)
        @mcp_environments.each do |name, cfg|
          norm = normalize_mcp_env_entry(name, cfg)
          merged[norm[:name]] = norm[:config] if norm
        end
      end

      merged
    end

    def effective_excluded_selectors
      (MANDATORY_EXCLUDED_SELECTORS + Array(@excluded_selectors).map(&:to_s)).uniq
    end

    def resolve_submitter(controller)
      return nil unless @current_submitter.respond_to?(:call)

      @current_submitter.call(controller)
    end

    def submission_authorized?(controller)
      submitter = resolve_submitter(controller)
      return false if !@allow_anonymous && submitter.nil?
      return true unless @authorize_submission.respond_to?(:call)

      !!@authorize_submission.call(controller)
    end

    def dashboard_authorized?(controller)
      return false unless @authorize_dashboard.respond_to?(:call)

      !!@authorize_dashboard.call(controller)
    end

    def public_widget_config(overrides = {})
      resolved_position = overrides[:position] ? normalize_position(overrides[:position]) : @position
      agent_active = if overrides.key?(:agent_enabled)
                       local_agent_allowed? && !!overrides[:agent_enabled]
                     else
                       local_agent_allowed?
                     end

      {
        enabled: !!@enabled,
        environment: resolved_environment,
        position: resolved_position.to_s,
        placeholder: (overrides[:placeholder] || "What would you like to tell us?").to_s,
        agent: {
          enabled: agent_active
        },
        features: {
          element_selection: !!@element_selection,
          selection_mode: resolved_selection_mode(overrides[:selection_mode]),
          screenshot_capture: !!@screenshot_capture,
          element_capture_padding: @element_capture_padding.to_i,
          smart_capture_padding: @smart_capture_padding.to_i
        },
        limits: {
          max_attachments: @max_attachments.to_i,
          max_element_references: @max_element_references.to_i,
          max_attachment_size: @max_attachment_size.to_i,
          allowed_content_types: Array(@allowed_content_types),
          max_image_dimensions: Array(@max_image_dimensions)
        },
        privacy: {
          excluded_selectors: effective_excluded_selectors
        }
      }
    end

    private

    def normalize_mcp_env_entry(name, raw_cfg)
      env_name = name.to_s.strip.downcase
      return nil if env_name.empty? || %w[local all].include?(env_name)
      return nil unless raw_cfg.is_a?(Hash)

      str_cfg = raw_cfg.transform_keys(&:to_s)
      url = str_cfg["url"].to_s.strip
      return nil if url.empty?

      headers = str_cfg["headers"].is_a?(Hash) ? str_cfg["headers"].transform_keys(&:to_s) : {}
      {
        name: env_name,
        config: {
          url: url,
          api_key: str_cfg["api_key"].to_s.strip,
          headers: headers,
          allow_insecure_http: !!str_cfg["allow_insecure_http"]
        }
      }
    end

    def normalize_position(pos)
      sym = pos.to_s.strip.to_sym
      VALID_POSITIONS.include?(sym) ? sym : @position
    end

    def Boolean(val) # rubocop:disable Naming/MethodName
      !!val
    end
  end
end
