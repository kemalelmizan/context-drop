# frozen_string_literal: true

require "stringio"
begin
  require "marcel"
rescue LoadError
  # Fallback to built-in magic byte detection if Marcel is not loaded
end

module ContextDrop
  class UploadValidator
    class ValidationError < ContextDrop::Error
      attr_reader :http_status

      def initialize(message, http_status: :unprocessable_entity)
        super(message)
        @http_status = http_status
      end
    end

    MIME_EXTENSIONS = {
      "image/png" => %w[.png],
      "image/jpeg" => %w[.jpg .jpeg],
      "image/webp" => %w[.webp],
      "image/gif" => %w[.gif]
    }.freeze

    PNG_SIGNATURE = "\x89PNG\r\n\x1A\n".b.freeze
    JPEG_SIGNATURE = "\xFF\xD8\xFF".b.freeze
    GIF87_SIGNATURE = "GIF87a".b.freeze
    GIF89_SIGNATURE = "GIF89a".b.freeze
    RIFF_SIGNATURE = "RIFF".b.freeze
    WEBP_SIGNATURE = "WEBP".b.freeze

    class << self
      # Validates an uploaded file (ActionDispatch::Http::UploadedFile, Rack::Test::UploadedFile, or Hash/IO)
      # Returns a normalized Hash `{ io:, filename:, content_type:, byte_size:, dimensions: [w, h] }`
      def validate!(upload)
        io, original_filename = extract_io_and_filename(upload)
        raise ValidationError, "Missing file upload" if io.nil?

        io.rewind if io.respond_to?(:rewind)
        raw_bytes = io.read.to_s.b
        io.rewind if io.respond_to?(:rewind)

        byte_size = raw_bytes.bytesize
        raise ValidationError, "Uploaded file cannot be empty" if byte_size.zero?

        max_size = ContextDrop.config.max_attachment_size.to_i
        if max_size.positive? && byte_size > max_size
          raise ValidationError.new(
            "File size (#{byte_size} bytes) exceeds maximum allowed size (#{max_size} bytes)",
            http_status: :unprocessable_entity
          )
        end

        detected_mime = detect_magic_mime_type(raw_bytes)
        allowed_types = Array(ContextDrop.config.allowed_content_types)

        if detected_mime.nil? || !allowed_types.include?(detected_mime)
          raise ValidationError, "Unsupported or invalid file content type (detected: #{detected_mime || 'unknown'})"
        end

        sanitized_filename = sanitize_filename(original_filename, detected_mime)
        validate_extension!(sanitized_filename, detected_mime)

        dimensions = extract_image_dimensions(raw_bytes, detected_mime)
        validate_dimensions!(dimensions)

        {
          io: StringIO.new(raw_bytes),
          filename: sanitized_filename,
          content_type: detected_mime,
          byte_size: byte_size,
          dimensions: dimensions
        }
      end

      def detect_magic_mime_type(bytes)
        header = bytes[0, 32].to_s.b
        magic_mime = if header.start_with?(PNG_SIGNATURE)
                       "image/png"
                     elsif header.start_with?(JPEG_SIGNATURE)
                       "image/jpeg"
                     elsif header.start_with?(GIF87_SIGNATURE) || header.start_with?(GIF89_SIGNATURE)
                       "image/gif"
                     elsif header.bytesize >= 12 && header[0, 4] == RIFF_SIGNATURE && header[8, 4] == WEBP_SIGNATURE
                       "image/webp"
                     end

        return magic_mime if magic_mime

        if defined?(Marcel::MimeType)
          marcel_type = Marcel::MimeType.for(StringIO.new(bytes))
          return marcel_type if MIME_EXTENSIONS.key?(marcel_type)
        end

        nil
      end

      def extract_image_dimensions(bytes, mime_type)
        case mime_type
        when "image/png"
          return nil if bytes.bytesize < 24

          bytes[16, 8].unpack("NN")
        when "image/gif"
          return nil if bytes.bytesize < 10

          bytes[6, 4].unpack("vv")
        when "image/webp"
          extract_webp_dimensions(bytes)
        when "image/jpeg"
          extract_jpeg_dimensions(bytes)
        end
      rescue StandardError
        nil
      end

      def sanitize_filename(filename, detected_mime)
        default_ext = MIME_EXTENSIONS.fetch(detected_mime, [".bin"]).first
        return "attachment#{default_ext}" if filename.nil? || filename.to_s.strip.empty?

        base = File.basename(filename.to_s.strip).gsub(/[^a-zA-Z0-9._-]/, "_")
        base = "attachment#{default_ext}" if base.empty? || base.start_with?(".")
        base
      end

      private

      def extract_io_and_filename(upload)
        if upload.respond_to?(:tempfile) && upload.respond_to?(:original_filename)
          [upload.tempfile, upload.original_filename]
        elsif upload.is_a?(Hash)
          io = upload[:io] || upload["io"] || upload[:tempfile] || upload["tempfile"]
          fname = upload[:filename] || upload["filename"] || upload[:original_filename] || upload["original_filename"]
          [io, fname]
        elsif upload.respond_to?(:read)
          fname = upload.respond_to?(:original_filename) ? upload.original_filename : "screenshot.png"
          [upload, fname]
        else
          [nil, nil]
        end
      end

      def validate_extension!(filename, detected_mime)
        ext = File.extname(filename).downcase
        allowed_exts = MIME_EXTENSIONS[detected_mime] || []
        return if ext.empty? || allowed_exts.include?(ext)

        raise ValidationError, "File extension '#{ext}' does not match detected content type '#{detected_mime}'"
      end

      def validate_dimensions!(dimensions)
        return if dimensions.nil?

        max_dims = Array(ContextDrop.config.max_image_dimensions)
        return unless max_dims.size == 2

        width, height = dimensions
        max_w, max_h = max_dims.map(&:to_i)

        if width <= 0 || height <= 0
          raise ValidationError, "Invalid image dimensions (#{width}x#{height})"
        end

        return unless (max_w.positive? && width > max_w) || (max_h.positive? && height > max_h)

        raise ValidationError, "Image dimensions (#{width}x#{height}) exceed maximum allowed (#{max_w}x#{max_h})"
      end

      def extract_webp_dimensions(bytes)
        return nil if bytes.bytesize < 30

        chunk_type = bytes[12, 4]
        case chunk_type
        when "VP8 ".b
          w, h = bytes[26, 4].unpack("vv")
          [w & 0x3FFF, h & 0x3FFF]
        when "VP8L".b
          bits = bytes[21, 4].unpack1("V")
          w = (bits & 0x3FFF) + 1
          h = ((bits >> 14) & 0x3FFF) + 1
          [w, h]
        when "VP8X".b
          w = (bytes[24, 3] + "\x00".b).unpack1("V") + 1
          h = (bytes[27, 3] + "\x00".b).unpack1("V") + 1
          [w, h]
        end
      end

      def extract_jpeg_dimensions(bytes)
        idx = 2
        len = bytes.bytesize
        while idx + 9 < len
          if bytes.getbyte(idx) != 0xFF
            idx += 1
            next
          end
          marker = bytes.getbyte(idx + 1)
          idx += 2
          next if marker == 0xD8 || marker == 0xD9 || (marker >= 0xD0 && marker <= 0xD7)

          seg_len = bytes[idx, 2].unpack1("n")
          break if seg_len.nil? || seg_len < 2

          if [0xC0, 0xC1, 0xC2, 0xC3].include?(marker)
            height, width = bytes[idx + 3, 4].unpack("nn")
            return [width, height]
          end
          idx += seg_len
        end
        nil
      end
    end
  end
end
