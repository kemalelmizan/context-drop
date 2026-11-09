# frozen_string_literal: true

require "json"
require "erb"

module ContextDrop
  module WidgetHelper
    # Renders the `<context-drop-widget>` custom element and script tag when ContextDrop is enabled
    # and the current visitor is authorized to submit feedback.
    #
    # Supports per-page option overrides (`position:`, `placeholder:`, `metadata:`, `endpoint:`).
    def context_drop_widget(**options)
      cfg = ContextDrop.config
      return nil unless cfg.enabled

      controller_instance = respond_to?(:controller) ? controller : nil
      return nil unless cfg.submission_authorized?(controller_instance)

      widget_config = cfg.public_widget_config(options)
      mount_path = resolve_context_drop_mount_path(options[:endpoint])
      custom_metadata = options[:metadata].is_a?(Hash) ? options[:metadata] : {}

      attrs = {
        "data-endpoint" => mount_path,
        "data-position" => widget_config[:position],
        "data-placeholder" => widget_config[:placeholder],
        "data-config" => JSON.generate(widget_config),
        "data-metadata" => JSON.generate(custom_metadata)
      }

      attr_string = attrs.map { |k, v| %(#{k}="#{ERB::Util.html_escape(v)}") }.join(" ")
      widget_html = "<context-drop-widget #{attr_string}></context-drop-widget>"

      script_html = if respond_to?(:javascript_include_tag)
                      begin
                        javascript_include_tag("context_drop/context_drop", defer: true)
                      rescue StandardError
                        %(<script src="#{ERB::Util.html_escape(mount_path)}/assets/context_drop.js" defer="defer"></script>)
                      end
                    else
                      %(<script src="#{ERB::Util.html_escape(mount_path)}/assets/context_drop.js" defer="defer"></script>)
                    end

      output = "#{widget_html}\n#{script_html}"
      output.respond_to?(:html_safe) ? output.html_safe : output
    end

    private

    def resolve_context_drop_mount_path(explicit_endpoint = nil)
      return explicit_endpoint.to_s.chomp("/") if explicit_endpoint && !explicit_endpoint.to_s.strip.empty?

      if respond_to?(:context_drop) && context_drop.respond_to?(:root_path)
        context_drop.root_path.to_s.chomp("/")
      else
        "/context_drop"
      end
    rescue StandardError
      "/context_drop"
    end
  end
end
