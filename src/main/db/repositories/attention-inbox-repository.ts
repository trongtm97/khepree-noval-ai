import type Database from 'better-sqlite3';
import { BaseRepository } from './base-repository';
import { newId } from '../utils/uuid';
import { utcNow } from '../utils/timestamps';
import type {
  AttentionInboxPrimaryAction,
  AttentionInboxSeverity,
  AttentionInboxStatus,
  AttentionInboxType,
} from '@shared/constants/attention-inbox';

export interface AttentionInboxItemRow {
  id: string;
  type: string;
  status: string;
  severity: string;
  title_en: string;
  title_vi: string;
  description_en: string;
  description_vi: string;
  cause_code: string | null;
  primary_action: string;
  secondary_actions_json: string | null;
  campaign_id: string | null;
  project_id: string | null;
  chapter_id: string | null;
  job_id: string | null;
  account_id: string | null;
  account_kind: string | null;
  affected_scope_json: string | null;
  dedupe_key: string;
  tech_detail: string | null;
  snoozed_until: string | null;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
}

export interface AttentionAffectedScope {
  jobIds: string[];
  projectIds: string[];
  chapterIds: string[];
}

export interface UpsertAttentionInboxInput {
  type: AttentionInboxType;
  severity: AttentionInboxSeverity;
  titleEn: string;
  titleVi: string;
  descriptionEn: string;
  descriptionVi: string;
  causeCode?: string | null;
  primaryAction: AttentionInboxPrimaryAction;
  secondaryActions?: AttentionInboxPrimaryAction[];
  campaignId?: string | null;
  projectId?: string | null;
  chapterId?: string | null;
  jobId?: string | null;
  accountId?: string | null;
  accountKind?: string | null;
  affectedScope?: AttentionAffectedScope;
  dedupeKey: string;
  techDetail?: string | null;
}

function mergeScope(
  a: AttentionAffectedScope | null,
  b: AttentionAffectedScope | null,
): AttentionAffectedScope {
  const jobIds = new Set([...(a?.jobIds ?? []), ...(b?.jobIds ?? [])]);
  const projectIds = new Set([...(a?.projectIds ?? []), ...(b?.projectIds ?? [])]);
  const chapterIds = new Set([...(a?.chapterIds ?? []), ...(b?.chapterIds ?? [])]);
  return {
    jobIds: [...jobIds].slice(0, 50),
    projectIds: [...projectIds].slice(0, 20),
    chapterIds: [...chapterIds].slice(0, 50),
  };
}

export function parseAffectedScope(
  raw: string | null,
): AttentionAffectedScope {
  if (!raw) return { jobIds: [], projectIds: [], chapterIds: [] };
  try {
    const parsed = JSON.parse(raw) as AttentionAffectedScope;
    return {
      jobIds: parsed.jobIds ?? [],
      projectIds: parsed.projectIds ?? [],
      chapterIds: parsed.chapterIds ?? [],
    };
  } catch {
    return { jobIds: [], projectIds: [], chapterIds: [] };
  }
}

