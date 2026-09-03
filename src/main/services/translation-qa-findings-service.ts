import type { DatabaseManager } from '../db/database-manager';
import {
  hashSourceText,
  type TranslationQaFindingRow,
} from '../db/repositories/translation-qa-findings-repository';
import type { QaIssue, QaResult } from '@shared/schemas/output-protocol';
import type { TranslationQaFindingDto } from '@shared/schemas/translation-qa-findings';
import type { TranslationQaSuggestedAction } from '@shared/constants/translation-qa-findings';
import {
  computeQaScoreBreakdown,
  findingDismissKey,
  filterDismissedIssues,
  runLocalQaWithPolicy,
} from '../jobs/qa-policy';

function suggestedActionFor(
  issue: QaIssue,
  humanLocked: boolean,
): TranslationQaSuggestedAction {
  if (humanLocked) return 'attention_inbox';
  if (
    issue.code === 'missing_paragraph' ||
    issue.code === 'empty_translation' ||
    issue.code === 'corrupt_translation' ||
    issue.code === 'locked_term_missing' ||
    issue.code === 'locked_term_forbidden_variant' ||
    issue.code === 'length_anomaly' ||
    issue.code === 'repeated_content'
  ) {
    return 'targeted_repair';
  }
  if (
    issue.code === 'unverifiable_content' ||
    issue.code === 'character_consistency' ||
    issue.code === 'unknown_paragraph' ||
    issue.code === 'extra_paragraph'
  ) {
    return 'manual_edit';
  }
  return 'dismiss_ok';
}

function toDto(row: TranslationQaFindingRow): TranslationQaFindingDto {
  return {
    id: row.id,
    projectId: row.project_id,
    editionId: row.edition_id,
    stableParagraphId: row.stable_paragraph_id,
    paragraphUuid: row.paragraph_uuid,
    jobId: row.job_id,
    campaignId: row.campaign_id,
    code: row.code as TranslationQaFindingDto['code'],
    severity: row.severity,
    message: row.message,
    sourceRange: row.source_range_json
      ? (JSON.parse(row.source_range_json) as TranslationQaFindingDto['sourceRange'])
      : null,
    targetRange: row.target_range_json
      ? (JSON.parse(row.target_range_json) as TranslationQaFindingDto['targetRange'])
      : null,
    evidence: row.evidence_json
      ? (JSON.parse(row.evidence_json) as Record<string, unknown>)
      : null,
    suggestedAction: row.suggested_action,
    termSource: row.term_source,
    expected: row.expected_text,
    found: row.found_text,
    status: row.status,
    fingerprint: row.fingerprint,
    sourceHash: row.source_hash,
    dismissedReason: row.dismissed_reason,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    dismissedAt: row.dismissed_at,
    resolvedAt: row.resolved_at,
  };
}

export class TranslationQaFindingsService {
  constructor(private readonly db: DatabaseManager) {}

  /**
   * Persist structured findings from a QaResult.
   * human_locked paragraphs → ATTENTION (never auto-repair target).
   */
  upsertFromQaResult(input: {
    projectId: string;
    editionId?: string | null;
    jobId?: string | null;
    campaignId?: string | null;
    qa: QaResult;
    sourceByParagraphId?: Map<string, string>;
    humanLockedIds?: Set<string>;
  }): { upserted: number; attention: number } {
    const issues = [...input.qa.errors, ...input.qa.warnings];
    let upserted = 0;
    let attention = 0;
    const locked = input.humanLockedIds ?? new Set<string>();

    for (const issue of issues) {
      const pid = issue.paragraphId ?? null;
      const isLocked = pid != null && locked.has(pid);
      const sourceText = pid
        ? input.sourceByParagraphId?.get(pid)
        : undefined;
      const action = suggestedActionFor(issue, isLocked);
      const status = isLocked || action === 'attention_inbox' ? 'ATTENTION' : 'OPEN';
      if (status === 'ATTENTION') attention += 1;

      this.db.translationQaFindings.upsertOpen({
        projectId: input.projectId,
        editionId: input.editionId,
        stableParagraphId: pid,
        jobId: input.jobId,
        campaignId: input.campaignId,
        code: issue.code,
        severity: issue.severity,
        message: issue.message,
        sourceRangeJson: pid
          ? JSON.stringify({
              paragraphId: pid,
              excerpt: sourceText?.slice(0, 120),
            })
          : null,
        targetRangeJson: pid
          ? JSON.stringify({
              paragraphId: pid,
              excerpt: issue.found?.slice(0, 120),
            })
          : null,
        evidenceJson: JSON.stringify({
          expected: issue.expected ?? null,
          found: issue.found ?? null,
          termSource: issue.termSource ?? null,
        }),
        suggestedAction: action,
        termSource: issue.termSource ?? null,
        expected: issue.expected ?? null,
        found: issue.found ?? null,
        sourceHash: hashSourceText(sourceText),
        status,
      });
      upserted += 1;
    }

    // Escalate critical findings into Attention Inbox (deduped).
    const critical = issues.filter(
      (i) =>
        i.severity === 'error' &&
        (i.code === 'empty_translation' ||
          i.code === 'corrupt_translation' ||
          i.code === 'glossary_human_locked_conflict' ||
          i.code === 'character_name_mismatch' ||
          i.code === 'chapter_missing_translation'),
    );
    if (critical.length > 0) {
      try {
        const { getAttentionInboxService } =
          require('./attention-inbox-service') as typeof import('./attention-inbox-service');
        getAttentionInboxService(this.db).upsertFromQaCritical({
          projectId: input.projectId,
          campaignId: input.campaignId,
          message: `${critical.length} critical QA finding(s)`,
          paragraphId: critical[0]?.paragraphId,
        });
      } catch {
        // optional
      }
    }

    return { upserted, attention };
  }

