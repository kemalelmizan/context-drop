import crypto from "node:crypto";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
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
import { matchesFeedbackFilter, matchesOwnFeedback, toFeedbackSummary } from "./memory.ts";

export interface LocalStorageAdapterOptions {
  /**
   * Directory where local SQLite/JSON metadata and binary attachment blobs are stored.
   * Defaults to `process.env.CONTEXT_DROP_STORAGE_DIR` or `<cwd>/.context-drop`.
   */
  dir?: string;
  /**
   * Storage backend engine: `"auto"` (uses Node 22.5+ built-in `node:sqlite` when available,
   * falling back to atomic JSON), `"sqlite"`, or `"json"`.
   */
  backend?: "auto" | "sqlite" | "json";
  /**
   * Optional HMAC secret for signing pending upload blob IDs and ownership tokens.
   */
  secret?: string;
  /**
   * Optional custom blob store (e.g. S3 / Vercel Blob) instead of `<dir>/blobs/`.
   */
  blobStore?: BlobStorageAdapter;
}

interface SqliteStatementLike {
  run(...params: unknown[]): { lastInsertRowid: number | bigint; changes: number | bigint };
  get(...params: unknown[]): Record<string, unknown> | undefined;
  all(...params: unknown[]): Array<Record<string, unknown>>;
}

interface SqliteDatabaseLike {
  exec(sql: string): void;
  prepare(sql: string): SqliteStatementLike;
  close(): void;
}

interface JsonStoreShape {
  nextFeedbackId: number;
  nextElementId: number;
  nextAttachmentId: number;
  pendingBlobs: Record<
    string,
    {
      filename: string;
      content_type: string;
      byte_size: number;
      dimensions: [number, number] | null;
      blob_key: string;
      created_at: string;
    }
  >;
  feedbacks: StoredFeedbackRecord[];
}

function tryOpenNodeSqlite(dbPath: string): SqliteDatabaseLike | null {
  try {
    const req = createRequire(import.meta.url);
    const sqliteMod = req("node:sqlite") as {
      DatabaseSync?: new (filename: string) => SqliteDatabaseLike;
    };
    if (sqliteMod && typeof sqliteMod.DatabaseSync === "function") {
      const db = new sqliteMod.DatabaseSync(dbPath);
      db.exec("PRAGMA journal_mode = WAL;");
      db.exec("PRAGMA busy_timeout = 5000;");
      db.exec("PRAGMA foreign_keys = ON;");
      return db;
    }
  } catch {
    // Fallback to JSON file store when node:sqlite is unavailable
  }
  return null;
}

function createDiskBlobStore(blobsDir: string): BlobStorageAdapter {
  return {
    async putBlob({ key, data }) {
      fs.mkdirSync(blobsDir, { recursive: true });
      const safeKey = key.replace(/[^a-zA-Z0-9._-]/g, "_");
      const targetPath = path.join(blobsDir, safeKey);
      fs.writeFileSync(targetPath, data);
      return { key: safeKey };
    },
    async getBlob(key: string) {
      const safeKey = key.replace(/[^a-zA-Z0-9._-]/g, "_");
      const targetPath = path.join(blobsDir, safeKey);
      if (!fs.existsSync(targetPath)) return null;
      const buf = fs.readFileSync(targetPath);
      return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
    },
    async deleteBlob(key: string) {
      const safeKey = key.replace(/[^a-zA-Z0-9._-]/g, "_");
      const targetPath = path.join(blobsDir, safeKey);
      if (fs.existsSync(targetPath)) {
        fs.unlinkSync(targetPath);
      }
    }
  };
}

function resolveOrCreateSecret(storageDir: string, explicitSecret?: string): Buffer {
  const fromEnv = explicitSecret || process.env.CONTEXT_DROP_SECRET;
  if (fromEnv && fromEnv.trim().length > 0) {
    return crypto.createHash("sha256").update(fromEnv.trim()).digest();
  }

  const secretPath = path.join(storageDir, ".blob_secret");
  if (fs.existsSync(secretPath)) {
    return crypto.createHash("sha256").update(fs.readFileSync(secretPath, "utf8").trim()).digest();
  }

  const generated = crypto.randomBytes(32).toString("hex");
  fs.writeFileSync(secretPath, generated, { encoding: "utf8", mode: 0o600 });
  return crypto.createHash("sha256").update(generated).digest();
}

