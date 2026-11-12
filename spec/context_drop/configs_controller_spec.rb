# frozen_string_literal: true

require_relative "../spec_helper"
require_relative "../dummy/config/environment"

RSpec.describe "ContextDrop::ConfigsController" do
  let(:app) { Rails.application }
  let(:session) do
    ActionDispatch::Integration::Session.new(app).tap do |s|
      s.default_url_options[:host] = "localhost"
    end
  end

  before do
    ContextDrop.reset_configuration!
    ContextDrop.configure do |config|
      config.enabled = true
      config.position = :bottom_right
      config.allow_anonymous = true
    end
  end

  it "skips forgery protection for widget_bundle action" do
    # Verify that verify_authenticity_token is not in before_actions for :widget_bundle
    # or that a cross-origin script request is served with 200 and does not raise InvalidCrossOriginRequest
    session.get "/context_drop/assets/context_drop.js",
                headers: {
                  "HTTP_HOST" => "localhost",
                  "HTTP_ORIGIN" => "http://external-spa.example.com"
                }

    expect(session.response.status).to eq(200)
    expect(session.response.content_type).to eq("application/javascript")
  end

  it "returns 200 and exposes csrf_token alongside public widget configuration in GET /config" do
    session.get "/context_drop/config",
                headers: {
                  "HTTP_HOST" => "localhost",
                  "HTTP_ACCEPT" => "application/json"
                }

    expect(session.response.status).to eq(200)
    payload = JSON.parse(session.response.body)

    expect(payload["enabled"]).to eq(true)
    expect(payload["position"]).to eq("bottom_right")
    expect(payload.key?("csrf_token")).to eq(true)
    expect(payload["csrf_token"]).to be_a(String)
    expect(payload["csrf_token"].empty?).to eq(false)
  end

  it "enforces submission authorization on GET /config when anonymous submissions are disabled" do
    ContextDrop.configure do |config|
      config.enabled = true
      config.allow_anonymous = false
      config.current_submitter = ->(_c) { nil }
    end

    session.get "/context_drop/config",
                headers: {
                  "HTTP_HOST" => "localhost",
                  "HTTP_ACCEPT" => "application/json"
                }

    expect(session.response.status).to eq(401)
  end

  it "verifies that csrf_token from GET /config satisfies Rails protect_from_forgery on POST /feedback" do
    # First: request without CSRF token fails with 422
    session.post "/context_drop/feedback",
                 params: { feedback: { message: "Unauthenticated request" } }.to_json,
                 headers: {
                   "HTTP_HOST" => "localhost",
                   "CONTENT_TYPE" => "application/json",
                   "HTTP_ACCEPT" => "application/json"
                 }

    expect(session.response.status).to eq(422)
    err_body = JSON.parse(session.response.body)
    expect(err_body["error"]).to eq("Invalid or missing CSRF authenticity token")

    # Second: fetch config to acquire session csrf_token
    session.get "/context_drop/config",
                headers: {
                  "HTTP_HOST" => "localhost",
                  "HTTP_ACCEPT" => "application/json"
                }
    expect(session.response.status).to eq(200)
    csrf_token = JSON.parse(session.response.body)["csrf_token"]

    # Third: submit feedback with acquired csrf_token succeeds
    session.post "/context_drop/feedback",
                 params: {
                   feedback: {
                     message: "Authenticated feedback from SPA",
                     page_url: "http://localhost/spa",
                     user_agent: "test-runner"
                   }
                 }.to_json,
                 headers: {
                   "HTTP_HOST" => "localhost",
                   "CONTENT_TYPE" => "application/json",
                   "HTTP_ACCEPT" => "application/json",
                   "HTTP_X_CSRF_TOKEN" => csrf_token
                 }

    expect(session.response.status).to eq(201)
    res = JSON.parse(session.response.body)
    expect(res["status"]).to eq("new")
  end

  it "supports cross-origin Next.js widget submissions when Origin matches config.allowed_origins" do
    ContextDrop.configure do |config|
      config.enabled = true
      config.allowed_origins = ["http://localhost:3000", /\Ahttps:\/\/[a-z0-9-]+\.vercel\.app\z/]
    end

    # 1. Allowed preflight OPTIONS
    session.process :options,
                    "/context_drop/feedback",
                    headers: {
                      "HTTP_HOST" => "localhost",
                      "HTTP_ORIGIN" => "http://localhost:3000"
                    }
    expect(session.response.status).to eq(204)
    expect(session.response.headers["Access-Control-Allow-Origin"]).to eq("http://localhost:3000")

    # 2. Disallowed preflight OPTIONS
    session.process :options,
                    "/context_drop/feedback",
                    headers: {
                      "HTTP_HOST" => "localhost",
                      "HTTP_ORIGIN" => "https://evil.example.org"
                    }
    expect(session.response.status).to eq(403)

    # 3. Allowed cross-origin JSON submission without session cookie
    session.post "/context_drop/feedback",
                 params: {
                   feedback: {
                     message: "Cross-origin feedback from Next.js preview",
                     page_url: "https://my-preview.vercel.app/checkout"
                   }
                 }.to_json,
                 headers: {
                   "HTTP_HOST" => "localhost",
                   "HTTP_ORIGIN" => "https://my-preview.vercel.app",
                   "HTTP_X_CONTEXT_DROP_CLIENT" => "1",
                   "CONTENT_TYPE" => "application/json",
                   "HTTP_ACCEPT" => "application/json"
                 }
    expect(session.response.status).to eq(201)
    expect(session.response.headers["Access-Control-Allow-Origin"]).to eq("https://my-preview.vercel.app")
  end
end