export class AttentionInboxRepository extends BaseRepository {
  upsertOpen(input: UpsertAttentionInboxInput): AttentionInboxItemRow {
    const existing = this.findOpenOrSnoozedByDedupe(input.dedupeKey);
    const now = utcNow();
    const scope = mergeScope(
      existing ? parseAffectedScope(existing.affected_scope_json) : null,
      input.affectedScope ??
        (input.jobId || input.projectId || input.chapterId
          ? {
              jobIds: input.jobId ? [input.jobId] : [],
              projectIds: input.projectId ? [input.projectId] : [],
              chapterIds: input.chapterId ? [input.chapterId] : [],
            }
          : null),
    );

    if (existing) {
      // Reopen if was snoozed past due, or stay OPEN; if RESOLVED elsewhere use new insert path via unique
      const reopen =
        existing.status === 'SNOOZED' || existing.status === 'OPEN'
          ? 'OPEN'
          : 'OPEN';
      this.db
        .prepare(
          `UPDATE attention_inbox_items SET
            status = ?,
            severity = ?,
            title_en = ?,
            title_vi = ?,
            description_en = ?,
            description_vi = ?,
            cause_code = ?,
            primary_action = ?,
            secondary_actions_json = ?,
            campaign_id = COALESCE(?, campaign_id),
            project_id = COALESCE(?, project_id),
            chapter_id = COALESCE(?, chapter_id),
            job_id = COALESCE(?, job_id),
            account_id = COALESCE(?, account_id),
            account_kind = COALESCE(?, account_kind),
            affected_scope_json = ?,
            tech_detail = ?,
            snoozed_until = NULL,
            resolved_at = NULL,
            updated_at = ?
           WHERE id = ?`,
        )
        .run(
          reopen,
          input.severity,
          input.titleEn,
          input.titleVi,
          input.descriptionEn,
          input.descriptionVi,
          input.causeCode ?? existing.cause_code,
          input.primaryAction,
          JSON.stringify(input.secondaryActions ?? []),
          input.campaignId ?? null,
          input.projectId ?? null,
          input.chapterId ?? null,
          input.jobId ?? null,
          input.accountId ?? null,
          input.accountKind ?? null,
          JSON.stringify(scope),
          sanitizeTechDetail(input.techDetail) ?? existing.tech_detail,
          now,
          existing.id,
        );
      return this.getById(existing.id)!;
    }

    // Reopen previously resolved/dismissed with same key → new OPEN row (unique allows)
    const id = newId();
    this.db
      .prepare(
        `INSERT INTO attention_inbox_items (
          id, type, status, severity, title_en, title_vi, description_en, description_vi,
          cause_code, primary_action, secondary_actions_json,
          campaign_id, project_id, chapter_id, job_id, account_id, account_kind,
          affected_scope_json, dedupe_key, tech_detail, snoozed_until,
          created_at, updated_at, resolved_at
        ) VALUES (?, ?, 'OPEN', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, NULL)`,
      )
      .run(
        id,
        input.type,
        input.severity,
        input.titleEn,
        input.titleVi,
        input.descriptionEn,
        input.descriptionVi,
        input.causeCode ?? null,
        input.primaryAction,
        JSON.stringify(input.secondaryActions ?? []),
        input.campaignId ?? null,
        input.projectId ?? null,
        input.chapterId ?? null,
        input.jobId ?? null,
        input.accountId ?? null,
        input.accountKind ?? null,
        JSON.stringify(scope),
        input.dedupeKey,
        sanitizeTechDetail(input.techDetail),
        now,
        now,
      );
    return this.getById(id)!;
  }

  findOpenOrSnoozedByDedupe(dedupeKey: string): AttentionInboxItemRow | null {
    return (
      (this.db
        .prepare(
          `SELECT * FROM attention_inbox_items
           WHERE dedupe_key = ? AND status IN ('OPEN', 'SNOOZED')
           LIMIT 1`,
        )
        .get(dedupeKey) as AttentionInboxItemRow | undefined) ?? null
    );
  }

  getById(id: string): AttentionInboxItemRow | null {
    return (
      (this.db
        .prepare(`SELECT * FROM attention_inbox_items WHERE id = ?`)
        .get(id) as AttentionInboxItemRow | undefined) ?? null
    );
  }

  listOpen(limit = 100): AttentionInboxItemRow[] {
    this.unsnoozeExpired();
    return this.db
      .prepare(
        `SELECT * FROM attention_inbox_items
         WHERE status = 'OPEN'
         ORDER BY
           CASE severity
             WHEN 'critical' THEN 0
             WHEN 'high' THEN 1
             WHEN 'medium' THEN 2
             ELSE 3
           END,
           updated_at DESC
         LIMIT ?`,
      )
      .all(limit) as AttentionInboxItemRow[];
  }