  /** Keys for filterDismissedIssues — only when source_hash still matches. */
  dismissedKeySet(projectId: string): Set<string> {
    const rows = this.db.translationQaFindings.listDismissedKeys(projectId);
    const keys = new Set<string>();
    for (const row of rows) {
      keys.add(
        findingDismissKey(row.code, row.stable_paragraph_id, row.term_source),
      );
    }
    return keys;
  }

  applyDismissFilter(projectId: string, qa: QaResult): QaResult {
    return filterDismissedIssues(qa, this.dismissedKeySet(projectId));
  }

  dismiss(findingId: string, reason?: string): TranslationQaFindingDto | null {
    const row = this.db.translationQaFindings.dismiss(findingId, reason);
    return row ? toDto(row) : null;
  }

  list(
    projectId: string,
    opts?: { status?: TranslationQaFindingDto['status']; limit?: number },
  ): TranslationQaFindingDto[] {
    return this.db.translationQaFindings
      .listByProject(projectId, opts)
      .map(toDto);
  }

  resolveMatching(projectId: string, qa: QaResult): number {
    // On PASS, resolve previously open issues for paragraphs that no longer fail
    const stillBad = new Set(
      [...qa.errors, ...qa.warnings]
        .map((i) => `${i.code}|${i.paragraphId ?? ''}`)
        .filter(Boolean),
    );
    const open = this.db.translationQaFindings.listByProject(projectId, {
      status: 'OPEN',
      limit: 500,
    });
    const attention = this.db.translationQaFindings.listByProject(projectId, {
      status: 'ATTENTION',
      limit: 500,
    });
    const toResolve: { code: string; paragraphId?: string | null }[] = [];
    for (const row of [...open, ...attention]) {
      const key = `${row.code}|${row.stable_paragraph_id ?? ''}`;
      if (!stillBad.has(key) && qa.passed) {
        toResolve.push({
          code: row.code,
          paragraphId: row.stable_paragraph_id,
        });
      }
    }
    return this.db.translationQaFindings.markResolved(projectId, toResolve);
  }

  scoreFor(qa: QaResult) {
    return computeQaScoreBreakdown(qa);
  }

  /** Scan persisted chapter translations vs source (campaign QA_REPAIR). */
  scanProjectPersisted(input: {
    projectId: string;
    qaLevel?: 'basic' | 'standard' | 'strict';
    campaignId?: string | null;
  }): {
    qa: QaResult;
    upserted: number;
    attention: number;
    openCount: number;
    score: ReturnType<typeof computeQaScoreBreakdown>;
  } {
    const project = this.db.projects.getById(input.projectId);
    if (!project) throw new Error(`Project not found: ${input.projectId}`);
    const editionId = project.active_edition_id;
    const chapters = this.db.chapters.listByProject(input.projectId);
    const sourceParagraphs: { paragraphId: string; sourceText: string }[] = [];
    const translations: { paragraphId: string; text: string }[] = [];
    const humanLocked = new Set<string>();
    const sourceById = new Map<string, string>();

    for (const ch of chapters) {
      for (const para of this.db.paragraphs.listByChapter(ch.id)) {
        const sid = para.paragraph_id;
        sourceParagraphs.push({
          paragraphId: sid,
          sourceText: para.source_text ?? '',
        });
        sourceById.set(sid, para.source_text ?? '');
        const tr = this.db.translations.getByParagraphId(para.id, editionId);
        if (tr?.human_locked === 1) humanLocked.add(sid);
        translations.push({
          paragraphId: sid,
          text: tr?.translated_text ?? '',
        });
      }
    }

    const parsed = {
      status: 'ok' as const,
      translations,
      termDeltas: [],
      memoryDeltas: [],
      warnings: [],
      recoveryUsed: false,
      protocolVersion: null,
    };

    let qa = runLocalQaWithPolicy({
      parsed,
      sourceParagraphIds: sourceParagraphs.map((p) => p.paragraphId),
      sourceParagraphs,
      sourceLanguage: project.source_language ?? undefined,
      targetLanguage: project.target_language ?? undefined,
      qaLevel: input.qaLevel ?? 'standard',
    });
    qa = this.applyDismissFilter(input.projectId, qa);

    const { upserted, attention } = this.upsertFromQaResult({
      projectId: input.projectId,
      editionId,
      campaignId: input.campaignId,
      qa,
      sourceByParagraphId: sourceById,
      humanLockedIds: humanLocked,
    });
    if (qa.passed) {
      this.resolveMatching(input.projectId, qa);
    }

    return {
      qa,
      upserted,
      attention,
      openCount: this.db.translationQaFindings.countOpen(input.projectId),
      score: this.scoreFor(qa),
    };
  }
}

export function getTranslationQaFindingsService(
  db: DatabaseManager,
): TranslationQaFindingsService {
  return new TranslationQaFindingsService(db);
}
