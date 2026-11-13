# frozen_string_literal: true

require_relative "../spec_helper"
require_relative "../dummy/config/environment"

RSpec.describe "ContextDrop::FeedbacksController (Own Feedback Sync, Update & Soft Delete)" do
  let(:app) { Rails.application }

  let(:valid_png_data_url) do
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
  end

  build_session = lambda do |rack_app|
    ActionDispatch::Integration::Session.new(rack_app).tap do |s|
      s.default_url_options[:host] = "localhost"
    end
  end

  fetch_csrf_token = lambda do |sess, extra_headers = {}|
    sess.get "/context_drop/config",
             headers: {
               "HTTP_HOST" => "localhost",
               "HTTP_ACCEPT" => "application/json"
             }.merge(extra_headers)
    JSON.parse(sess.response.body)["csrf_token"]
  end

  before do
    ContextDrop.reset_configuration!
    Rails.cache.clear if Rails.respond_to?(:cache) && Rails.cache
    ContextDrop.configure do |config|
      config.enabled = true
      config.allow_anonymous = true
      config.rate_limit = 100
      config.ownership_secret = "test-ownership-hmac-secret-key-0123456789"
    end

    ContextDrop::Attachment.delete_all
    ContextDrop::ElementReference.delete_all
    ContextDrop::Feedback.delete_all
  end

  it "lists, updates (message + elements + retained/new attachments), previews attachments, and soft-deletes own feedback via session and signed ownership token" do
    updated_ids = []
    deleted_ids = []
    ContextDrop.configure do |config|
      config.on_feedback_updated = ->(fb) { updated_ids << fb.id }
      config.on_feedback_deleted = ->(fb) { deleted_ids << fb.id }
    end

    owner_session = build_session.call(app)
    csrf = fetch_csrf_token.call(owner_session)

    # 1. Create feedback with 1 element reference and 1 PNG attachment
    owner_session.post "/context_drop/feedback",
                       params: {
                         feedback: {
                           message: "Original button overlap",
                           page_url: "http://localhost/checkout",
                           user_agent: "rspec-agent",
                           element_references: [
                             {
                               client_ref: "el_1",
                               tag_name: "button",
                               selector: "#pay-now",
                               dom_path: "html > body > button#pay-now",
                               text_content: "Pay Now",
                               bounding_rect: { x: 10, y: 20, width: 140, height: 40 }
                             }
                           ],
                           attachments: [
                             {
                               attachment_type: "screenshot",
                               filename: "shot-1.png",
                               data_url: valid_png_data_url,
                               element_reference_ref: "el_1",
                               metadata: { capture_type: "element" }
                             }
                           ]
                         }
                       }.to_json,
                       headers: {
                         "HTTP_HOST" => "localhost",
                         "CONTENT_TYPE" => "application/json",
                         "HTTP_ACCEPT" => "application/json",
                         "HTTP_X_CSRF_TOKEN" => csrf
                       }

    expect(owner_session.response.status).to eq(201)
    created = JSON.parse(owner_session.response.body)
    fb_id = created["id"]
    ownership_token = created["ownership_token"]
    expect(ownership_token).to be_a(String)
    expect(created["feedback"]["attachments"].size).to eq(1)
    first_att_id = created["feedback"]["attachments"].first["id"]

    # 2. Unassociated anonymous session sees empty GET /feedback and gets 403 on PATCH/DELETE/attachment
    stranger_session = build_session.call(app)
    stranger_csrf = fetch_csrf_token.call(stranger_session)

    stranger_session.get "/context_drop/feedback",
                         headers: { "HTTP_HOST" => "localhost", "HTTP_ACCEPT" => "application/json" }
    expect(stranger_session.response.status).to eq(200)
    expect(JSON.parse(stranger_session.response.body)["feedbacks"]).to eq([])

    stranger_session.patch "/context_drop/feedback/#{fb_id}",
                           params: { feedback: { message: "Tampered" } }.to_json,
                           headers: {
                             "HTTP_HOST" => "localhost",
                             "CONTENT_TYPE" => "application/json",
                             "HTTP_ACCEPT" => "application/json",
                             "HTTP_X_CSRF_TOKEN" => stranger_csrf
                           }
    expect(stranger_session.response.status).to eq(403)

    stranger_session.delete "/context_drop/feedback/#{fb_id}",
                            headers: {
                              "HTTP_HOST" => "localhost",
                              "HTTP_ACCEPT" => "application/json",
                              "HTTP_X_CSRF_TOKEN" => stranger_csrf
                            }
    expect(stranger_session.response.status).to eq(403)

    stranger_session.get "/context_drop/feedback/#{fb_id}/attachments/#{first_att_id}",
                         headers: { "HTTP_HOST" => "localhost" }
    expect(stranger_session.response.status).to eq(403)

    # 3. Fresh browser session WITH signed ownership_token can list, preview attachment, update, and soft-delete
    token_session = build_session.call(app)
    token_csrf = fetch_csrf_token.call(token_session)

    token_session.get "/context_drop/feedback",
                      headers: {
                        "HTTP_HOST" => "localhost",
                        "HTTP_ACCEPT" => "application/json",
                        "HTTP_X_CONTEXT_DROP_OWNERSHIP_TOKENS" => ownership_token
                      }
    expect(token_session.response.status).to eq(200)
    own_list = JSON.parse(token_session.response.body)
    expect(own_list["total_count"]).to eq(1)
    expect(own_list["feedbacks"].first["id"]).to eq(fb_id)

    token_session.get "/context_drop/feedback/#{fb_id}/attachments/#{first_att_id}?ownership_token=#{CGI.escape(ownership_token)}",
                      headers: { "HTTP_HOST" => "localhost" }
    expect(token_session.response.status).to eq(200)
    expect(token_session.response.media_type).to eq("image/png")
    expect(token_session.response.headers["Content-Security-Policy"]).to include("sandbox")

    # 4. Update message + replace element_references + retain existing attachment + add a 2nd attachment
    token_session.patch "/context_drop/feedback/#{fb_id}",
                        params: {
                          ownership_token: ownership_token,
                          feedback: {
                            message: "Updated: overlap happens on mobile checkout too",
                            element_references: [
                              {
                                client_ref: "el_1",
                                tag_name: "button",
                                selector: "#pay-now",
                                dom_path: "html > body > button#pay-now",
                                bounding_rect: { x: 10, y: 20, width: 140, height: 40 }
                              },
                              {
                                client_ref: "el_2",
                                tag_name: "footer",
                                selector: "footer.sticky-bar",
                                dom_path: "html > body > footer.sticky-bar",
                                bounding_rect: { x: 0, y: 600, width: 390, height: 56 }
                              }
                            ],
                            attachments: [
                              {
                                existing_id: first_att_id,
                                attachment_type: "screenshot",
                                element_reference_ref: "el_1",
                                metadata: { capture_type: "element" }
                              },
                              {
                                attachment_type: "image",
                                filename: "mobile-repro.png",
                                data_url: valid_png_data_url,
                                element_reference_ref: "el_2",
                                metadata: { source: "upload" }
                              }
                            ]
                          }
                        }.to_json,
                        headers: {
                          "HTTP_HOST" => "localhost",
                          "CONTENT_TYPE" => "application/json",
                          "HTTP_ACCEPT" => "application/json",
                          "HTTP_X_CSRF_TOKEN" => token_csrf,
                          "HTTP_X_CONTEXT_DROP_OWNERSHIP_TOKEN" => ownership_token
                        }

    expect(token_session.response.status).to eq(200)
    upd_body = JSON.parse(token_session.response.body)
    expect(upd_body["element_references_count"]).to eq(2)
    expect(upd_body["attachments_count"]).to eq(2)
    expect(upd_body["feedback"]["message"]).to eq("Updated: overlap happens on mobile checkout too")
    expect(updated_ids).to eq([fb_id])

    # 5. Reject emptying both message and all context on update with 422
    token_session.patch "/context_drop/feedback/#{fb_id}",
                        params: {
                          feedback: {
                            message: "   ",
                            element_references: [],
                            attachments: []
                          }
                        }.to_json,
                        headers: {
                          "HTTP_HOST" => "localhost",
                          "CONTENT_TYPE" => "application/json",
                          "HTTP_ACCEPT" => "application/json",
                          "HTTP_X_CSRF_TOKEN" => token_csrf,
                          "HTTP_X_CONTEXT_DROP_OWNERSHIP_TOKEN" => ownership_token
                        }
    expect(token_session.response.status).to eq(422)

    # 6. Soft-delete feedback via DELETE /feedback/:id
    token_session.delete "/context_drop/feedback/#{fb_id}",
                         headers: {
                           "HTTP_HOST" => "localhost",
                           "HTTP_ACCEPT" => "application/json",
                           "HTTP_X_CSRF_TOKEN" => token_csrf,
                           "HTTP_X_CONTEXT_DROP_OWNERSHIP_TOKEN" => ownership_token
                         }
    expect(token_session.response.status).to eq(200)
    del_body = JSON.parse(token_session.response.body)
    expect(del_body["deleted"]).to eq(true)
    expect(deleted_ids).to eq([fb_id])

    record = ContextDrop::Feedback.find(fb_id)
    expect(record.deleted?).to eq(true)
    expect(ContextDrop::Feedback.active.where(id: fb_id).count).to eq(0)
    expect(ContextDrop::Feedback.deleted.where(id: fb_id).count).to eq(1)

    # Subsequent GET /feedback excludes soft-deleted feedback; repeat DELETE returns 404
    token_session.get "/context_drop/feedback",
                      headers: {
                        "HTTP_HOST" => "localhost",
                        "HTTP_ACCEPT" => "application/json",
                        "HTTP_X_CONTEXT_DROP_OWNERSHIP_TOKENS" => ownership_token
                      }
    expect(JSON.parse(token_session.response.body)["feedbacks"]).to eq([])

    token_session.delete "/context_drop/feedback/#{fb_id}",
                         headers: {
                           "HTTP_HOST" => "localhost",
                           "HTTP_ACCEPT" => "application/json",
                           "HTTP_X_CSRF_TOKEN" => token_csrf,
                           "HTTP_X_CONTEXT_DROP_OWNERSHIP_TOKEN" => ownership_token
                         }
    expect(token_session.response.status).to eq(404)
  end

  it "strictly enforces authenticated submitter ownership and prevents cross-feedback attachment stealing" do
    FakeAuthUser = Struct.new(:id) unless defined?(FakeAuthUser)
    current_actor = FakeAuthUser.new(101)
    ContextDrop.configure do |config|
      config.current_submitter = ->(_c) { current_actor }
    end

    # Ensure polymorphic submitter works without requiring an ActiveRecord User table by creating records or testing via Polymorphic struct
    fb_user_101 = ContextDrop::Feedback.create!(
      status: "new",
      message: "User 101 feedback",
      page_url: "http://localhost/account",
      submitter_type: "FakeAuthUser",
      submitter_id: 101
    )
    fb_user_202 = ContextDrop::Feedback.create!(
      status: "new",
      message: "User 202 feedback",
      page_url: "http://localhost/billing",
      submitter_type: "FakeAuthUser",
      submitter_id: 202
    )
    other_att = fb_user_202.attachments.create!(
      attachment_type: "image",
      metadata: {}
    )

    # Stub resolve_submitter to return polymorphic attributes safely via current_submitter
    sess = build_session.call(app)
    csrf = fetch_csrf_token.call(sess)

    # Even if User 101 somehow forged/obtained an ownership token for fb_user_202, authenticated submitter mismatch MUST deny access (403)
    token_202 = ContextDrop::OwnershipToken.generate(fb_user_202.id)
    sess.patch "/context_drop/feedback/#{fb_user_202.id}",
               params: { feedback: { message: "Cross-user hijack attempt" } }.to_json,
               headers: {
                 "HTTP_HOST" => "localhost",
                 "CONTENT_TYPE" => "application/json",
                 "HTTP_ACCEPT" => "application/json",
                 "HTTP_X_CSRF_TOKEN" => csrf,
                 "HTTP_X_CONTEXT_DROP_OWNERSHIP_TOKEN" => token_202
               }
    expect(sess.response.status).to eq(403)

    # Attempting to reference another feedback's attachment ID in existing_id returns 422
    sess.patch "/context_drop/feedback/#{fb_user_101.id}",
               params: {
                 feedback: {
                   message: "Trying to attach someone else's attachment",
                   attachments: [{ existing_id: other_att.id }]
                 }
               }.to_json,
               headers: {
                 "HTTP_HOST" => "localhost",
                 "CONTENT_TYPE" => "application/json",
                 "HTTP_ACCEPT" => "application/json",
                 "HTTP_X_CSRF_TOKEN" => csrf
               }
    expect(sess.response.status).to eq(422)
  end

  it "generates and verifies HMAC-SHA256 ownership tokens in constant time and rejects tampered tokens" do
    tok_10 = ContextDrop::OwnershipToken.generate(10)
    tok_25 = ContextDrop::OwnershipToken.generate(25)

    expect(ContextDrop::OwnershipToken.valid?(tok_10, 10)).to eq(true)
    expect(ContextDrop::OwnershipToken.valid?(tok_10, 25)).to eq(false)
    expect(ContextDrop::OwnershipToken.valid?("#{tok_10}tampered", 10)).to eq(false)
    expect(ContextDrop::OwnershipToken.valid?("10.deadbeef.forgedsig", 10)).to eq(false)

    raw_header = "#{tok_10}, 99.bad.sig, #{tok_25}"
    expect(ContextDrop::OwnershipToken.extract_verified_ids(raw_header)).to eq(["10", "25"])
    expect(ContextDrop::OwnershipToken.find_token_for(raw_header, 25)).to eq(tok_25)
    expect(ContextDrop::OwnershipToken.find_token_for(raw_header, 99)).to be_nil
  end
end
