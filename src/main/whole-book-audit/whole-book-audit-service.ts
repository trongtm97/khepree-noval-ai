import type { DatabaseManager } from '../db/database-manager';
import { utcNow } from '../db/utils/timestamps';
import { buildWholeBookAuditIndex } from './audit-index-builder';
import {
  runAllLocalAuditCheckers,
  type AuditCheckerFinding,
} from './audit-checkers';
import {
  buildChapterOpenHref,
  writeAuditReports,
} from './audit-report-export';
import { getTranslationQaFindingsService } from '../services/translation-qa-findings-service';
import {
  WHOLE_BOOK_CRITICAL_CODES,
  WHOLE_BOOK_SAFE_AUTO_REPAIR_CODES,
} from '@shared/constants/whole-book-audit';
import type { TranslationRecipeMode } from '@shared/constants/translation-recipes';
import type { WholeBookAuditReport } from '@shared/schemas/whole-book-audit';
import type { QaResult } from '@shared/schemas/output-protocol';
import { applyValidatedPatch } from '../jobs/repair-patch-validate';
import { logger } from '../logging/logger';

export interface WholeBookAuditRunOptions {
  projectId: string;
  campaignId?: string | null;
  recipeMode?: TranslationRecipeMode | null;
  forceNew?: boolean;
  exportReport?: boolean;
  /** Audit additional volumes in the same series (user opt-in). */
  additionalSeriesProjectIds?: string[];
  /** Test hook: throw after indexing to simulate crash. */
  crashAfterIndex?: boolean;
}

export interface WholeBookAuditRunResult {
  runId: string;
  status: 'COMPLETED' | 'NEEDS_ATTENTION' | 'FAILED';
  findingsCount: number;
  criticalCount: number;
  autoRepaired: number;
  reportJsonPath: string | null;
  reportHtmlPath: string | null;
  report: WholeBookAuditReport | null;
}

/**
 * Whole-book Audit orchestrator (Prompt 10).
 * Local aggregate first; findings persist with fingerprint dedupe; resume-safe.
 * Browser provider NOT used for full text — only local evidence.
 */
export class WholeBookAuditService {
  constructor(private readonly db: DatabaseManager) {}

