import crypto from "node:crypto";
import type {
  BlobStorageAdapter,
  CreateFeedbackRecordInput,
  FeedbackQueryFilter,
  FeedbackStatus,
  OwnFeedbackLookupQuery,
  StorageAdapter,
  StoredAttachment,
  StoredElementReference,
  StoredFeedbackRecord,
  UpdateFeedbackRecordInput,
  ValidatedUpload
} from "../types.ts";
import { hasAuthenticatedSubmitter, toFeedbackSummary } from "./memory.ts";

export interface PostgresQueryResult<Row = Record<string, unknown>> {
  rows: Row[];
}

export interface PostgresQueryable {
  query(text: string, values?: unknown[]): Promise<PostgresQueryResult>;
}

export interface PostgresStorageAdapterOptions {
  /**
   * Any PostgreSQL client or pool exposing `query(sql, values)` (`pg.Pool`, `@vercel/postgres`, `@neondatabase/serverless`, etc.).
   */
  pool: PostgresQueryable;
  /**
   * Automatically create `context_drop_*` tables on first query if they don't exist (default `true`).
   */
  autoMigrate?: boolean;
  /**
   * Optional HMAC secret for signing pending upload blob IDs and ownership tokens (`process.env.CONTEXT_DROP_SECRET` used if omitted).
   */
  secret?: string;
  /**
   * Optional external blob store (e.g. S3, R2, Vercel Blob, Supabase Storage).
   * When omitted, binary attachments are stored directly in PostgreSQL `BYTEA`.
   */
  blobStore?: BlobStorageAdapter;
}

function resolvePgSecret(explicit?: string): Buffer {
  const raw =
    explicit ||
    process.env.CONTEXT_DROP_SECRET ||
    process.env.NEXTAUTH_SECRET ||
    process.env.AUTH_SECRET ||
    "context-drop-default-pg-blob-secret";
  return crypto.createHash("sha256").update(raw).digest();
}

function toIsoString(val: unknown): string {
  if (val instanceof Date) return val.toISOString();
  if (typeof val === "string") {
    const parsed = Date.parse(val);
    return Number.isNaN(parsed) ? val : new Date(parsed).toISOString();
  }
  return new Date().toISOString();
}

function parseJsonColumn<T>(val: unknown, fallback: T): T {
  if (val === null || val === undefined) return fallback;
  if (typeof val === "object") return val as T;
  if (typeof val === "string") {
    try {
      return JSON.parse(val) as T;
    } catch {
      return fallback;
    }
  }
  return fallback;
}

function toUint8Array(val: unknown): Uint8Array | null {
  if (!val) return null;
  if (val instanceof Uint8Array) return new Uint8Array(val);
  if (Buffer.isBuffer(val)) return new Uint8Array(val.buffer, val.byteOffset, val.byteLength);
  return null;
}