export function createLocalStorageAdapter(options: LocalStorageAdapterOptions = {}): StorageAdapter {
  const storageDir = path.resolve(
    options.dir || process.env.CONTEXT_DROP_STORAGE_DIR || path.join(process.cwd(), ".context-drop")
  );
  fs.mkdirSync(storageDir, { recursive: true });

  const gitignorePath = path.join(storageDir, ".gitignore");
  if (!fs.existsSync(gitignorePath)) {
    fs.writeFileSync(gitignorePath, "*\n", "utf8");
  }

  const blobsDir = path.join(storageDir, "blobs");
  fs.mkdirSync(blobsDir, { recursive: true });

  const blobStore = options.blobStore ?? createDiskBlobStore(blobsDir);
  const secretKey = resolveOrCreateSecret(storageDir, options.secret);

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

  const requestedBackend = options.backend ?? "auto";
  const dbPath = path.join(storageDir, "context_drop.sqlite");
  const sqliteDb =
    requestedBackend === "json" ? null : tryOpenNodeSqlite(dbPath);

  if (requestedBackend === "sqlite" && !sqliteDb) {
    throw new Error("ContextDrop SQLite backend requested, but node:sqlite is unavailable in this Node runtime.");
  }

  if (sqliteDb) {
    sqliteDb.exec(`
      CREATE TABLE IF NOT EXISTS context_drop_pending_blobs (
        id TEXT PRIMARY KEY,
        filename TEXT NOT NULL,
        content_type TEXT NOT NULL,
        byte_size INTEGER NOT NULL,
        dimensions_json TEXT,
        blob_key TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS context_drop_feedbacks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        environment TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'new',
        message TEXT,
        page_url TEXT NOT NULL,
        user_agent TEXT,
        session_id TEXT,
        submitter_json TEXT NOT NULL,
        metadata_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        deleted_at TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_cd_feedbacks_env_status
        ON context_drop_feedbacks (environment, status, created_at DESC);

      CREATE TABLE IF NOT EXISTS context_drop_element_references (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        feedback_id INTEGER NOT NULL REFERENCES context_drop_feedbacks(id) ON DELETE CASCADE,
        client_ref TEXT,
        tag_name TEXT NOT NULL,
        selector TEXT NOT NULL,
        dom_path TEXT,
        text_content TEXT,
        attributes_json TEXT NOT NULL,
        bounding_rect_json TEXT NOT NULL,
        viewport_json TEXT NOT NULL,
        metadata_json TEXT NOT NULL,
        captured_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS context_drop_attachments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        feedback_id INTEGER NOT NULL REFERENCES context_drop_feedbacks(id) ON DELETE CASCADE,
        element_reference_id INTEGER REFERENCES context_drop_element_references(id) ON DELETE SET NULL,
        attachment_type TEXT NOT NULL,
        filename TEXT,
        content_type TEXT,
        byte_size INTEGER,
        blob_key TEXT,
        metadata_json TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
    `);

    const cols = sqliteDb.prepare("PRAGMA table_info(context_drop_feedbacks)").all();
    if (!cols.some((c) => String(c["name"]) === "deleted_at")) {
      sqliteDb.exec("ALTER TABLE context_drop_feedbacks ADD COLUMN deleted_at TEXT;");
    }

    const hydrateFeedbackRow = (row: Record<string, unknown>): StoredFeedbackRecord => {
      const fbId = Number(row["id"]);
      const elRows = sqliteDb
        .prepare("SELECT * FROM context_drop_element_references WHERE feedback_id = ? ORDER BY id ASC")
        .all(fbId);
      const attRows = sqliteDb
        .prepare("SELECT * FROM context_drop_attachments WHERE feedback_id = ? ORDER BY id ASC")
        .all(fbId);

      const elements: StoredElementReference[] = elRows.map((el) => ({
        id: Number(el["id"]),
        feedback_id: fbId,
        client_ref: (el["client_ref"] as string | null) ?? null,
        tag_name: String(el["tag_name"]),
        selector: String(el["selector"]),
        dom_path: (el["dom_path"] as string | null) ?? null,
        text_content: (el["text_content"] as string | null) ?? null,
        attributes_snapshot: JSON.parse(String(el["attributes_json"] || "{}")),
        bounding_rect: JSON.parse(String(el["bounding_rect_json"] || "{}")),
        viewport: JSON.parse(String(el["viewport_json"] || "{}")),
        metadata: JSON.parse(String(el["metadata_json"] || "{}")),
        captured_at: String(el["captured_at"])
      }));

      const attachments: StoredAttachment[] = attRows.map((att) => ({
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
        metadata: JSON.parse(String(att["metadata_json"] || "{}")),
        created_at: String(att["created_at"])
      }));

      return {
        id: fbId,
        environment: String(row["environment"]),
        status: String(row["status"]) as FeedbackStatus,
        message: (row["message"] as string | null) ?? null,
        page_url: String(row["page_url"]),
        user_agent: (row["user_agent"] as string | null) ?? null,
        session_id: (row["session_id"] as string | null) ?? null,
        submitter: JSON.parse(String(row["submitter_json"] || "{}")),
        metadata: JSON.parse(String(row["metadata_json"] || "{}")),
        element_references: elements,
        attachments,
        created_at: String(row["created_at"]),
        updated_at: String(row["updated_at"]),
        deleted_at: (row["deleted_at"] as string | null) ?? null
      };
    };

    return {
      getOwnershipSecret(): Buffer {
        return secretKey;
      },

      async savePendingBlob(blob: ValidatedUpload): Promise<{ signed_blob_id: string }> {
        const rawId = crypto.randomUUID();
        const stored = await blobStore.putBlob({
          key: `pending_${rawId}`,
          data: blob.data,
          contentType: blob.content_type,
          filename: blob.filename
        });
        sqliteDb
          .prepare(
            `INSERT INTO context_drop_pending_blobs
             (id, filename, content_type, byte_size, dimensions_json, blob_key, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)`
          )
          .run(
            rawId,
            blob.filename,
            blob.content_type,
            blob.byte_size,
            blob.dimensions ? JSON.stringify(blob.dimensions) : null,
            stored.key,
            new Date().toISOString()
          );
        return { signed_blob_id: signId(rawId) };
      },

      async consumePendingBlob(signedBlobId: string): Promise<ValidatedUpload | null> {
        const rawId = verifySignedId(signedBlobId);
        if (!rawId) return null;
        const row = sqliteDb
          .prepare("SELECT * FROM context_drop_pending_blobs WHERE id = ?")
          .get(rawId);
        if (!row) return null;

        sqliteDb.prepare("DELETE FROM context_drop_pending_blobs WHERE id = ?").run(rawId);
        const blobKey = String(row["blob_key"]);
        const bytes = await blobStore.getBlob(blobKey);
        if (blobStore.deleteBlob) {
          await blobStore.deleteBlob(blobKey);
        }
        if (!bytes) return null;

        return {
          data: bytes,
          filename: String(row["filename"]),
          content_type: String(row["content_type"]),
          byte_size: Number(row["byte_size"]),
          dimensions: row["dimensions_json"]
            ? (JSON.parse(String(row["dimensions_json"])) as [number, number])
            : null
        };
      },

      async createFeedback(input: CreateFeedbackRecordInput): Promise<StoredFeedbackRecord> {
        const now = new Date().toISOString();
        const fbRes = sqliteDb
          .prepare(
            `INSERT INTO context_drop_feedbacks
             (environment, status, message, page_url, user_agent, session_id, submitter_json, metadata_json, created_at, updated_at)
             VALUES (?, 'new', ?, ?, ?, ?, ?, ?, ?, ?)`
          )
          .run(
            input.environment,
            input.message,
            input.page_url,
            input.user_agent,
            input.session_id,
            JSON.stringify(input.submitter || {}),
            JSON.stringify(input.metadata || {}),
            now,
            now
          );
        const fbId = Number(fbRes.lastInsertRowid);

        const elIdByClientRef = new Map<string, number>();
        const insertElStmt = sqliteDb.prepare(
          `INSERT INTO context_drop_element_references
           (feedback_id, client_ref, tag_name, selector, dom_path, text_content, attributes_json, bounding_rect_json, viewport_json, metadata_json, captured_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        );

        input.element_references.forEach((el, idx) => {
          const elRes = insertElStmt.run(
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
          );
          const elId = Number(elRes.lastInsertRowid);
          const key = el.client_ref || String(idx);
          elIdByClientRef.set(key, elId);
        });

        const insertAttStmt = sqliteDb.prepare(
          `INSERT INTO context_drop_attachments
           (feedback_id, element_reference_id, attachment_type, filename, content_type, byte_size, blob_key, metadata_json, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        );

        for (const att of input.attachments) {
          const linkedElId = att.element_client_ref
            ? elIdByClientRef.get(att.element_client_ref) ?? null
            : null;
          let blobKey: string | null = null;
          if (att.data) {
            const saved = await blobStore.putBlob({
              key: `att_${fbId}_${crypto.randomUUID()}`,
              data: att.data,
              contentType: att.content_type || "image/png",
              filename: att.filename || "attachment.png"
            });
            blobKey = saved.key;
          }
          insertAttStmt.run(
            fbId,
            linkedElId,
            att.attachment_type,
            att.filename,
            att.content_type,
            att.byte_size,
            blobKey,
            JSON.stringify(att.metadata || {}),
            now
          );
        }

        const created = await this.getFeedback(fbId);
        if (!created) {
          throw new Error("Failed to load created ContextDrop feedback record");
        }
        return created;
      },

      async listFeedbacks(filter: FeedbackQueryFilter) {
        const limit = Math.max(1, Math.min(100, filter.limit ?? 20));
        const offset = Math.max(0, filter.offset ?? 0);
        const rows = sqliteDb
          .prepare("SELECT * FROM context_drop_feedbacks ORDER BY created_at DESC, id DESC")
          .all();

        const hydrated = rows.map(hydrateFeedbackRow).filter((fb) => matchesFeedbackFilter(fb, filter));
        return {
          total: hydrated.length,
          records: hydrated.slice(offset, offset + limit).map(toFeedbackSummary)
        };
      },

      async listOwnFeedbacks(query: OwnFeedbackLookupQuery) {
        const limit = Math.max(1, Math.min(50, query.limit ?? 20));
        const rows = sqliteDb
          .prepare("SELECT * FROM context_drop_feedbacks WHERE deleted_at IS NULL ORDER BY created_at DESC, id DESC")
          .all();

        const matching = rows.map(hydrateFeedbackRow).filter((fb) => matchesOwnFeedback(fb, query));
        return {
          total: matching.length,
          records: matching.slice(0, limit)
        };
      },

      async getFeedback(id: string | number): Promise<StoredFeedbackRecord | null> {
        const row = sqliteDb
          .prepare("SELECT * FROM context_drop_feedbacks WHERE id = ?")
          .get(Number(id));
        if (!row) return null;
        return hydrateFeedbackRow(row);
      },

      async updateFeedback(
        id: string | number,
        input: UpdateFeedbackRecordInput
      ): Promise<StoredFeedbackRecord | null> {
        const fbId = Number(id);
        const existing = await this.getFeedback(fbId);
        if (!existing || existing.deleted_at) return null;

        const now = new Date().toISOString();
        const nextMessage = input.message !== undefined ? input.message : existing.message;
        const nextMetadata = input.metadata !== undefined ? input.metadata : existing.metadata;

        sqliteDb
          .prepare(
            "UPDATE context_drop_feedbacks SET message = ?, metadata_json = ?, updated_at = ? WHERE id = ?"
          )
          .run(nextMessage, JSON.stringify(nextMetadata || {}), now, fbId);

        const elIdByRef = new Map<string, number>();
        if (input.element_references !== undefined) {
          sqliteDb
            .prepare("DELETE FROM context_drop_element_references WHERE feedback_id = ?")
            .run(fbId);

          const insertElStmt = sqliteDb.prepare(
            `INSERT INTO context_drop_element_references
             (feedback_id, client_ref, tag_name, selector, dom_path, text_content, attributes_json, bounding_rect_json, viewport_json, metadata_json, captured_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          );
          input.element_references.forEach((el, idx) => {
            const elRes = insertElStmt.run(
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
            );
            elIdByRef.set(el.client_ref || String(idx), Number(elRes.lastInsertRowid));
          });
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
              sqliteDb
                .prepare(
                  "UPDATE context_drop_attachments SET element_reference_id = ?, metadata_json = ? WHERE id = ?"
                )
                .run(linkedElId, JSON.stringify(nextAttMeta || {}), Number(prev.id));
            }
          }

          for (const prev of existing.attachments) {
            if (!retainedIds.has(Number(prev.id))) {
              sqliteDb
                .prepare("DELETE FROM context_drop_attachments WHERE id = ?")
                .run(Number(prev.id));
              if (prev.blob_key && blobStore.deleteBlob) {
                await blobStore.deleteBlob(prev.blob_key);
              }
            }
          }

          const insertAttStmt = sqliteDb.prepare(
            `INSERT INTO context_drop_attachments
             (feedback_id, element_reference_id, attachment_type, filename, content_type, byte_size, blob_key, metadata_json, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
          );
          for (const spec of input.attachments) {
            if (spec.kind !== "create") continue;
            const linkedElId = spec.element_client_ref
              ? elIdByRef.get(spec.element_client_ref) ?? null
              : null;
            let blobKey: string | null = null;
            if (spec.data) {
              const saved = await blobStore.putBlob({
                key: `att_${fbId}_${crypto.randomUUID()}`,
                data: spec.data,
                contentType: spec.content_type || "image/png",
                filename: spec.filename || "attachment.png"
              });
              blobKey = saved.key;
            }
            insertAttStmt.run(
              fbId,
              linkedElId,
              spec.attachment_type,
              spec.filename,
              spec.content_type,
              spec.byte_size,
              blobKey,
              JSON.stringify(spec.metadata || {}),
              now
            );
          }
        }

        return this.getFeedback(fbId);
      },

      async softDeleteFeedback(id: string | number): Promise<StoredFeedbackRecord | null> {
        const fbId = Number(id);
        const existing = await this.getFeedback(fbId);
        if (!existing || existing.deleted_at) return null;

        const now = new Date().toISOString();
        sqliteDb
          .prepare(
            "UPDATE context_drop_feedbacks SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL"
          )
          .run(now, now, fbId);
        return this.getFeedback(fbId);
      },

      async getAttachment(attachmentId: string | number) {
        const row = sqliteDb
          .prepare(
            `SELECT a.*, e.selector AS element_selector
             FROM context_drop_attachments a
             LEFT JOIN context_drop_element_references e ON e.id = a.element_reference_id
             WHERE a.id = ?`
          )
          .get(Number(attachmentId));
        if (!row) return null;

        const blobKey = (row["blob_key"] as string | null) ?? null;
        const bytes = blobKey ? await blobStore.getBlob(blobKey) : null;

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
          metadata: JSON.parse(String(row["metadata_json"] || "{}")),
          created_at: String(row["created_at"])
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
        const existing = await this.getFeedback(id);
        if (!existing || existing.deleted_at) return null;

        const now = new Date().toISOString();
        sqliteDb
          .prepare("UPDATE context_drop_feedbacks SET status = ?, updated_at = ? WHERE id = ?")
          .run(status, now, Number(id));
        const updated = await this.getFeedback(id);
        if (!updated) return null;

        return {
          previous_status: existing.status,
          feedback: updated
        };
      }
    };
  }

  // Fallback atomic JSON file store
  const jsonFilePath = path.join(storageDir, "feedbacks.json");

  function readJsonStore(): JsonStoreShape {
    if (!fs.existsSync(jsonFilePath)) {
      return {
        nextFeedbackId: 1,
        nextElementId: 1,
        nextAttachmentId: 1,
        pendingBlobs: {},
        feedbacks: []
      };
    }
    try {
      const raw = fs.readFileSync(jsonFilePath, "utf8");
      return JSON.parse(raw) as JsonStoreShape;
    } catch {
      return {
        nextFeedbackId: 1,
        nextElementId: 1,
        nextAttachmentId: 1,
        pendingBlobs: {},
        feedbacks: []
      };
    }
  }

  function writeJsonStore(state: JsonStoreShape): void {
    const tmpPath = `${jsonFilePath}.${process.pid}.${Date.now()}.tmp`;
    fs.writeFileSync(tmpPath, JSON.stringify(state, null, 2), "utf8");
    fs.renameSync(tmpPath, jsonFilePath);
  }

  return {
    getOwnershipSecret(): Buffer {
      return secretKey;
    },

    async savePendingBlob(blob: ValidatedUpload): Promise<{ signed_blob_id: string }> {
      const rawId = crypto.randomUUID();
      const stored = await blobStore.putBlob({
        key: `pending_${rawId}`,
        data: blob.data,
        contentType: blob.content_type,
        filename: blob.filename
      });
      const state = readJsonStore();
      state.pendingBlobs[rawId] = {
        filename: blob.filename,
        content_type: blob.content_type,
        byte_size: blob.byte_size,
        dimensions: blob.dimensions,
        blob_key: stored.key,
        created_at: new Date().toISOString()
      };
      writeJsonStore(state);
      return { signed_blob_id: signId(rawId) };
    },

    async consumePendingBlob(signedBlobId: string): Promise<ValidatedUpload | null> {
      const rawId = verifySignedId(signedBlobId);
      if (!rawId) return null;
      const state = readJsonStore();
      const entry = state.pendingBlobs[rawId];
      if (!entry) return null;

      delete state.pendingBlobs[rawId];
      writeJsonStore(state);

      const bytes = await blobStore.getBlob(entry.blob_key);
      if (blobStore.deleteBlob) {
        await blobStore.deleteBlob(entry.blob_key);
      }
      if (!bytes) return null;

      return {
        data: bytes,
        filename: entry.filename,
        content_type: entry.content_type,
        byte_size: entry.byte_size,
        dimensions: entry.dimensions
      };
    },

    async createFeedback(input: CreateFeedbackRecordInput): Promise<StoredFeedbackRecord> {
      const state = readJsonStore();
      const id = state.nextFeedbackId++;
      const now = new Date().toISOString();

      const elementsByRef = new Map<string, StoredElementReference>();
      const storedElements: StoredElementReference[] = input.element_references.map((el, idx) => {
        const elRec: StoredElementReference = {
          id: state.nextElementId++,
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
        elementsByRef.set(el.client_ref || String(idx), elRec);
        return elRec;
      });

      const storedAttachments: StoredAttachment[] = [];
      for (const att of input.attachments) {
        const attId = state.nextAttachmentId++;
        const linkedEl = att.element_client_ref
          ? elementsByRef.get(att.element_client_ref) ?? null
          : null;
        let blobKey: string | null = null;
        if (att.data) {
          const saved = await blobStore.putBlob({
            key: `att_${id}_${attId}_${crypto.randomUUID()}`,
            data: att.data,
            contentType: att.content_type || "image/png",
            filename: att.filename || "attachment.png"
          });
          blobKey = saved.key;
        }
        storedAttachments.push({
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
        });
      }

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
        created_at: now,
        updated_at: now,
        deleted_at: null
      };

      state.feedbacks.push(record);
      writeJsonStore(state);
      return structuredClone(record);
    },

    async listFeedbacks(filter: FeedbackQueryFilter) {
      const state = readJsonStore();
      const limit = Math.max(1, Math.min(100, filter.limit ?? 20));
      const offset = Math.max(0, filter.offset ?? 0);

      const matching = state.feedbacks
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
      const state = readJsonStore();
      const limit = Math.max(1, Math.min(50, query.limit ?? 20));
      const matching = state.feedbacks
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
      const state = readJsonStore();
      const found = state.feedbacks.find((fb) => String(fb.id) === String(id));
      return found ? structuredClone(found) : null;
    },

    async updateFeedback(
      id: string | number,
      input: UpdateFeedbackRecordInput
    ): Promise<StoredFeedbackRecord | null> {
      const state = readJsonStore();
      const found = state.feedbacks.find((fb) => String(fb.id) === String(id));
      if (!found || found.deleted_at) return null;

      const now = new Date().toISOString();
      if (input.message !== undefined) {
        found.message = input.message;
      }
      if (input.metadata !== undefined) {
        found.metadata = { ...input.metadata };
      }

      const elementsByRef = new Map<string, StoredElementReference>();
      if (input.element_references !== undefined) {
        found.element_references = input.element_references.map((el, idx) => {
          const elRec: StoredElementReference = {
            id: state.nextElementId++,
            feedback_id: found.id,
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
        found.element_references.forEach((el, idx) => {
          elementsByRef.set(el.client_ref || String(idx), el);
        });
      }

      if (input.attachments !== undefined) {
        const prevById = new Map<string, StoredAttachment>();
        for (const a of found.attachments) {
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
                  ? found.element_references.find((e) => e.id === prev.element_reference_id) ?? null
                  : null;
            nextAttachments.push({
              ...prev,
              element_reference_id: linkedEl ? linkedEl.id : null,
              metadata: spec.update_metadata && spec.metadata ? { ...spec.metadata } : { ...prev.metadata }
            });
          } else {
            const attId = state.nextAttachmentId++;
            const linkedEl = spec.element_client_ref
              ? elementsByRef.get(spec.element_client_ref) ?? null
              : null;
            let blobKey: string | null = null;
            if (spec.data) {
              const saved = await blobStore.putBlob({
                key: `att_${found.id}_${attId}_${crypto.randomUUID()}`,
                data: spec.data,
                contentType: spec.content_type || "image/png",
                filename: spec.filename || "attachment.png"
              });
              blobKey = saved.key;
              retainedBlobKeys.add(blobKey);
            }
            nextAttachments.push({
              id: attId,
              feedback_id: found.id,
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

        for (const prev of found.attachments) {
          if (prev.blob_key && !retainedBlobKeys.has(prev.blob_key) && blobStore.deleteBlob) {
            await blobStore.deleteBlob(prev.blob_key);
          }
        }

        found.attachments = nextAttachments;
      }

      found.updated_at = now;
      writeJsonStore(state);
      return structuredClone(found);
    },

    async softDeleteFeedback(id: string | number): Promise<StoredFeedbackRecord | null> {
      const state = readJsonStore();
      const found = state.feedbacks.find((fb) => String(fb.id) === String(id));
      if (!found || found.deleted_at) return null;

      const now = new Date().toISOString();
      found.deleted_at = now;
      found.updated_at = now;
      writeJsonStore(state);
      return structuredClone(found);
    },

    async getAttachment(attachmentId: string | number) {
      const state = readJsonStore();
      for (const fb of state.feedbacks) {
        const att = fb.attachments.find((a) => String(a.id) === String(attachmentId));
        if (att) {
          const linkedEl =
            att.element_reference_id !== null
              ? fb.element_references.find((e) => e.id === att.element_reference_id)
              : undefined;
          const bytes = att.blob_key ? await blobStore.getBlob(att.blob_key) : null;
          return {
            attachment: structuredClone(att),
            element_selector: linkedEl?.selector ?? null,
            data: bytes
          };
        }
      }
      return null;
    },

    async getAttachmentBytes(attachmentId: string | number): Promise<Uint8Array | null> {
      const res = await this.getAttachment(attachmentId);
      return res?.data ?? null;
    },

    async updateFeedbackStatus(id: string | number, status: FeedbackStatus) {
      const state = readJsonStore();
      const found = state.feedbacks.find((fb) => String(fb.id) === String(id));
      if (!found || found.deleted_at) return null;

      const previous_status = found.status;
      found.status = status;
      found.updated_at = new Date().toISOString();
      writeJsonStore(state);

      return {
        previous_status,
        feedback: structuredClone(found)
      };
    }
  };
}
