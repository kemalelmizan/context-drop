# frozen_string_literal: true

require_relative "../spec_helper"

RSpec.describe "ContextDrop::MCP::Server & Dispatcher" do
  # Lightweight in-memory mock records for testing MCP tools/resources/prompts without a live DB connection
  FakeElementRef = Struct.new(
    :id, :client_ref, :tag_name, :selector, :dom_path, :text_content,
    :attributes_snapshot, :bounding_rect, :viewport, :metadata, :captured_at,
    keyword_init: true
  )

  FakeBlob = Struct.new(:attached?, :byte_size, :download, :content_type, :filename, keyword_init: true)

  FakeAttachment = Struct.new(
    :id, :feedback_id, :element_reference_id, :element_reference, :attachment_type,
    :metadata, :file, :created_at,
    keyword_init: true
  )

  class FakeFeedbackRecord
    attr_accessor :id, :status, :message, :page_url, :user_agent, :submitter_type, :submitter_id,
                  :metadata, :element_references, :attachments, :created_at, :updated_at

    def initialize(attrs = {})
      attrs.each { |k, v| public_send("#{k}=", v) }
      @element_references ||= []
      @attachments ||= []
      @metadata ||= {}
      @created_at ||= Time.utc(2026, 11, 9, 12, 0, 0)
      @updated_at ||= @created_at
    end

    def submitter_label
      submitter_type ? "#{submitter_type}##{submitter_id}" : "Anonymous"
    end

    def update!(attrs)
      attrs.each { |k, v| public_send("#{k}=", v) }
      @updated_at = Time.utc(2026, 11, 9, 12, 5, 0)
      true
    end
  end

  class FakeRelation
    include Enumerable

    def initialize(records)
      @records = records
    end

    def each(&block) = @records.each(&block)
    def includes(*_args) = self
    def recent = FakeRelation.new(@records.sort_by { |r| [-r.created_at.to_i, -r.id.to_i] })
    def new_records = where(status: "new")
    def left_outer_joins(*_args) = self
    def distinct = self
    def count = @records.size
    def limit(n) = FakeRelation.new(@records.first(n))
    def offset(n) = FakeRelation.new(@records.drop(n))
    def find_by(id:) = @records.find { |r| r.id.to_s == id.to_s }

    def where(cond, *bind_vals)
      if cond.is_a?(Hash)
        filtered = @records.select do |r|
          cond.all? { |k, v| r.public_send(k).to_s == v.to_s }
        end
        FakeRelation.new(filtered)
      elsif cond.to_s.include?("page_url LIKE")
        sub = bind_vals.first.to_s.delete("%")
        FakeRelation.new(@records.select { |r| r.page_url.to_s.include?(sub) })
      elsif cond.to_s.include?(":q")
        q_hash = bind_vals.first || {}
        sub = q_hash[:q].to_s.delete("%").downcase
        filtered = @records.select do |r|
          r.message.to_s.downcase.include?(sub) ||
            r.element_references.any? { |el| el.selector.to_s.downcase.include?(sub) || el.text_content.to_s.downcase.include?(sub) }
        end
        FakeRelation.new(filtered)
      else
        self
      end
    end
  end

  before do
    el1 = FakeElementRef.new(
      id: 101,
      client_ref: "el_btn",
      tag_name: "button",
      selector: "#checkout-button",
      dom_path: "html > body > main > button#checkout-button",
      text_content: "Pay Now",
      attributes_snapshot: { "id" => "checkout-button", "class" => "btn-primary" },
      bounding_rect: { "x" => 120, "y" => 340, "width" => 160, "height" => 44 },
      viewport: { "width" => 1440, "height" => 900 },
      metadata: {},
      captured_at: Time.utc(2026, 11, 9, 12, 0, 0)
    )

    blob1 = FakeBlob.new(
      attached?: true,
      byte_size: 16,
      download: "PNG_BINARY_BYTES",
      content_type: "image/png",
      filename: "checkout-shot.png"
    )

    @att1 = FakeAttachment.new(
      id: 201,
      feedback_id: 42,
      element_reference_id: 101,
      element_reference: el1,
      attachment_type: "screenshot",
      metadata: { "capture_type" => "element" },
      file: blob1,
      created_at: Time.utc(2026, 11, 9, 12, 0, 0)
    )

    @fb42 = FakeFeedbackRecord.new(
      id: 42,
      status: "new",
      message: "Checkout button does not respond on click",
      page_url: "https://app.example.com/checkout",
      user_agent: "Mozilla/5.0",
      submitter_type: "User",
      submitter_id: 15,
      metadata: { "viewport" => { "width" => 1440, "height" => 900 } },
      element_references: [el1],
      attachments: [@att1]
    )

    @fb43 = FakeFeedbackRecord.new(
      id: 43,
      status: "resolved",
      message: "Settings header typo",
      page_url: "https://app.example.com/settings",
      element_references: [],
      attachments: []
    )

    records = [@fb42, @fb43]
    attachments = [@att1]

    unless defined?(ContextDrop::Feedback)
      ContextDrop.const_set(:Feedback, Class.new do
        const_set(:STATUSES, %w[new reviewed resolved dismissed].freeze)
      end)
    end

    ContextDrop::Feedback.define_singleton_method(:includes) { |*_a| FakeRelation.new(records) }
    ContextDrop::Feedback.define_singleton_method(:find_by) { |id:| records.find { |r| r.id.to_s == id.to_s } }

    unless defined?(ContextDrop::Attachment)
      ContextDrop.const_set(:Attachment, Class.new)
    end
    ContextDrop::Attachment.define_singleton_method(:includes) do |*_a|
      Struct.new(:items) do
        def find_by(id:)
          items.find { |a| a.id.to_s == id.to_s }
        end
      end.new(attachments)
    end
  end

  it "handles MCP initialize and tools/list requests" do
    init_res = ContextDrop::MCP::Dispatcher.call(
      "jsonrpc" => "2.0",
      "id" => 1,
      "method" => "initialize",
      "params" => { "protocolVersion" => "2025-03-26" }
    )

    expect(init_res[:id]).to eq(1)
    expect(init_res[:result][:serverInfo][:name]).to eq("context_drop")

    tools_res = ContextDrop::MCP::Dispatcher.call(
      "jsonrpc" => "2.0",
      "id" => 2,
      "method" => "tools/list"
    )
    tool_names = tools_res[:result][:tools].map { |t| t[:name] }
    expect(tool_names).to eq(%w[list_environments list_feedbacks get_feedback get_feedback_attachment update_feedback_status])
  end

  it "filters feedbacks via list_feedbacks tool" do
    res = ContextDrop::MCP::Dispatcher.call(
      "jsonrpc" => "2.0",
      "id" => 3,
      "method" => "tools/call",
      "params" => {
        "name" => "list_feedbacks",
        "arguments" => { "status" => "new", "page_url" => "/checkout" }
      }
    )

    parsed = JSON.parse(res[:result][:content].first[:text])
    expect(parsed["total"]).to eq(1)
    expect(parsed["feedbacks"].first["id"]).to eq(42)
    expect(parsed["feedbacks"].first["element_selectors"]).to eq(["#checkout-button"])
  end

  it "returns full feedback, ElementReference snapshots, and base64 MCP image blocks via get_feedback" do
    res = ContextDrop::MCP::Dispatcher.call(
      "jsonrpc" => "2.0",
      "id" => 4,
      "method" => "tools/call",
      "params" => {
        "name" => "get_feedback",
        "arguments" => { "id" => 42, "include_images" => true }
      }
    )

    blocks = res[:result][:content]
    expect(blocks.size).to eq(2)
    expect(blocks[0][:type]).to eq("text")
    json_data = JSON.parse(blocks[0][:text])
    expect(json_data["id"]).to eq(42)
    expect(json_data["element_references"].first["selector"]).to eq("#checkout-button")

    expect(blocks[1][:type]).to eq("image")
    expect(blocks[1][:mimeType]).to eq("image/png")
    expect(ContextDrop::Base64Util.strict_decode64(blocks[1][:data])).to eq("PNG_BINARY_BYTES")
  end

  it "transitions feedback status via update_feedback_status tool" do
    res = ContextDrop::MCP::Dispatcher.call(
      "jsonrpc" => "2.0",
      "id" => 5,
      "method" => "tools/call",
      "params" => {
        "name" => "update_feedback_status",
        "arguments" => { "id" => 42, "status" => "resolved" }
      }
    )

    parsed = JSON.parse(res[:result][:content].first[:text])
    expect(parsed["status"]).to eq("resolved")
    expect(@fb42.status).to eq("resolved")
  end

  it "generates an investigation brief via prompts/get investigate_feedback" do
    res = ContextDrop::MCP::Dispatcher.call(
      "jsonrpc" => "2.0",
      "id" => 6,
      "method" => "prompts/get",
      "params" => {
        "name" => "investigate_feedback",
        "arguments" => { "feedback_id" => 42 }
      }
    )

    messages = res[:result][:messages]
    expect(messages.size).to eq(1)
    text_block = messages.first[:content].first
    expect(text_block[:text]).to include("#checkout-button")
    expect(text_block[:text]).to include("https://app.example.com/checkout")
  end

  it "processes JSON-RPC 2.0 streams cleanly over StdioRunner" do
    input = StringIO.new(
      "#{JSON.generate(jsonrpc: '2.0', id: 10, method: 'ping')}\n" \
      "#{JSON.generate(jsonrpc: '2.0', method: 'notifications/initialized')}\n"
    )
    output = StringIO.new
    err = StringIO.new

    runner = ContextDrop::MCP::StdioRunner.new(input: input, output: output, error: err)
    runner.run

    lines = output.string.lines.map(&:strip).reject(&:empty?)
    expect(lines.size).to eq(1)
    parsed = JSON.parse(lines.first)
    expect(parsed["id"]).to eq(10)
    expect(parsed["result"]).to eq({})
  end

  it "retrieves individual attachment via get_feedback_attachment and reads MCP resources" do
    att_res = ContextDrop::MCP::Dispatcher.call(
      "jsonrpc" => "2.0",
      "id" => 11,
      "method" => "tools/call",
      "params" => {
        "name" => "get_feedback_attachment",
        "arguments" => { "attachment_id" => 201 }
      }
    )

    blocks = att_res[:result][:content]
    expect(blocks.size).to eq(2)
    expect(blocks[1][:type]).to eq("image")

    res_new = ContextDrop::MCP::Dispatcher.call(
      "jsonrpc" => "2.0",
      "id" => 12,
      "method" => "resources/read",
      "params" => { "uri" => "contextdrop://feedbacks/new" }
    )
    contents = JSON.parse(res_new[:result][:contents].first[:text])
    expect(contents["feedbacks"].size).to eq(1)
    expect(contents["feedbacks"].first["id"]).to eq(42)

    res_id = ContextDrop::MCP::Dispatcher.call(
      "jsonrpc" => "2.0",
      "id" => 13,
      "method" => "resources/read",
      "params" => { "uri" => "contextdrop://feedbacks/42" }
    )
    fb_payload = JSON.parse(res_id[:result][:contents].first[:text])
    expect(fb_payload["id"]).to eq(42)
  end

  describe "Unified multi-environment MCP federation" do
    before do
      ContextDrop.reset_configuration!
      ContextDrop.configure do |config|
        config.environment = "development"
        config.mcp_environments = {
          staging: {
            url: "https://staging.example.com/context_drop/mcp",
            api_key: "staging_secret_key"
          },
          production: {
            url: "https://app.example.com/context_drop/mcp",
            api_key: "prod_secret_key"
          }
        }
      end

      ContextDrop::MCP::RemoteClient.transport = lambda do |env_name, _cfg, method, params|
        if method == "ping"
          {}
        elsif method == "tools/call" && params[:name] == "list_feedbacks"
          remote_fb = {
            id: env_name == "staging" ? 901 : 902,
            status: "new",
            message: "Remote #{env_name} checkout bug",
            page_url: "https://#{env_name}.example.com/checkout",
            submitter: "QA",
            attachments_count: 0,
            element_references_count: 1,
            element_selectors: ["#remote-btn"],
            created_at: "2026-11-11T10:00:00Z"
          }
          {
            content: [{ type: "text", text: JSON.generate(total: 1, limit: 20, offset: 0, feedbacks: [remote_fb]) }],
            isError: false
          }
        elsif method == "tools/call" && params[:name] == "get_feedback"
          {
            content: [
              {
                type: "text",
                text: JSON.generate(
                  id: params[:arguments]["id"].to_i,
                  status: "new",
                  message: "Remote staging details",
                  page_url: "https://staging.example.com/checkout",
                  element_references: [{ selector: "#staging-pay-btn", tag_name: "button" }],
                  attachments: []
                )
              }
            ],
            isError: false
          }
        elsif method == "tools/call" && params[:name] == "update_feedback_status"
          {
            content: [
              {
                type: "text",
                text: JSON.generate(
                  id: params[:arguments]["id"].to_i,
                  previous_status: "new",
                  status: params[:arguments]["status"],
                  page_url: "https://staging.example.com/checkout"
                )
              }
            ],
            isError: false
          }
        else
          raise ContextDrop::MCP::RemoteClient::RemoteError, "Unhandled stub #{method}"
        end
      end
    end

    after do
      ContextDrop::MCP::RemoteClient.transport = nil
      ContextDrop.reset_configuration!
    end

    it "lists local host environment alongside federated remote environments" do
      res = ContextDrop::MCP::Dispatcher.call(
        "jsonrpc" => "2.0",
        "id" => 20,
        "method" => "tools/call",
        "params" => { "name" => "list_environments", "arguments" => { "ping_remotes" => true } }
      )

      parsed = JSON.parse(res[:result][:content].first[:text])
      expect(parsed["host_environment"]).to eq("development")
      env_names = parsed["environments"].map { |e| e["name"] }
      expect(env_names).to eq(%w[development staging production])
      staging_entry = parsed["environments"].find { |e| e["name"] == "staging" }
      expect(staging_entry["reachable"]).to eq(true)
    end

    it "aggregates feedbacks across local, staging, and production when environment is 'all'" do
      res = ContextDrop::MCP::Dispatcher.call(
        "jsonrpc" => "2.0",
        "id" => 21,
        "method" => "tools/call",
        "params" => { "name" => "list_feedbacks", "arguments" => { "status" => "new" } }
      )

      parsed = JSON.parse(res[:result][:content].first[:text])
      expect(parsed["environment"]).to eq("all")
      expect(parsed["total"]).to eq(3) # 1 local (#42) + 1 staging (#901) + 1 production (#902)
      qualified_ids = parsed["feedbacks"].map { |f| f["qualified_id"] }
      expect(qualified_ids).to include("development:42")
      expect(qualified_ids).to include("staging:901")
      expect(qualified_ids).to include("production:902")
    end

    it "routes get_feedback and update_feedback_status to remote environment via qualified '<env>:<id>'" do
      get_res = ContextDrop::MCP::Dispatcher.call(
        "jsonrpc" => "2.0",
        "id" => 22,
        "method" => "tools/call",
        "params" => { "name" => "get_feedback", "arguments" => { "id" => "staging:901" } }
      )
      fb_json = JSON.parse(get_res[:result][:content].first[:text])
      expect(fb_json["environment"]).to eq("staging")
      expect(fb_json["qualified_id"]).to eq("staging:901")
      expect(fb_json["element_references"].first["selector"]).to eq("#staging-pay-btn")

      upd_res = ContextDrop::MCP::Dispatcher.call(
        "jsonrpc" => "2.0",
        "id" => 23,
        "method" => "tools/call",
        "params" => {
          "name" => "update_feedback_status",
          "arguments" => { "id" => "staging:901", "status" => "resolved" }
        }
      )
      upd_json = JSON.parse(upd_res[:result][:content].first[:text])
      expect(upd_json["environment"]).to eq("staging")
      expect(upd_json["status"]).to eq("resolved")
    end

    it "prevents recursive remote fan-out when invoked via handle_http_payload(local_only: true)" do
      res = ContextDrop::MCP::Server.handle_http_payload(
        {
          "jsonrpc" => "2.0",
          "id" => 24,
          "method" => "tools/call",
          "params" => { "name" => "list_feedbacks", "arguments" => { "status" => "new" } }
        },
        local_only: true
      )

      parsed = JSON.parse(res[:result][:content].first[:text])
      expect(parsed["total"]).to eq(1)
      expect(parsed["feedbacks"].first["id"]).to eq(42)
    end

    it "rejects insecure non-loopback http:// remote MCP URLs" do
      expect do
        ContextDrop::MCP::RemoteClient.validate_endpoint_uri!(
          "staging",
          "http://staging.example.com/context_drop/mcp",
          allow_insecure_http: false
        )
      end.to raise_error(ContextDrop::MCP::RemoteClient::RemoteError, /Insecure HTTP MCP URL refused/)
    end
  end
end
