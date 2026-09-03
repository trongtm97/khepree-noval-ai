import type Database from 'better-sqlite3';
import { createHash } from 'node:crypto';
import { BaseRepository } from './base-repository';
import { newId } from '../utils/uuid';
import { touchTimestamps, utcNow } from '../utils/timestamps';
import type {
  TranslationQaFindingSeverity,
  TranslationQaFindingStatus,
  TranslationQaSuggestedAction,
} from '@shared/constants/translation-qa-findings';

export interface TranslationQaFindingRow {
  id: string;
  project_id: string;
  edition_id: string | null;
  stable_paragraph_id: string | null;
  paragraph_uuid: string | null;
  job_id: string | null;
  campaign_id: string | null;
  code: string;
  severity: TranslationQaFindingSeverity;
  message: string;
  source_range_json: string | null;
  target_range_json: string | null;
  evidence_json: string | null;
  suggested_action: TranslationQaSuggestedAction;
  term_source: string | null;
  expected_text: string | null;
  found_text: string | null;
  status: TranslationQaFindingStatus;
  fingerprint: string;
  source_hash: string | null;
  dismissed_reason: string | null;
  created_at: string;
  updated_at: string;
  dismissed_at: string | null;
  resolved_at: string | null;
}

export function buildFindingFingerprint(input: {
  code: string;
  stableParagraphId?: string | null;
  termSource?: string | null;
  sourceHash?: string | null;
}): string {
  const raw = [
    input.code,
    input.stableParagraphId ?? '',
    input.termSource ?? '',
    input.sourceHash ?? '',
  ].join('|');
  return createHash('sha256').update(raw).digest('hex').slice(0, 32);
}

export function hashSourceText(text: string | null | undefined): string {
  return createHash('sha256')
    .update(text ?? '')
    .digest('hex')
    .slice(0, 16);
}

export class TranslationQaFindingsRepository extends BaseRepository {
  upsertOpen(input: {
    projectId: string;
    editionId?: string | null;
    stableParagraphId?: string | null;
    paragraphUuid?: string | null;
    jobId?: string | null;
    campaignId?: string | null;
    code: string;
    severity: TranslationQaFindingSeverity;
    message: string;
    sourceRangeJson?: string | null;
    targetRangeJson?: string | null;
    evidenceJson?: string | null;
    suggestedAction: TranslationQaSuggestedAction;
    termSource?: string | null;
    expected?: string | null;
    found?: string | null;
    sourceHash?: string | null;
    status?: TranslationQaFindingStatus;
  }): TranslationQaFindingRow {
    const fingerprint = buildFindingFingerprint({
      code: input.code,
      stableParagraphId: input.stableParagraphId,
      termSource: input.termSource,
      sourceHash: input.sourceHash,
    });

    const existing = this.getByFingerprint(input.projectId, fingerprint);
    if (existing) {
      // Dismissed + same source hash → stay dismissed (false positive stays gone)
      if (
        existing.status === 'DISMISSED' &&
        existing.source_hash === (input.sourceHash ?? null)
      ) {
        return existing;
      }
      // Re-open if source changed after dismiss
      const status =
        existing.status === 'DISMISSED' &&
        existing.source_hash !== (input.sourceHash ?? null)
          ? (input.status ?? 'OPEN')
          : existing.status === 'RESOLVED' || existing.status === 'AUTO_REPAIRED'
            ? (input.status ?? 'OPEN')
            : existing.status === 'DISMISSED'
              ? 'DISMISSED'
              : (input.status ?? existing.status);

      this.db
        .prepare(
          `UPDATE translation_qa_findings SET
            message = ?, severity = ?, suggested_action = ?,
            evidence_json = ?, expected_text = ?, found_text = ?,
            job_id = COALESCE(?, job_id),
            status = ?,
            source_hash = ?,
            updated_at = ?,
            resolved_at = CASE WHEN ? IN ('OPEN','ATTENTION') THEN NULL ELSE resolved_at END
           WHERE id = ?`,
        )
        .run(
          input.message,
          input.severity,
          input.suggestedAction,
          input.evidenceJson ?? existing.evidence_json,
          input.expected ?? existing.expected_text,
          input.found ?? existing.found_text,
          input.jobId ?? null,
          status,
          input.sourceHash ?? existing.source_hash,
          utcNow(),
          status,
          existing.id,
        );
      return this.getById(existing.id)!;
    }

    const id = newId();
    const ts = touchTimestamps();
    this.db
      .prepare(
        `INSERT INTO translation_qa_findings (
          id, project_id, edition_id, stable_paragraph_id, paragraph_uuid,
          job_id, campaign_id, code, severity, message,
          source_range_json, target_range_json, evidence_json, suggested_action,
          term_source, expected_text, found_text, status, fingerprint, source_hash,
          dismissed_reason, created_at, updated_at, dismissed_at, resolved_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, NULL, NULL)`,
      )
      .run(
        id,
        input.projectId,
        input.editionId ?? null,
        input.stableParagraphId ?? null,
        input.paragraphUuid ?? null,
        input.jobId ?? null,
        input.campaignId ?? null,
        input.code,
        input.severity,
        input.message,
        input.sourceRangeJson ?? null,
        input.targetRangeJson ?? null,
        input.evidenceJson ?? null,
        input.suggestedAction,
        input.termSource ?? null,
        input.expected ?? null,
        input.found ?? null,
        input.status ?? 'OPEN',
        fingerprint,
        input.sourceHash ?? null,
        ts.created_at,
        ts.updated_at,
      );
    return this.assertRow(this.getById(id), 'translation_qa_finding', id);
  }