export function createPostgresStorageAdapter(
  options: PostgresStorageAdapterOptions
): StorageAdapter {
  const { pool, autoMigrate = true, blobStore } = options;
  const secretKey = resolvePgSecret(options.secret);
  let migratedPromise: Promise<void> | null = null;

  function signId(rawId: string): string {
    const sig = crypto.createHmac("sha256", secretKey).update(rawId).digest("hex");
    return `${rawId}.${sig}`;
  }

  function verifySignedId(token: string): string | null {
    const dotIdx = token.lastIndexOf(".");
    if (dotIdx <= 0) return null;
    const rawId = token.slice(0, dotIdx);
    const provided = token.slice(dotIdx + 1);
    const expected = crypto.createHmac("sha256", secretKey).update(rawId).digest("hex");
    if (provided.length !== expected.length) return null;
    if (!crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(expected))) {
      return null;
    }
    return rawId;
  }

  async function ensureMigrated(): Promise<void> {
    if (!autoMigrate) return;
    if (!migratedPromise) {
      migratedPromise = (async () => {
        await pool.query(`
          CREATE TABLE IF NOT EXISTS context_drop_pending_blobs (
            id TEXT PRIMARY KEY,
            filename TEXT NOT NULL,
            content_type TEXT NOT NULL,
            byte_size INTEGER NOT NULL,
            dimensions_json JSONB,
            blob_key TEXT,
            data BYTEA,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          );
        `);

        await pool.query(`
          CREATE TABLE IF NOT EXISTS context_drop_feedbacks (
            id BIGSERIAL PRIMARY KEY,
            environment TEXT NOT NULL DEFAULT 'production',
            status TEXT NOT NULL DEFAULT 'new',
            message TEXT,
            page_url TEXT NOT NULL,
            user_agent TEXT,
            session_id TEXT,
            submitter JSONB NOT NULL DEFAULT '{}'::jsonb,
            metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            deleted_at TIMESTAMPTZ
          );
        `);

        await pool.query(`
          ALTER TABLE context_drop_feedbacks
            ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
        `);

        await pool.query(`
          CREATE INDEX IF NOT EXISTS idx_context_drop_feedbacks_env_status
            ON context_drop_feedbacks (environment, status, created_at DESC);
        `);

        await pool.query(`
          CREATE TABLE IF NOT EXISTS context_drop_element_references (
            id BIGSERIAL PRIMARY KEY,
            feedback_id BIGINT NOT NULL REFERENCES context_drop_feedbacks(id) ON DELETE CASCADE,
            client_ref TEXT,
            tag_name TEXT NOT NULL,
            selector TEXT NOT NULL,
            dom_path TEXT,
            text_content TEXT,
            attributes_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
            bounding_rect JSONB NOT NULL DEFAULT '{}'::jsonb,
            viewport JSONB NOT NULL DEFAULT '{}'::jsonb,
            metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
            captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          );
        `);

        await pool.query(`
          CREATE TABLE IF NOT EXISTS context_drop_attachments (
            id BIGSERIAL PRIMARY KEY,
            feedback_id BIGINT NOT NULL REFERENCES context_drop_feedbacks(id) ON DELETE CASCADE,
            element_reference_id BIGINT REFERENCES context_drop_element_references(id) ON DELETE SET NULL,
            attachment_type TEXT NOT NULL,
            filename TEXT,
            content_type TEXT,
            byte_size INTEGER,
            blob_key TEXT,
            data BYTEA,
            metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          );
        `);
      })();
    }
    await migratedPromise;
  }

  async function hydrateFeedbackRow(row: Record<string, unknown>): Promise<StoredFeedbackRecord> {
    const fbId = Number(row["id"]);
    const [elRes, attRes] = await Promise.all([
      pool.query(
        `SELECT id, feedback_id, client_ref, tag_name, selector, dom_path, text_content,
                attributes_snapshot, bounding_rect, viewport, metadata, captured_at
         FROM context_drop_element_references
         WHERE feedback_id = $1
         ORDER BY id ASC`,
        [fbId]
      ),
      pool.query(
        `SELECT id, feedback_id, element_reference_id, attachment_type, filename,
                content_type, byte_size, blob_key, metadata, created_at
         FROM context_drop_attachments
         WHERE feedback_id = $1
         ORDER BY id ASC`,
        [fbId]
      )
    ]);

    const elements: StoredElementReference[] = elRes.rows.map((el) => ({
      id: Number(el["id"]),
      feedback_id: fbId,
      client_ref: (el["client_ref"] as string | null) ?? null,
      tag_name: String(el["tag_name"]),
      selector: String(el["selector"]),
      dom_path: (el["dom_path"] as string | null) ?? null,
      text_content: (el["text_content"] as string | null) ?? null,
      attributes_snapshot: parseJsonColumn(el["attributes_snapshot"], {}),
      bounding_rect: parseJsonColumn(el["bounding_rect"], {}),
      viewport: parseJsonColumn(el["viewport"], {}),
      metadata: parseJsonColumn(el["metadata"], {}),
      captured_at: toIsoString(el["captured_at"])
    }));

    const attachments: StoredAttachment[] = attRes.rows.map((att) => ({
      id: Number(att["id"]),
      feedback_id: fbId,
      element_reference_id:
        att["element_reference_id"] !== null && att["element_reference_id"] !== undefined
          ? Number(att["element_reference_id"])
          : null,
      attachment_type: att["attachment_type"] === "screenshot" ? "screenshot" : "image",
      filename: (att["filename"] as string | null) ?? null,
      content_type: (att["content_type"] as string | null) ?? null,
      byte_size:
        att["byte_size"] !== null && att["byte_size"] !== undefined
          ? Number(att["byte_size"])
          : null,
      blob_key: (att["blob_key"] as string | null) ?? null,
      metadata: parseJsonColumn(att["metadata"], {}),
      created_at: toIsoString(att["created_at"])
    }));

    return {
      id: fbId,
      environment: String(row["environment"] ?? "production"),
      status: String(row["status"] ?? "new") as FeedbackStatus,
      message: (row["message"] as string | null) ?? null,
      page_url: String(row["page_url"] ?? ""),
      user_agent: (row["user_agent"] as string | null) ?? null,
      session_id: (row["session_id"] as string | null) ?? null,
      submitter: parseJsonColumn(row["submitter"], {}),
      metadata: parseJsonColumn(row["metadata"], {}),
      element_references: elements,
      attachments,
      created_at: toIsoString(row["created_at"]),
      updated_at: toIsoString(row["updated_at"]),
      deleted_at: row["deleted_at"] ? toIsoString(row["deleted_at"]) : null
    };
  }

  return {
    getOwnershipSecret(): Buffer {
      return secretKey;
    },

    async savePendingBlob(blob: ValidatedUpload): Promise<{ signed_blob_id: string }> {
      await ensureMigrated();
      const rawId = crypto.randomUUID();
      let blobKey: string | null = null;
      let inlineBytes: Buffer | null = null;

      if (blobStore) {
        const stored = await blobStore.putBlob({
          key: `pending_${rawId}`,
          data: blob.data,
          contentType: blob.content_type,
          filename: blob.filename
        });
        blobKey = stored.key;
      } else {
        inlineBytes = Buffer.from(blob.data);
      }

      await pool.query(
        `INSERT INTO context_drop_pending_blobs
         (id, filename, content_type, byte_size, dimensions_json, blob_key, data)
         VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7)`,
        [
          rawId,
          blob.filename,
          blob.content_type,
          blob.byte_size,
          blob.dimensions ? JSON.stringify(blob.dimensions) : null,
          blobKey,
          inlineBytes
        ]
      );

      return { signed_blob_id: signId(rawId) };
    },

    async consumePendingBlob(signedBlobId: string): Promise<ValidatedUpload | null> {
      await ensureMigrated();
      const rawId = verifySignedId(signedBlobId);
      if (!rawId) return null;

      const res = await pool.query(
        `DELETE FROM context_drop_pending_blobs
         WHERE id = $1
         RETURNING filename, content_type, byte_size, dimensions_json, blob_key, data`,
        [rawId]
      );
      const row = res.rows[0];
      if (!row) return null;

      let bytes: Uint8Array | null = null;
      const blobKey = (row["blob_key"] as string | null) ?? null;
      if (blobKey && blobStore) {
        bytes = await blobStore.getBlob(blobKey);
        if (blobStore.deleteBlob) {
          await blobStore.deleteBlob(blobKey);
        }
      } else {
        bytes = toUint8Array(row["data"]);
      }

      if (!bytes) return null;

      return {
        data: bytes,
        filename: String(row["filename"]),
        content_type: String(row["content_type"]),
        byte_size: Number(row["byte_size"]),
        dimensions: parseJsonColumn<[number, number] | null>(row["dimensions_json"], null)
      };
    },

    async createFeedback(input: CreateFeedbackRecordInput): Promise<StoredFeedbackRecord> {
      await ensureMigrated();
      const fbRes = await pool.query(
        `INSERT INTO context_drop_feedbacks
         (environment, status, message, page_url, user_agent, session_id, submitter, metadata)
         VALUES ($1, 'new', $2, $3, $4, $5, $6::jsonb, $7::jsonb)
         RETURNING *`,
        [
          input.environment,
          input.message,
          input.page_url,
          input.user_agent,
          input.session_id,
          JSON.stringify(input.submitter || {}),
          JSON.stringify(input.metadata || {})
        ]
      );
      const fbRow = fbRes.rows[0];
      const fbId = Number(fbRow["id"]);

      const elIdByRef = new Map<string, number>();
      for (let idx = 0; idx < input.element_references.length; idx++) {
        const el = input.element_references[idx];
        const elRes = await pool.query(
          `INSERT INTO context_drop_element_references
           (feedback_id, client_ref, tag_name, selector, dom_path, text_content,
            attributes_snapshot, bounding_rect, viewport, metadata, captured_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9::jsonb, $10::jsonb, $11::timestamptz)
           RETURNING id`,
          [
            fbId,
            el.client_ref,
            el.tag_name,
            el.selector,
            el.dom_path,
            el.text_content,
            JSON.stringify(el.attributes_snapshot || {}),
            JSON.stringify(el.bounding_rect || {}),
            JSON.stringify(el.viewport || {}),
            JSON.stringify(el.metadata || {}),
            el.captured_at
          ]
        );
        const elId = Number(elRes.rows[0]["id"]);
        elIdByRef.set(el.client_ref || String(idx), elId);
      }

      for (const att of input.attachments) {
        const linkedElId = att.element_client_ref
          ? elIdByRef.get(att.element_client_ref) ?? null
          : null;
        let blobKey: string | null = null;
        let inlineBytes: Buffer | null = null;

        if (att.data) {
          if (blobStore) {
            const saved = await blobStore.putBlob({
              key: `att_${fbId}_${crypto.randomUUID()}`,
              data: att.data,
              contentType: att.content_type || "image/png",
              filename: att.filename || "attachment.png"
            });
            blobKey = saved.key;
          } else {
            inlineBytes = Buffer.from(att.data);
          }
        }

        await pool.query(
          `INSERT INTO context_drop_attachments
           (feedback_id, element_reference_id, attachment_type, filename, content_type, byte_size, blob_key, data, metadata)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)`,
          [
            fbId,
            linkedElId,
            att.attachment_type,
            att.filename,
            att.content_type,
            att.byte_size,
            blobKey,
            inlineBytes,
            JSON.stringify(att.metadata || {})
          ]
        );
      }

      return hydrateFeedbackRow(fbRow);
    },

    async listFeedbacks(filter: FeedbackQueryFilter) {
      await ensureMigrated();
      const limit = Math.max(1, Math.min(100, filter.limit ?? 20));
      const offset = Math.max(0, filter.offset ?? 0);

      const clauses: string[] = [];
      const values: unknown[] = [];

      if (!filter.include_deleted) {
        clauses.push("f.deleted_at IS NULL");
      }
      if (filter.environment && filter.environment.trim().length > 0) {
        values.push(filter.environment.trim().toLowerCase());
        clauses.push(`LOWER(f.environment) = $${values.length}`);
      }
      if (filter.status) {
        values.push(filter.status);
        clauses.push(`f.status = $${values.length}`);
      }
      if (filter.page_url && filter.page_url.trim().length > 0) {
        values.push(`%${filter.page_url.trim()}%`);
        clauses.push(`f.page_url ILIKE $${values.length}`);
      }
      if (filter.query && filter.query.trim().length > 0) {
        values.push(`%${filter.query.trim()}%`);
        const p = `$${values.length}`;
        clauses.push(
          `(f.message ILIKE ${p} OR EXISTS (
             SELECT 1 FROM context_drop_element_references e
             WHERE e.feedback_id = f.id
               AND (e.selector ILIKE ${p} OR e.dom_path ILIKE ${p} OR e.text_content ILIKE ${p})
           ))`
        );
      }

      const whereSql = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
      const countRes = await pool.query(
        `SELECT COUNT(*)::int AS total FROM context_drop_feedbacks f ${whereSql}`,
        values
      );
      const total = Number(countRes.rows[0]?.["total"] ?? 0);

      const pageValues = [...values, limit, offset];
      const rowsRes = await pool.query(
        `SELECT f.* FROM context_drop_feedbacks f ${whereSql}
         ORDER BY f.created_at DESC, f.id DESC
         LIMIT $${pageValues.length - 1} OFFSET $${pageValues.length}`,
        pageValues
      );

      const hydrated = await Promise.all(rowsRes.rows.map(hydrateFeedbackRow));
      return {
        total,
        records: hydrated.map(toFeedbackSummary)
      };
    },

    async listOwnFeedbacks(query: OwnFeedbackLookupQuery) {
      await ensureMigrated();
      const limit = Math.max(1, Math.min(50, query.limit ?? 20));
      const ownershipClauses: string[] = [];
      const values: unknown[] = [];

      if (hasAuthenticatedSubmitter(query.submitter)) {
        values.push(String(query.submitter?.type || "User").trim());
        const typeParam = `$${values.length}`;
        values.push(String(query.submitter?.id).trim());
        const idParam = `$${values.length}`;
        ownershipClauses.push(
          `(COALESCE(NULLIF(f.submitter->>'type', ''), 'User') = ${typeParam} AND f.submitter->>'id' = ${idParam})`
        );
      }

      if (query.session_id && query.session_id.trim().length > 0) {
        values.push(query.session_id.trim());
        const sidParam = `$${values.length}`;
        ownershipClauses.push(
          `((f.submitter->>'id' IS NULL OR f.submitter->>'id' = '') AND f.session_id = ${sidParam})`
        );
      }

      const numericTokenIds = (query.token_ids ?? [])
        .map((t) => Number(t))
        .filter((n) => Number.isInteger(n) && n > 0);
      if (numericTokenIds.length > 0) {
        values.push(numericTokenIds);
        const idsParam = `$${values.length}`;
        ownershipClauses.push(
          `((f.submitter->>'id' IS NULL OR f.submitter->>'id' = '') AND f.id = ANY(${idsParam}::bigint[]))`
        );
      }

      if (ownershipClauses.length === 0) {
        return { total: 0, records: [] };
      }

      const whereSql = `WHERE f.deleted_at IS NULL AND (${ownershipClauses.join(" OR ")})`;
      const countRes = await pool.query(
        `SELECT COUNT(*)::int AS total FROM context_drop_feedbacks f ${whereSql}`,
        values
      );
      const total = Number(countRes.rows[0]?.["total"] ?? 0);

      const pageValues = [...values, limit];
      const rowsRes = await pool.query(
        `SELECT f.* FROM context_drop_feedbacks f ${whereSql}
         ORDER BY f.created_at DESC, f.id DESC
         LIMIT $${pageValues.length}`,
        pageValues
      );
      const hydrated = await Promise.all(rowsRes.rows.map(hydrateFeedbackRow));
      return {
        total,
        records: hydrated
      };
    },

    async getFeedback(id: string | number): Promise<StoredFeedbackRecord | null> {
      await ensureMigrated();
      const res = await pool.query("SELECT * FROM context_drop_feedbacks WHERE id = $1", [
        Number(id)
      ]);
      const row = res.rows[0];
      if (!row) return null;
      return hydrateFeedbackRow(row);
    },

    async updateFeedback(
      id: string | number,
      input: UpdateFeedbackRecordInput
    ): Promise<StoredFeedbackRecord | null> {
      await ensureMigrated();
      const fbId = Number(id);
      const existing = await this.getFeedback(fbId);
      if (!existing || existing.deleted_at) return null;

      const nextMessage = input.message !== undefined ? input.message : existing.message;
      const nextMetadata = input.metadata !== undefined ? input.metadata : existing.metadata;

      await pool.query(
        `UPDATE context_drop_feedbacks
         SET message = $1, metadata = $2::jsonb, updated_at = NOW()
         WHERE id = $3`,
        [nextMessage, JSON.stringify(nextMetadata || {}), fbId]
      );

      const elIdByRef = new Map<string, number>();
      if (input.element_references !== undefined) {
        await pool.query(
          "DELETE FROM context_drop_element_references WHERE feedback_id = $1",
          [fbId]
        );
        for (let idx = 0; idx < input.element_references.length; idx++) {
          const el = input.element_references[idx];
          const elRes = await pool.query(
            `INSERT INTO context_drop_element_references
             (feedback_id, client_ref, tag_name, selector, dom_path, text_content,
              attributes_snapshot, bounding_rect, viewport, metadata, captured_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9::jsonb, $10::jsonb, $11::timestamptz)
             RETURNING id`,
            [
              fbId,
              el.client_ref,
              el.tag_name,
              el.selector,
              el.dom_path,
              el.text_content,
              JSON.stringify(el.attributes_snapshot || {}),
              JSON.stringify(el.bounding_rect || {}),
              JSON.stringify(el.viewport || {}),
              JSON.stringify(el.metadata || {}),
              el.captured_at
            ]
          );
          elIdByRef.set(el.client_ref || String(idx), Number(elRes.rows[0]["id"]));
        }
      } else {
        existing.element_references.forEach((el, idx) => {
          elIdByRef.set(el.client_ref || String(idx), Number(el.id));
        });
      }

      if (input.attachments !== undefined) {
        const retainedIds = new Set<number>();
        const prevById = new Map<string, StoredAttachment>();
        for (const a of existing.attachments) {
          prevById.set(String(a.id), a);
        }

        for (const spec of input.attachments) {
          if (spec.kind === "retain") {
            const prev = prevById.get(String(spec.existing_id));
            if (!prev) continue;
            retainedIds.add(Number(prev.id));
            const linkedElId =
              spec.element_client_ref !== undefined
                ? spec.element_client_ref
                  ? elIdByRef.get(spec.element_client_ref) ?? null
                  : null
                : input.element_references === undefined && prev.element_reference_id !== null
                  ? Number(prev.element_reference_id)
                  : null;
            const nextAttMeta =
              spec.update_metadata && spec.metadata ? spec.metadata : prev.metadata;
            await pool.query(
              `UPDATE context_drop_attachments
               SET element_reference_id = $1, metadata = $2::jsonb
               WHERE id = $3`,
              [linkedElId, JSON.stringify(nextAttMeta || {}), Number(prev.id)]
            );
          }
        }

        for (const prev of existing.attachments) {
          if (!retainedIds.has(Number(prev.id))) {
            await pool.query("DELETE FROM context_drop_attachments WHERE id = $1", [
              Number(prev.id)
            ]);
            if (prev.blob_key && blobStore?.deleteBlob) {
              await blobStore.deleteBlob(prev.blob_key);
            }
          }
        }

        for (const spec of input.attachments) {
          if (spec.kind !== "create") continue;
          const linkedElId = spec.element_client_ref
            ? elIdByRef.get(spec.element_client_ref) ?? null
            : null;
          let blobKey: string | null = null;
          let inlineBytes: Buffer | null = null;

          if (spec.data) {
            if (blobStore) {
              const saved = await blobStore.putBlob({
                key: `att_${fbId}_${crypto.randomUUID()}`,
                data: spec.data,
                contentType: spec.content_type || "image/png",
                filename: spec.filename || "attachment.png"
              });
              blobKey = saved.key;
            } else {
              inlineBytes = Buffer.from(spec.data);
            }
          }

          await pool.query(
            `INSERT INTO context_drop_attachments
             (feedback_id, element_reference_id, attachment_type, filename, content_type, byte_size, blob_key, data, metadata)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)`,
            [
              fbId,
              linkedElId,
              spec.attachment_type,
              spec.filename,
              spec.content_type,
              spec.byte_size,
              blobKey,
              inlineBytes,
              JSON.stringify(spec.metadata || {})
            ]
          );
        }
      }

      return this.getFeedback(fbId);
    },

    async softDeleteFeedback(id: string | number): Promise<StoredFeedbackRecord | null> {
      await ensureMigrated();
      const fbId = Number(id);
      const existing = await this.getFeedback(fbId);
      if (!existing || existing.deleted_at) return null;

      const res = await pool.query(
        `UPDATE context_drop_feedbacks
         SET deleted_at = NOW(), updated_at = NOW()
         WHERE id = $1 AND deleted_at IS NULL
         RETURNING *`,
        [fbId]
      );
      const row = res.rows[0];
      if (!row) return null;
      return hydrateFeedbackRow(row);
    },

    async getAttachment(attachmentId: string | number) {
      await ensureMigrated();
      const res = await pool.query(
        `SELECT a.*, e.selector AS element_selector
         FROM context_drop_attachments a
         LEFT JOIN context_drop_element_references e ON e.id = a.element_reference_id
         WHERE a.id = $1`,
        [Number(attachmentId)]
      );
      const row = res.rows[0];
      if (!row) return null;

      const blobKey = (row["blob_key"] as string | null) ?? null;
      let bytes: Uint8Array | null = null;
      if (blobKey && blobStore) {
        bytes = await blobStore.getBlob(blobKey);
      } else {
        bytes = toUint8Array(row["data"]);
      }

      const attachment: StoredAttachment = {
        id: Number(row["id"]),
        feedback_id: Number(row["feedback_id"]),
        element_reference_id:
          row["element_reference_id"] !== null && row["element_reference_id"] !== undefined
            ? Number(row["element_reference_id"])
            : null,
        attachment_type: row["attachment_type"] === "screenshot" ? "screenshot" : "image",
        filename: (row["filename"] as string | null) ?? null,
        content_type: (row["content_type"] as string | null) ?? null,
        byte_size:
          row["byte_size"] !== null && row["byte_size"] !== undefined
            ? Number(row["byte_size"])
            : null,
        blob_key: blobKey,
        metadata: parseJsonColumn(row["metadata"], {}),
        created_at: toIsoString(row["created_at"])
      };

      return {
        attachment,
        element_selector: (row["element_selector"] as string | null) ?? null,
        data: bytes
      };
    },

    async getAttachmentBytes(attachmentId: string | number): Promise<Uint8Array | null> {
      const res = await this.getAttachment(attachmentId);
      return res?.data ?? null;
    },

    async updateFeedbackStatus(id: string | number, status: FeedbackStatus) {
      await ensureMigrated();
      const existing = await this.getFeedback(id);
      if (!existing || existing.deleted_at) return null;

      const res = await pool.query(
        `UPDATE context_drop_feedbacks
         SET status = $1, updated_at = NOW()
         WHERE id = $2
         RETURNING *`,
        [status, Number(id)]
      );
      const row = res.rows[0];
      if (!row) return null;

      return {
        previous_status: existing.status,
        feedback: await hydrateFeedbackRow(row)
      };
    }
  };
}
