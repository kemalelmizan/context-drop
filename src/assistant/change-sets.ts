import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { AssistantChangeSet } from "../../app/javascript/context_drop/types.ts";
import type { SubmitterIdentity } from "../server/types.ts";

export const CHANGE_SET_STATUSES = [
  "draft",
  "approved",
  "branch_pushed",
  "pr_open",
  "checks_running",
  "preview_ready",
  "merged",
  "deployed",
  "abandoned"
] as const;

export type ChangeSetStatus = (typeof CHANGE_SET_STATUSES)[number];

export interface ChangeSetPatch {
  path: string;
  old_string: string;
  new_string: string;
}

export interface StoredChangeSetRecord {
  id: number;
  status: ChangeSetStatus;
  page_url: string | null;
  summary: string;
  branch_name: string | null;
  pr_url: string | null;
  preview_url: string | null;
  feedback_id: number | string | null;
  patches: ChangeSetPatch[];
  approval_token_digest: string;
  session_id: string | null;
  submitter: SubmitterIdentity;
  created_at: string;
  updated_at: string;
}

export interface AssistantTurnAuditRecord {
  id: number;
  mode: "ask" | "build" | "feedback";
  session_id: string | null;
  submitter: SubmitterIdentity;
  provider?: string;
  model?: string;
  tool_names: string[];
  change_set_id?: number | null;
  duration_ms: number;
  created_at: string;
}

interface PersistedAssistantState {
  nextChangeSetId: number;
  nextTurnId: number;
  changeSets: StoredChangeSetRecord[];
  turns: AssistantTurnAuditRecord[];
}

function timingSafeHexEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.byteLength !== bufB.byteLength || bufA.byteLength === 0) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

export function digestChangeSetApprovalToken(rawToken: string, secret: Buffer): string {
  return crypto
    .createHmac("sha256", secret)
    .update(`cd_change_set:v1:${rawToken}`)
    .digest("hex");
}

export function serializeChangeSetForWidget(record: StoredChangeSetRecord): AssistantChangeSet {
  return {
    id: record.id,
    status: record.status,
    page_url: record.page_url,
    summary: record.summary,
    branch_name: record.branch_name,
    pr_url: record.pr_url,
    preview_url: record.preview_url,
    feedback_id: record.feedback_id,
    patches: record.patches,
    not_on_main: record.status !== "merged" && record.status !== "deployed",
    created_at: record.created_at,
    updated_at: record.updated_at
  };
}

function hasAttributedSubmitter(sub: SubmitterIdentity | null | undefined): boolean {
  if (!sub) return false;
  return (
    (sub.id !== undefined && sub.id !== null && String(sub.id).trim() !== "") ||
    (typeof sub.label === "string" && sub.label.trim() !== "")
  );
}

export function isChangeSetVisible(
  record: StoredChangeSetRecord,
  caller: {
    submitter?: SubmitterIdentity | null;
    sessionId?: string | null;
    allowAnonymousChangeSets: boolean;
  }
): boolean {
  if (hasAttributedSubmitter(record.submitter)) {
    if (!hasAttributedSubmitter(caller.submitter)) return false;
    const recId = record.submitter.id !== undefined && record.submitter.id !== null ? String(record.submitter.id) : "";
    const calId = caller.submitter?.id !== undefined && caller.submitter?.id !== null ? String(caller.submitter.id) : "";
    const recType = (record.submitter.type ?? "User").trim();
    const calType = (caller.submitter?.type ?? "User").trim();
    if (recId || calId) {
      return Boolean(recId && calId && recId === calId && recType === calType);
    }
    const recLabel = (record.submitter.label ?? "").trim();
    const calLabel = (caller.submitter?.label ?? "").trim();
    return Boolean(recLabel && calLabel && recLabel === calLabel);
  }

  if (!caller.allowAnonymousChangeSets) return false;
  if (!record.session_id || !caller.sessionId) return false;
  return timingSafeHexEqual(record.session_id, caller.sessionId);
}

export class AssistantStateStore {
  private readonly filePath: string | null;
  private state: PersistedAssistantState = {
    nextChangeSetId: 1,
    nextTurnId: 1,
    changeSets: [],
    turns: []
  };