  getById(id: string): TranslationQaFindingRow | null {
    return (
      (this.db
        .prepare(`SELECT * FROM translation_qa_findings WHERE id = ?`)
        .get(id) as TranslationQaFindingRow | undefined) ?? null
    );
  }

  getByFingerprint(
    projectId: string,
    fingerprint: string,
  ): TranslationQaFindingRow | null {
    return (
      (this.db
        .prepare(
          `SELECT * FROM translation_qa_findings
           WHERE project_id = ? AND fingerprint = ?`,
        )
        .get(projectId, fingerprint) as TranslationQaFindingRow | undefined) ??
      null
    );
  }

  listByProject(
    projectId: string,
    opts?: { status?: TranslationQaFindingStatus; limit?: number },
  ): TranslationQaFindingRow[] {
    if (opts?.status) {
      return this.db
        .prepare(
          `SELECT * FROM translation_qa_findings
           WHERE project_id = ? AND status = ?
           ORDER BY updated_at DESC
           LIMIT ?`,
        )
        .all(projectId, opts.status, opts.limit ?? 100) as TranslationQaFindingRow[];
    }
    return this.db
      .prepare(
        `SELECT * FROM translation_qa_findings
         WHERE project_id = ?
         ORDER BY updated_at DESC
         LIMIT ?`,
      )
      .all(projectId, opts?.limit ?? 100) as TranslationQaFindingRow[];
  }

  listDismissedKeys(projectId: string): TranslationQaFindingRow[] {
    return this.db
      .prepare(
        `SELECT * FROM translation_qa_findings
         WHERE project_id = ? AND status = 'DISMISSED'`,
      )
      .all(projectId) as TranslationQaFindingRow[];
  }

  dismiss(id: string, reason?: string | null): TranslationQaFindingRow | null {
    const existing = this.getById(id);
    if (!existing) return null;
    const now = utcNow();
    this.db
      .prepare(
        `UPDATE translation_qa_findings SET
          status = 'DISMISSED',
          dismissed_reason = ?,
          dismissed_at = ?,
          updated_at = ?
         WHERE id = ?`,
      )
      .run(reason ?? null, now, now, id);
    return this.getById(id);
  }

  markResolved(
    projectId: string,
    codesAndParagraphs: { code: string; paragraphId?: string | null }[],
  ): number {
    let n = 0;
    const now = utcNow();
    for (const item of codesAndParagraphs) {
      const result = this.db
        .prepare(
          `UPDATE translation_qa_findings SET
            status = 'RESOLVED',
            resolved_at = ?,
            updated_at = ?
           WHERE project_id = ?
             AND code = ?
             AND IFNULL(stable_paragraph_id, '') = IFNULL(?, '')
             AND status IN ('OPEN', 'ATTENTION', 'AUTO_REPAIRED')`,
        )
        .run(now, now, projectId, item.code, item.paragraphId ?? null);
      n += result.changes;
    }
    return n;
  }

  markAutoRepaired(id: string): TranslationQaFindingRow | null {
    const existing = this.getById(id);
    if (!existing) return null;
    const now = utcNow();
    this.db
      .prepare(
        `UPDATE translation_qa_findings SET
          status = 'AUTO_REPAIRED',
          resolved_at = ?,
          updated_at = ?
         WHERE id = ?`,
      )
      .run(now, now, id);
    return this.getById(id);
  }

  countOpen(projectId: string): number {
    const row = this.db
      .prepare(
        `SELECT COUNT(*) AS c FROM translation_qa_findings
         WHERE project_id = ? AND status IN ('OPEN', 'ATTENTION')`,
      )
      .get(projectId) as { c: number };
    return row?.c ?? 0;
  }
}

export function createTranslationQaFindingsRepository(
  db: Database.Database,
): TranslationQaFindingsRepository {
  return new TranslationQaFindingsRepository(db);
}