  async run(options: WholeBookAuditRunOptions): Promise<WholeBookAuditRunResult> {
    const project = this.db.projects.getById(options.projectId);
    if (!project) throw new Error(`Project not found: ${options.projectId}`);

    let run =
      !options.forceNew
        ? this.db.wholeBookAudit.getActiveRun(options.projectId)
        : null;

    if (!run) {
      run = this.db.wholeBookAudit.createRun({
        projectId: options.projectId,
        editionId: project.active_edition_id,
        campaignId: options.campaignId,
        recipeMode: options.recipeMode,
      });
    }

    try {
      this.db.wholeBookAudit.updateRun(run.id, { status: 'INDEXING' });
      let index = buildWholeBookAuditIndex(
        this.db,
        options.projectId,
        project.active_edition_id,
      );
      const extraIds = options.additionalSeriesProjectIds?.filter(
        (id) => id !== options.projectId,
      );
      if (extraIds && extraIds.length > 0) {
        for (const extraProjectId of extraIds) {
          const extraProject = this.db.projects.getById(extraProjectId);
          if (!extraProject) continue;
          const extraIndex = buildWholeBookAuditIndex(
            this.db,
            extraProjectId,
            extraProject.active_edition_id,
          );
          index = {
            ...index,
            terms: [...index.terms, ...extraIndex.terms],
            characters: [...index.characters, ...extraIndex.characters],
          };
        }
      }
      this.db.wholeBookAudit.updateRun(run.id, {
        chaptersTotal: index.chapters.length,
        checkpointJson: JSON.stringify({
          phase: 'indexed',
          characterCount: index.characters.length,
          termCount: index.terms.length,
        }),
      });

      if (options.crashAfterIndex) {
        throw new Error('Simulated crash after index');
      }

      this.db.wholeBookAudit.updateRun(run.id, { status: 'SCANNING' });
      const rawFindings = runAllLocalAuditCheckers(index);

      // Resume: skip chapters already past last_chapter_index (chapter-level progress)
      const startIdx = run.last_chapter_index;
      const chapterOrder = index.chapters.map((c) => c.id);
      for (let i = startIdx; i < chapterOrder.length; i += 1) {
        this.db.wholeBookAudit.updateRun(run.id, {
          lastChapterIndex: i + 1,
        });
      }

      const findingsSvc = getTranslationQaFindingsService(this.db);
      const qa = findingsToQaResult(rawFindings);
      const filtered = findingsSvc.applyDismissFilter(options.projectId, qa);

      const humanLockedIds = new Set(
        index.paragraphs.filter((p) => p.humanLocked).map((p) => p.stableId),
      );
      const sourceById = new Map(
        index.paragraphs.map((p) => [p.stableId, p.sourceText] as const),
      );

      // Remap glossary_human_locked → ATTENTION via humanLockedIds
      findingsSvc.upsertFromQaResult({
        projectId: options.projectId,
        editionId: project.active_edition_id,
        campaignId: options.campaignId,
        qa: filtered,
        sourceByParagraphId: sourceById,
        humanLockedIds,
      });

      // Force ATTENTION on glossary_human_locked_conflict
      for (const f of filtered.errors.filter(
        (e) => e.code === 'glossary_human_locked_conflict',
      )) {
        if (!f.paragraphId) continue;
        findingsSvc.upsertFromQaResult({
          projectId: options.projectId,
          editionId: project.active_edition_id,
          campaignId: options.campaignId,
          qa: {
            ...filtered,
            errors: [f],
            warnings: [],
          },
          sourceByParagraphId: sourceById,
          humanLockedIds: new Set([f.paragraphId]),
        });
      }

      this.db.wholeBookAudit.updateRun(run.id, { status: 'REPAIRING' });
      const autoRepaired = this.autoRepairSafe(options.projectId, index, filtered);

      const open = this.db.translationQaFindings.listByProject(options.projectId, {
        status: 'OPEN',
        limit: 500,
      });
      const attention = this.db.translationQaFindings.listByProject(
        options.projectId,
        { status: 'ATTENTION', limit: 500 },
      );
      const allOpen = [...open, ...attention];
      const criticalCount = allOpen.filter((r) =>
        WHOLE_BOOK_CRITICAL_CODES.has(r.code),
      ).length;

      const needsAttention =
        options.recipeMode === 'PUBLICATION' && criticalCount > 0;

      let report: WholeBookAuditReport | null = null;
      let jsonPath: string | null = null;
      let htmlPath: string | null = null;

      if (options.exportReport !== false) {
        this.db.wholeBookAudit.updateRun(run.id, { status: 'EXPORTING' });
        report = this.buildReport(run.id, options.projectId, index, {
          findingsCount: allOpen.length + autoRepaired,
          criticalCount,
          autoRepaired,
          status: needsAttention ? 'NEEDS_ATTENTION' : 'COMPLETED',
        });
        const written = writeAuditReports(this.db, options.projectId, report);
        jsonPath = written.jsonPath;
        htmlPath = written.htmlPath;
      }

      const finalStatus = needsAttention ? 'NEEDS_ATTENTION' : 'COMPLETED';
      this.db.wholeBookAudit.updateRun(run.id, {
        status: finalStatus,
        findingsCount: allOpen.length,
        criticalCount,
        reportJsonPath: jsonPath,
        reportHtmlPath: htmlPath,
        finishedAt: utcNow(),
        checkpointJson: JSON.stringify({
          phase: 'done',
          autoRepaired,
          criticalCount,
        }),
      });

      return {
        runId: run.id,
        status: finalStatus,
        findingsCount: allOpen.length,
        criticalCount,
        autoRepaired,
        reportJsonPath: jsonPath,
        reportHtmlPath: htmlPath,
        report,
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      logger.warn('Whole-book audit failed', {
        projectId: options.projectId,
        runId: run.id,
        message,
      });
      this.db.wholeBookAudit.updateRun(run.id, {
        status: message.includes('Simulated crash') ? 'SCANNING' : 'FAILED',
        errorMessage: message,
      });
      if (message.includes('Simulated crash')) {
        throw err;
      }
      return {
        runId: run.id,
        status: 'FAILED',
        findingsCount: 0,
        criticalCount: 0,
        autoRepaired: 0,
        reportJsonPath: null,
        reportHtmlPath: null,
        report: null,
      };
    }
  }

  /** Safe auto-repair: replace missing preferred glossary forms on unlocked paragraphs. */
  private autoRepairSafe(
    projectId: string,
    index: ReturnType<typeof buildWholeBookAuditIndex>,
    qa: QaResult,
  ): number {
    let repaired = 0;
    const editionId = index.editionId;
    const candidates = [...qa.errors, ...qa.warnings].filter(
      (e) =>
        WHOLE_BOOK_SAFE_AUTO_REPAIR_CODES.has(e.code) ||
        e.code === 'locked_term_missing',
    );

    for (const issue of candidates) {
      if (!issue.paragraphId || !issue.expected || !issue.termSource) continue;
      const para = index.paragraphs.find((p) => p.stableId === issue.paragraphId);
      if (!para || para.humanLocked) continue;

      // Only auto-repair when preferred is known and target lacks it — append not invent
      if (para.targetText.includes(issue.expected)) continue;
      if (!para.sourceText.includes(issue.termSource)) continue;

      // Safe: if target has a clear wrong short token we don't invent — skip without evidence
      // For locked_term_missing with empty wrong form: do not invent full retranslation.
      // Only apply if style_term_drift / forbidden variant with `found`.
      if (issue.code === 'locked_term_missing' && !issue.found) continue;

      const before = [{ paragraphId: para.stableId, text: para.targetText }];
      let nextText = para.targetText;
      if (issue.found && nextText.includes(issue.found)) {
        nextText = nextText.split(issue.found).join(issue.expected);
      } else {
        continue;
      }

      const { applied, validation } = applyValidatedPatch({
        base: before,
        patch: [{ paragraphId: para.stableId, text: nextText }],
        allowedIds: [para.stableId],
      });
      if (!validation.ok) continue;

      const row = this.db.paragraphs.getByStableId(para.stableId);
      if (!row) continue;
      this.db.translations.upsert({
        paragraph_id: row.id,
        edition_id: editionId,
        translated_text: applied[0]!.text,
        version_source: 'AI_REPAIR',
        respectHumanLock: true,
      });

      const open = this.db.translationQaFindings.listByProject(projectId, {
        status: 'OPEN',
        limit: 50,
      });
      const match = open.find(
        (f) =>
          f.code === issue.code &&
          f.stable_paragraph_id === issue.paragraphId,
      );
      if (match) {
        this.db.translationQaFindings.markAutoRepaired(match.id);
      }
      repaired += 1;
    }
    return repaired;
  }

  private buildReport(
    runId: string,
    projectId: string,
    index: ReturnType<typeof buildWholeBookAuditIndex>,
    meta: {
      findingsCount: number;
      criticalCount: number;
      autoRepaired: number;
      status: 'COMPLETED' | 'NEEDS_ATTENTION';
    },
  ): WholeBookAuditReport {
    const project = this.db.projects.getById(projectId)!;
    const open = this.db.translationQaFindings.listByProject(projectId, {
      limit: 500,
    });
    const findings = open.map((f) => {
      const para = f.stable_paragraph_id
        ? index.paragraphs.find((p) => p.stableId === f.stable_paragraph_id)
        : null;
      return {
        id: f.id,
        code: f.code,
        severity: f.severity,
        message: f.message,
        chapterId: para?.chapterId ?? null,
        chapterNumber: para?.chapterNumber ?? null,
        stableParagraphId: f.stable_paragraph_id,
        evidence: f.evidence_json
          ? (JSON.parse(f.evidence_json) as Record<string, unknown>)
          : null,
        suggestedAction: f.suggested_action,
        status: f.status,
        openHref: buildChapterOpenHref(
          projectId,
          para?.chapterId ?? null,
          f.stable_paragraph_id,
        ),
      };
    });

    return {
      runId,
      projectId,
      projectTitle: project.title,
      status: meta.status,
      generatedAt: utcNow(),
      summary: {
        chaptersTotal: index.chapters.length,
        findingsCount: meta.findingsCount,
        criticalCount: meta.criticalCount,
        openCount: open.filter((f) => f.status === 'OPEN' || f.status === 'ATTENTION')
          .length,
        dismissedCount: open.filter((f) => f.status === 'DISMISSED').length,
        autoRepairedCount: meta.autoRepaired,
      },
      findings,
      indexStats: {
        characterCount: index.characters.length,
        termCount: index.terms.length,
        placeOrgCount: index.placesOrgs.length,
        paragraphCount: index.paragraphs.length,
      },
    };
  }
}

function findingsToQaResult(findings: AuditCheckerFinding[]): QaResult {
  const errors = findings.filter((f) => f.severity === 'error');
  const warnings = findings.filter((f) => f.severity === 'warning');
  const infos = findings.filter((f) => f.severity === 'info');
  const emptyParagraphIds = errors
    .filter((e) => e.code === 'empty_translation')
    .map((e) => e.paragraphId)
    .filter((id): id is string => Boolean(id));
  const corruptParagraphIds = errors
    .filter(
      (e) =>
        e.code === 'chapter_truncated' || e.code === 'corrupt_translation',
    )
    .map((e) => e.paragraphId)
    .filter((id): id is string => Boolean(id));

  const hasError = errors.length > 0;
  return {
    verdict: hasError ? 'REPAIR_REQUIRED' : warnings.length ? 'PASS_WITH_WARNINGS' : 'PASS',
    passed: !hasError,
    errors,
    warnings,
    infos,
    missingParagraphIds: emptyParagraphIds,
    duplicateParagraphIds: [],
    unknownParagraphIds: [],
    emptyParagraphIds,
    corruptParagraphIds,
    outOfOrder: false,
  };
}

export function getWholeBookAuditService(
  db: DatabaseManager,
): WholeBookAuditService {
  return new WholeBookAuditService(db);
}