  constructor(options: { dir?: string | null } = {}) {
    this.filePath = options.dir ? path.join(options.dir, "assistant-state.json") : null;
    this.loadFromDisk();
  }

  private loadFromDisk(): void {
    if (!this.filePath || !fs.existsSync(this.filePath)) return;
    try {
      const parsed = JSON.parse(fs.readFileSync(this.filePath, "utf8")) as Partial<PersistedAssistantState>;
      this.state = {
        nextChangeSetId: typeof parsed.nextChangeSetId === "number" ? parsed.nextChangeSetId : 1,
        nextTurnId: typeof parsed.nextTurnId === "number" ? parsed.nextTurnId : 1,
        changeSets: Array.isArray(parsed.changeSets) ? parsed.changeSets : [],
        turns: Array.isArray(parsed.turns) ? parsed.turns : []
      };
    } catch {
      // Non-fatal
    }
  }

  private flushToDisk(): void {
    if (!this.filePath) return;
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const tmp = `${this.filePath}.tmp.${crypto.randomBytes(4).toString("hex")}`;
    fs.writeFileSync(tmp, JSON.stringify(this.state, null, 2), { mode: 0o600 });
    fs.renameSync(tmp, this.filePath);
  }

  public createChangeSet(
    input: {
      page_url: string | null;
      summary: string;
      patches: ChangeSetPatch[];
      session_id: string | null;
      submitter: SubmitterIdentity;
      feedback_id?: number | string | null;
    },
    secret: Buffer
  ): { record: StoredChangeSetRecord; approvalToken: string } {
    const rawToken = crypto.randomBytes(32).toString("base64url");
    const now = new Date().toISOString();
    const record: StoredChangeSetRecord = {
      id: this.state.nextChangeSetId++,
      status: "draft",
      page_url: input.page_url,
      summary: input.summary,
      branch_name: null,
      pr_url: null,
      preview_url: null,
      feedback_id: input.feedback_id ?? null,
      patches: input.patches,
      approval_token_digest: digestChangeSetApprovalToken(rawToken, secret),
      session_id: input.session_id,
      submitter: input.submitter,
      created_at: now,
      updated_at: now
    };
    this.state.changeSets.push(record);
    this.flushToDisk();
    return { record, approvalToken: rawToken };
  }

  public getChangeSet(id: number | string): StoredChangeSetRecord | null {
    const target = Number(id);
    if (!Number.isFinite(target)) return null;
    return this.state.changeSets.find((c) => c.id === target) ?? null;
  }

  public updateChangeSet(
    id: number,
    patch: Partial<
      Pick<
        StoredChangeSetRecord,
        "status" | "page_url" | "summary" | "branch_name" | "pr_url" | "preview_url" | "patches"
      >
    >
  ): StoredChangeSetRecord | null {
    const rec = this.getChangeSet(id);
    if (!rec) return null;
    Object.assign(rec, patch, { updated_at: new Date().toISOString() });
    this.flushToDisk();
    return rec;
  }

  public approveChangeSet(id: number, rawToken: string, secret: Buffer): StoredChangeSetRecord {
    const rec = this.getChangeSet(id);
    if (!rec) throw new Error("Change set not found");
    const trimmed = rawToken.trim();
    if (!trimmed) throw new Error("approval_token is required");
    const expected = digestChangeSetApprovalToken(trimmed, secret);
    if (!timingSafeHexEqual(expected, rec.approval_token_digest)) {
      throw new Error("Invalid approval token");
    }
    rec.status = "approved";
    rec.updated_at = new Date().toISOString();
    this.flushToDisk();
    return rec;
  }

  public appendTurnAudit(
    entry: Omit<AssistantTurnAuditRecord, "id" | "created_at">
  ): AssistantTurnAuditRecord {
    const row: AssistantTurnAuditRecord = {
      id: this.state.nextTurnId++,
      ...entry,
      created_at: new Date().toISOString()
    };
    this.state.turns.push(row);
    if (this.state.turns.length > 500) {
      this.state.turns.splice(0, this.state.turns.length - 500);
    }
    this.flushToDisk();
    return row;
  }

  public listTurns(): AssistantTurnAuditRecord[] {
    return [...this.state.turns];
  }
}
