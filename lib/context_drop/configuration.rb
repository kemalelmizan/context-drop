# frozen_string_literal: true

module ContextDrop
  class Configuration
    VALID_POSITIONS = %i[bottom_right bottom_left top_right top_left].freeze

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
                  :excluded_selectors,
                  :current_submitter,
                  :authorize_submission,
                  :authorize_dashboard,
                  :rate_limit,
                  :on_feedback_created,
                  :mcp_enabled,
                  :mcp_api_key,
                  :authorize_mcp

    attr_reader :position

    def initialize
      @enabled = false
      @position = :bottom_right
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
    end

    def position=(value)
      sym = value.to_s.strip.to_sym
      unless VALID_POSITIONS.include?(sym)
        raise ArgumentError, "Invalid ContextDrop position #{value.inspect}. Must be one of: #{VALID_POSITIONS.join(', ')}"
      end

      @position = sym
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

      {
        enabled: !!@enabled,
        position: resolved_position.to_s,
        placeholder: (overrides[:placeholder] || "What would you like to tell us?").to_s,
        features: {
          element_selection: !!@element_selection,
          screenshot_capture: !!@screenshot_capture,
          element_capture_padding: @element_capture_padding.to_i
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

    def normalize_position(pos)
      sym = pos.to_s.strip.to_sym
      VALID_POSITIONS.include?(sym) ? sym : @position
    end

    def Boolean(val) # rubocop:disable Naming/MethodName
      !!val
    end
  end
end
