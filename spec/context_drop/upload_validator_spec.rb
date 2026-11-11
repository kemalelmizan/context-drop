# frozen_string_literal: true

require_relative "../spec_helper"

RSpec.describe "ContextDrop::UploadValidator" do
  # Valid 1x1 PNG binary
  VALID_1X1_PNG = [
    "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489" \
    "0000000a49444154789c63000100000500010d0a2db40000000049454e44ae426082"
  ].pack("H*").freeze

  before do
    ContextDrop.reset_configuration!
  end

  it "validates a genuine PNG upload by magic bytes and extracts dimensions" do
    upload = {
      io: StringIO.new(VALID_1X1_PNG),
      filename: "viewport screenshot.png"
    }

    result = ContextDrop::UploadValidator.validate!(upload)
    expect(result[:content_type]).to eq("image/png")
    expect(result[:filename]).to eq("viewport_screenshot.png")
    expect(result[:byte_size]).to eq(VALID_1X1_PNG.bytesize)
    expect(result[:dimensions]).to eq([1, 1])
  end

  it "rejects an HTML or script payload disguised with a .png extension" do
    disguised = {
      io: StringIO.new("<html><script>alert('xss')</script></html>"),
      filename: "exploit.png",
      content_type: "image/png"
    }

    expect do
      ContextDrop::UploadValidator.validate!(disguised)
    end.to raise_error(ContextDrop::UploadValidator::ValidationError, /Unsupported or invalid file content type/)
  end

  it "rejects uploads exceeding max_attachment_size" do
    ContextDrop.config.max_attachment_size = 16

    upload = {
      io: StringIO.new(VALID_1X1_PNG),
      filename: "too_large.png"
    }

    expect do
      ContextDrop::UploadValidator.validate!(upload)
    end.to raise_error(ContextDrop::UploadValidator::ValidationError, /exceeds maximum allowed size/)
  end

  it "rejects images exceeding max_image_dimensions" do
    ContextDrop.config.max_image_dimensions = [100, 100]

    # Craft a PNG header reporting 5000x5000 dimensions
    oversized_png = VALID_1X1_PNG.dup
    oversized_png[16, 8] = [5000, 5000].pack("NN")

    upload = {
      io: StringIO.new(oversized_png),
      filename: "huge.png"
    }

    expect do
      ContextDrop::UploadValidator.validate!(upload)
    end.to raise_error(ContextDrop::UploadValidator::ValidationError, /exceed maximum allowed/)
  end
end
