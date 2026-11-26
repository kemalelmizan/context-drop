import crypto from "node:crypto";
import type {
  CreateFeedbackRecordInput,
  FeedbackQueryFilter,
  FeedbackSummaryItem,
  FeedbackStatus,
  OwnFeedbackLookupQuery,
  StorageAdapter,
  StoredAttachment,
  StoredElementReference,
  StoredFeedbackRecord,
  SubmitterIdentity,
  UpdateFeedbackRecordInput,
  ValidatedUpload
} from "../types.ts";

export function formatSubmitterLabel(submitter: StoredFeedbackRecord["submitter"]): string {
  if (!submitter) return "Anonymous";
  if (submitter.label && String(submitter.label).trim().length > 0) {
    return String(submitter.label).trim();
  }
  if (submitter.type && submitter.id !== undefined && submitter.id !== null) {
    return `${submitter.type}#${submitter.id}`;
  }
  if (submitter.id !== undefined && submitter.id !== null) {
    return `User#${submitter.id}`;
  }
  return "Anonymous";
}

export function hasAuthenticatedSubmitter(submitter?: SubmitterIdentity | null): boolean {
  if (!submitter) return false;
  return submitter.id !== undefined && submitter.id !== null && String(submitter.id).trim() !== "";
}

export function submitterMatches(
  recordSubmitter?: SubmitterIdentity | null,
  callerSubmitter?: SubmitterIdentity | null
): boolean {
  if (!hasAuthenticatedSubmitter(recordSubmitter) || !hasAuthenticatedSubmitter(callerSubmitter)) {
    return false;
  }
  const recType = String(recordSubmitter?.type || "User").trim();
  const callerType = String(callerSubmitter?.type || "User").trim();
  return (
    recType === callerType &&
    String(recordSubmitter?.id).trim() === String(callerSubmitter?.id).trim()
  );
}

export function matchesOwnFeedback(
  record: StoredFeedbackRecord,
  query: OwnFeedbackLookupQuery
): boolean {
  if (record.deleted_at) return false;

  if (hasAuthenticatedSubmitter(record.submitter)) {
    return submitterMatches(record.submitter, query.submitter);
  }

  if (query.token_ids && query.token_ids.some((tid) => String(tid) === String(record.id))) {
    return true;
  }

  if (
    query.session_id &&
    query.session_id.trim().length > 0 &&
    record.session_id &&
    record.session_id.trim().length > 0 &&
    query.session_id === record.session_id
  ) {
    return true;
  }

  return false;
}

export function toFeedbackSummary(record: StoredFeedbackRecord): FeedbackSummaryItem {
  const summary: FeedbackSummaryItem = {
    id: record.id,
    qualified_id: `${record.environment}:${record.id}`,
    environment: record.environment,
    status: record.status,
    message: record.message,
    page_url: record.page_url,
    submitter: formatSubmitterLabel(record.submitter),
    attachments_count: record.attachments.length,
    element_references_count: record.element_references.length,
    comments_count: record.comments?.length ?? 0,
    element_selectors: record.element_references.map((el) => el.selector),
    created_at: record.created_at
  };
  if (record.deleted_at) {
    summary.deleted = true;
    summary.deleted_at = record.deleted_at;
  }
  return summary;
}

export function matchesFeedbackFilter(
  record: StoredFeedbackRecord,
  filter: FeedbackQueryFilter
): boolean {
  if (!filter.include_deleted && record.deleted_at) {
    return false;
  }

  if (filter.environment && filter.environment.trim().length > 0) {
    if (record.environment.toLowerCase() !== filter.environment.trim().toLowerCase()) {
      return false;
    }
  }

  if (filter.status && record.status !== filter.status) {
    return false;
  }

  if (filter.page_url && filter.page_url.trim().length > 0) {
    const needle = filter.page_url.trim().toLowerCase();
    if (!record.page_url.toLowerCase().includes(needle)) {
      return false;
    }
  }

  if (filter.query && filter.query.trim().length > 0) {
    const q = filter.query.trim().toLowerCase();
    const inMessage = (record.message ?? "").toLowerCase().includes(q);
    const inElements = record.element_references.some(
      (el) =>
        el.selector.toLowerCase().includes(q) ||
        (el.dom_path ?? "").toLowerCase().includes(q) ||
        (el.text_content ?? "").toLowerCase().includes(q)
    );
    if (!inMessage && !inElements) {
      return false;
    }
  }

  return true;
}