  countOpen(): number {
    this.unsnoozeExpired();
    const row = this.db
      .prepare(
        `SELECT COUNT(*) AS c FROM attention_inbox_items WHERE status = 'OPEN'`,
      )
      .get() as { c: number };
    return row?.c ?? 0;
  }

  unsnoozeExpired(): number {
    const now = utcNow();
    const result = this.db
      .prepare(
        `UPDATE attention_inbox_items SET
          status = 'OPEN',
          snoozed_until = NULL,
          updated_at = ?
         WHERE status = 'SNOOZED'
           AND snoozed_until IS NOT NULL
           AND snoozed_until <= ?`,
      )
      .run(now, now);
    return result.changes;
  }

  setStatus(
    id: string,
    status: AttentionInboxStatus,
    opts?: { snoozedUntil?: string | null },
  ): AttentionInboxItemRow | null {
    const existing = this.getById(id);
    if (!existing) return null;
    const now = utcNow();
    this.db
      .prepare(
        `UPDATE attention_inbox_items SET
          status = ?,
          snoozed_until = ?,
          resolved_at = ?,
          updated_at = ?
         WHERE id = ?`,
      )
      .run(
        status,
        status === 'SNOOZED' ? (opts?.snoozedUntil ?? null) : null,
        status === 'RESOLVED' || status === 'DISMISSED' ? now : null,
        now,
        id,
      );
    return this.getById(id);
  }

  resolveByDedupeKey(dedupeKey: string, reason?: string): number {
    const now = utcNow();
    const result = this.db
      .prepare(
        `UPDATE attention_inbox_items SET
          status = 'RESOLVED',
          resolved_at = ?,
          updated_at = ?,
          tech_detail = CASE
            WHEN ? IS NOT NULL AND length(?) > 0
              THEN substr(COALESCE(tech_detail, '') || ' | auto-resolved: ' || ?, 1, 2000)
            ELSE tech_detail
          END
         WHERE dedupe_key = ? AND status IN ('OPEN', 'SNOOZED')`,
      )
      .run(now, now, reason ?? null, reason ?? null, reason ?? '', dedupeKey);
    return result.changes;
  }

  listRetryableOpen(limit = 100): AttentionInboxItemRow[] {
    return this.db
      .prepare(
        `SELECT * FROM attention_inbox_items
         WHERE status = 'OPEN'
           AND type NOT IN ('LOGIN_REQUIRED', 'CAPTCHA_REQUIRED', 'LICENSE_REQUIRED')
           AND primary_action IN ('RETRY', 'VIEW_ERROR', 'SWITCH_PROVIDER', 'SKIP')
         ORDER BY updated_at ASC
         LIMIT ?`,
      )
      .all(limit) as AttentionInboxItemRow[];
  }
}

/** Strip secrets / stacks from tech detail for default UI. */
export function sanitizeTechDetail(
  raw: string | null | undefined,
): string | null {
  if (!raw) return null;
  let s = raw.slice(0, 1500);
  s = s.replace(/\bBearer\s+\S+/gi, 'Bearer=[redacted]');
  s = s.replace(
    /(cookie|authorization|api[_-]?key|token|password|secret)\s*[:=]\s*\S+/gi,
    '$1=[redacted]',
  );
  s = s.replace(/-----BEGIN[\s\S]+?-----END[^-]+-----/g, '[redacted-pem]');
  // Drop long stack frames
  s = s
    .split('\n')
    .filter((line) => !/^\s+at\s+/.test(line))
    .join('\n');
  // Drop full prompt dumps
  if (/SYSTEM:|USER:|<TRANSLATION>/i.test(s) && s.length > 400) {
    s = s.slice(0, 200) + '…[prompt redacted]';
  }
  return s.trim() || null;
}

export function createAttentionInboxRepository(
  db: Database.Database,
): AttentionInboxRepository {
  return new AttentionInboxRepository(db);
}