export function createMemoryStorageAdapter(): StorageAdapter {
  let nextFeedbackId = 1;
  let nextElementId = 1;
  let nextAttachmentId = 1;
  let nextCommentId = 1;

  const PENDING_BLOB_TTL_MS = 30 * 60 * 1000;
  const MAX_PENDING_BLOBS = 200;

  const secret = crypto.randomBytes(32);
  const pendingBlobs = new Map<string, { upload: ValidatedUpload; createdAtMs: number }>();
  const attachmentBlobs = new Map<string, Uint8Array>();
  const feedbacks = new Map<number, StoredFeedbackRecord>();

  function prunePendingBlobs(nowMs: number): void {
    for (const [k, v] of pendingBlobs.entries()) {
      if (nowMs - v.createdAtMs > PENDING_BLOB_TTL_MS) {
        pendingBlobs.delete(k);
      }
    }
    while (pendingBlobs.size >= MAX_PENDING_BLOBS) {
      const oldestKey = pendingBlobs.keys().next().value;
      if (oldestKey === undefined) break;
      pendingBlobs.delete(oldestKey);
    }
  }

  function signId(rawId: string): string {
    const sig = crypto.createHmac("sha256", secret).update(rawId).digest("hex");
    return `${rawId}.${sig}`;
  }

  function verifySignedId(token: string): string | null {
    const dotIdx = token.lastIndexOf(".");
    if (dotIdx <= 0) return null;
    const rawId = token.slice(0, dotIdx);
    const provided = token.slice(dotIdx + 1);
    const expected = crypto.createHmac("sha256", secret).update(rawId).digest("hex");
    if (provided.length !== expected.length) return null;
    if (!crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(expected))) {
      return null;
    }
    return rawId;
  }

  return {
    getOwnershipSecret(): Buffer {
      return secret;
    },

    async savePendingBlob(blob: ValidatedUpload): Promise<{ signed_blob_id: string }> {
      const nowMs = Date.now();
      prunePendingBlobs(nowMs);
      const rawId = crypto.randomUUID();
      pendingBlobs.set(rawId, {
        upload: {
          ...blob,
          data: new Uint8Array(blob.data)
        },
        createdAtMs: nowMs
      });
      return { signed_blob_id: signId(rawId) };
    },

    async consumePendingBlob(signedBlobId: string): Promise<ValidatedUpload | null> {
      const rawId = verifySignedId(signedBlobId);
      if (!rawId) return null;
      const entry = pendingBlobs.get(rawId) ?? null;
      if (!entry) return null;
      pendingBlobs.delete(rawId);
      if (Date.now() - entry.createdAtMs > PENDING_BLOB_TTL_MS) {
        return null;
      }
      return entry.upload;
    },

    async createFeedback(input: CreateFeedbackRecordInput): Promise<StoredFeedbackRecord> {
      const id = nextFeedbackId++;
      const now = new Date().toISOString();

      const elementsByClientRef = new Map<string, StoredElementReference>();
      const storedElements: StoredElementReference[] = input.element_references.map((el, idx) => {
        const elRecord: StoredElementReference = {
          id: nextElementId++,
          feedback_id: id,
          client_ref: el.client_ref,
          tag_name: el.tag_name,
          selector: el.selector,
          dom_path: el.dom_path,
          text_content: el.text_content,
          attributes_snapshot: { ...el.attributes_snapshot },
          bounding_rect: { ...el.bounding_rect },
          viewport: { ...el.viewport },
          metadata: { ...el.metadata },
          captured_at: el.captured_at
        };
        const refKey = el.client_ref || String(idx);
        elementsByClientRef.set(refKey, elRecord);
        return elRecord;
      });

      const storedAttachments: StoredAttachment[] = input.attachments.map((att) => {
        const attId = nextAttachmentId++;
        const linkedEl = att.element_client_ref
          ? elementsByClientRef.get(att.element_client_ref) ?? null
          : null;
        const blobKey = att.data ? `att_${attId}` : null;
        if (blobKey && att.data) {
          attachmentBlobs.set(blobKey, new Uint8Array(att.data));
        }
        return {
          id: attId,
          feedback_id: id,
          element_reference_id: linkedEl ? linkedEl.id : null,
          attachment_type: att.attachment_type,
          filename: att.filename,
          content_type: att.content_type,
          byte_size: att.byte_size,
          blob_key: blobKey,
          metadata: { ...att.metadata },
          created_at: now
        };
      });

      const record: StoredFeedbackRecord = {
        id,
        environment: input.environment,
        status: "new",
        message: input.message,
        page_url: input.page_url,
        user_agent: input.user_agent,
        session_id: input.session_id,
        submitter: { ...input.submitter },
        metadata: { ...input.metadata },
        element_references: storedElements,
        attachments: storedAttachments,
        comments: [],
        created_at: now,
        updated_at: now,
        deleted_at: null
      };

      feedbacks.set(id, record);
      return structuredClone(record);
    },

    async listFeedbacks(filter: FeedbackQueryFilter) {
      const limit = Math.max(1, Math.min(100, filter.limit ?? 20));
      const offset = Math.max(0, filter.offset ?? 0);

      const matching = Array.from(feedbacks.values())
        .filter((fb) => matchesFeedbackFilter(fb, filter))
        .sort((a, b) => {
          const dt = Date.parse(b.created_at) - Date.parse(a.created_at);
          return dt !== 0 ? dt : Number(b.id) - Number(a.id);
        });

      return {
        total: matching.length,
        records: matching.slice(offset, offset + limit).map(toFeedbackSummary)
      };
    },

    async listOwnFeedbacks(query: OwnFeedbackLookupQuery) {
      const limit = Math.max(1, Math.min(50, query.limit ?? 20));
      const matching = Array.from(feedbacks.values())
        .filter((fb) => matchesOwnFeedback(fb, query))
        .sort((a, b) => {
          const dt = Date.parse(b.created_at) - Date.parse(a.created_at);
          return dt !== 0 ? dt : Number(b.id) - Number(a.id);
        });

      return {
        total: matching.length,
        records: matching.slice(0, limit).map((fb) => structuredClone(fb))
      };
    },

    async getFeedback(id: string | number): Promise<StoredFeedbackRecord | null> {
      const numId = Number(id);
      const found = feedbacks.get(numId);
      return found ? structuredClone(found) : null;
    },

    async updateFeedback(
      id: string | number,
      input: UpdateFeedbackRecordInput
    ): Promise<StoredFeedbackRecord | null> {
      const numId = Number(id);
      const existing = feedbacks.get(numId);
      if (!existing || existing.deleted_at) return null;

      const now = new Date().toISOString();
      const contentEdited =
        input.message !== undefined ||
        input.metadata !== undefined ||
        input.element_references !== undefined ||
        input.attachments !== undefined;
      if (input.message !== undefined) {
        existing.message = input.message;
      }
      if (input.metadata !== undefined) {
        existing.metadata = { ...input.metadata };
      }
      if (input.status !== undefined) {
        existing.status = input.status;
      } else if (contentEdited) {
        existing.status = "updated";
      }

      const elementsByRef = new Map<string, StoredElementReference>();
      if (input.element_references !== undefined) {
        existing.element_references = input.element_references.map((el, idx) => {
          const elRec: StoredElementReference = {
            id: nextElementId++,
            feedback_id: existing.id,
            client_ref: el.client_ref,
            tag_name: el.tag_name,
            selector: el.selector,
            dom_path: el.dom_path,
            text_content: el.text_content,
            attributes_snapshot: { ...el.attributes_snapshot },
            bounding_rect: { ...el.bounding_rect },
            viewport: { ...el.viewport },
            metadata: { ...el.metadata },
            captured_at: el.captured_at
          };
          elementsByRef.set(el.client_ref || String(idx), elRec);
          return elRec;
        });
      } else {
        existing.element_references.forEach((el, idx) => {
          elementsByRef.set(el.client_ref || String(idx), el);
        });
      }

      if (input.attachments !== undefined) {
        const prevById = new Map<string, StoredAttachment>();
        for (const a of existing.attachments) {
          prevById.set(String(a.id), a);
        }

        const nextAttachments: StoredAttachment[] = [];
        const retainedBlobKeys = new Set<string>();

        for (const spec of input.attachments) {
          if (spec.kind === "retain") {
            const prev = prevById.get(String(spec.existing_id));
            if (!prev) continue;
            if (prev.blob_key) retainedBlobKeys.add(prev.blob_key);
            const linkedEl =
              spec.element_client_ref !== undefined
                ? spec.element_client_ref
                  ? elementsByRef.get(spec.element_client_ref) ?? null
                  : null
                : input.element_references === undefined
                  ? existing.element_references.find((e) => e.id === prev.element_reference_id) ?? null
                  : null;
            nextAttachments.push({
              ...prev,
              element_reference_id: linkedEl ? linkedEl.id : null,
              metadata: spec.update_metadata && spec.metadata ? { ...spec.metadata } : { ...prev.metadata }
            });
          } else {
            const attId = nextAttachmentId++;
            const linkedEl = spec.element_client_ref
              ? elementsByRef.get(spec.element_client_ref) ?? null
              : null;
            const blobKey = spec.data ? `att_${attId}` : null;
            if (blobKey && spec.data) {
              attachmentBlobs.set(blobKey, new Uint8Array(spec.data));
              retainedBlobKeys.add(blobKey);
            }
            nextAttachments.push({
              id: attId,
              feedback_id: existing.id,
              element_reference_id: linkedEl ? linkedEl.id : null,
              attachment_type: spec.attachment_type,
              filename: spec.filename,
              content_type: spec.content_type,
              byte_size: spec.byte_size,
              blob_key: blobKey,
              metadata: { ...spec.metadata },
              created_at: now
            });
          }
        }

        for (const prev of existing.attachments) {
          if (prev.blob_key && !retainedBlobKeys.has(prev.blob_key)) {
            attachmentBlobs.delete(prev.blob_key);
          }
        }

        existing.attachments = nextAttachments;
      }

      existing.updated_at = now;
      return structuredClone(existing);
    },

    async softDeleteFeedback(id: string | number): Promise<StoredFeedbackRecord | null> {
      const numId = Number(id);
      const existing = feedbacks.get(numId);
      if (!existing || existing.deleted_at) return null;

      const now = new Date().toISOString();
      existing.deleted_at = now;
      existing.updated_at = now;
      return structuredClone(existing);
    },

    async getAttachment(attachmentId: string | number) {
      const numAttId = Number(attachmentId);
      for (const fb of feedbacks.values()) {
        const att = fb.attachments.find((a) => Number(a.id) === numAttId);
        if (att) {
          const linkedEl =
            att.element_reference_id !== null
              ? fb.element_references.find((e) => e.id === att.element_reference_id)
              : undefined;
          const bytes = att.blob_key ? attachmentBlobs.get(att.blob_key) ?? null : null;
          return {
            attachment: structuredClone(att),
            element_selector: linkedEl?.selector ?? null,
            data: bytes ? new Uint8Array(bytes) : null
          };
        }
        for (const comment of fb.comments ?? []) {
          const commentAtt = comment.attachments.find((a) => Number(a.id) === numAttId);
          if (commentAtt) {
            const bytes = commentAtt.blob_key ? attachmentBlobs.get(commentAtt.blob_key) ?? null : null;
            return {
              attachment: structuredClone(commentAtt),
              element_selector: null,
              data: bytes ? new Uint8Array(bytes) : null
            };
          }
        }
      }
      return null;
    },

    async getAttachmentBytes(attachmentId: string | number): Promise<Uint8Array | null> {
      const res = await this.getAttachment(attachmentId);
      return res?.data ?? null;
    },

    async addComment(feedbackId: string | number, input: import("../types.ts").CreateCommentInput) {
      const numId = Number(feedbackId);
      const existing = feedbacks.get(numId);
      if (!existing || existing.deleted_at) return null;

      const now = new Date().toISOString();
      const commentId = nextCommentId++;
      const commentAttachments: StoredAttachment[] = [];

      for (const att of input.attachments ?? []) {
        const attId = nextAttachmentId++;
        const blobKey = att.data ? `att_${attId}` : null;
        if (blobKey && att.data) {
          attachmentBlobs.set(blobKey, new Uint8Array(att.data));
        }
        commentAttachments.push({
          id: attId,
          feedback_id: existing.id,
          comment_id: commentId,
          element_reference_id: null,
          attachment_type: att.attachment_type,
          filename: att.filename,
          content_type: att.content_type,
          byte_size: att.byte_size,
          blob_key: blobKey,
          metadata: { ...att.metadata },
          created_at: now
        });
      }

      const comment: import("../types.ts").StoredComment = {
        id: commentId,
        feedback_id: existing.id,
        author_type: input.author_type ?? "User",
        author_label: input.author_label || "You",
        body: input.body,
        attachments: commentAttachments,
        created_at: now,
        updated_at: now
      };

      if (!existing.comments) existing.comments = [];
      existing.comments.push(comment);
      existing.status = input.status ?? "updated";
      existing.updated_at = now;

      return {
        comment: structuredClone(comment),
        feedback: structuredClone(existing)
      };
    },

    async updateFeedbackStatus(id: string | number, status: FeedbackStatus) {
      const numId = Number(id);
      const existing = feedbacks.get(numId);
      if (!existing || existing.deleted_at) return null;

      const previous_status = existing.status;
      existing.status = status;
      existing.updated_at = new Date().toISOString();
      return {
        previous_status,
        feedback: structuredClone(existing)
      };
    }
  };
}
