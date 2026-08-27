import { createHash } from 'node:crypto';
import type { DatabaseManager } from '../db/database-manager';
import { ResponseParser } from './response-parser';
import { runLocalQa, type LockedTermForQa, type SourceParagraphForQa } from './qa-checker';
import {
  buildRepairPlan,
  classifyRepairReason,
  type RepairParagraph,
} from './repair-strategies';
import type { ParsedBatchResult, QaResult } from '@shared/schemas/output-protocol';
import type { JobAttemptDto, RepairLoopResult, RepairPromptPlan } from '@shared/schemas/job';
import { DEFAULT_MAX_REPAIR_ATTEMPTS } from '@shared/constants/job';
import { newId } from '../db/utils/uuid';
import { runLearningPipeline } from '../learning/learning-pipeline';
import { persistParsedTranslations } from '../learning/translation-persistence';
import { logger } from '../logging/logger';
import {
  geminiSoftErrorSnippet,
  isGeminiSoftErrorText,
} from '@shared/utils/gemini-soft-error';
import {
  normalizeParsedTranslations,
  qaErrorsAreOnlyIdNoise,
} from './normalize-parsed-translations';
import {
  assessBatchCompleteness,
  mergeTranslationsByParagraphId,
  mergeRepairTranslations,
} from './continuation';
import { buildMergedTranslationProtocol } from './translate-chunking';
import {
  channelSnapshotForAttempt,
  readRepairChannelFromProgress,
  type RepairChannelContext,
} from './repair-channel-context';
import type { PackMode } from '@shared/constants/pack-mode';

export interface RepairSendRequest {
  jobId: string;
  attemptNumber: number;
  reason: string | null;
  plan: RepairPromptPlan | null;
  /** Full initial prompt when plan is null (first send). */
  initialPrompt?: string;
  /** Inherited from initial translation; sender must honor unless WebAPI failover. */
  channel?: RepairChannelContext;
}

export interface RepairSendResult {
  rawResponse: string;
  inputRef: string;
  /** Actual channel used for this send (after possible failover). */
  channel?: RepairChannelContext;
}

export type RepairSender = (request: RepairSendRequest) => Promise<RepairSendResult>;

export interface RepairLoopInput {
  jobId: string;
  projectId: string;
  batchParagraphs: RepairParagraph[];
  sourceParagraphIds: string[];
  initialRawResponse: string;
  initialInputRef: string;
  maxRepairAttempts?: number;
  lockedTerms?: LockedTermForQa[];
  /** Optional sender for repair rounds (mocked in tests). */
  sendRepair: RepairSender;
}

export interface RepairLoopDeps {
  db: DatabaseManager;
  parser?: ResponseParser;
}

/**
 * Automatic repair loop — finite attempts, no infinite retry.
 * Persists every attempt for crash recovery.
 */
export async function runRepairLoop(
  input: RepairLoopInput,
  deps: RepairLoopDeps,
): Promise<RepairLoopResult> {
  const parser = deps.parser ?? new ResponseParser();
  const maxAttempts = input.maxRepairAttempts ?? DEFAULT_MAX_REPAIR_ATTEMPTS;
  const sourceParagraphs: SourceParagraphForQa[] = input.batchParagraphs.map((p) => ({
    paragraphId: p.paragraphId,
    sourceText: p.sourceText,
  }));

  // Crash recovery: mark incomplete RUNNING attempts as CRASHED
  recoverCrashedAttempts(deps.db, input.jobId);

  let raw = input.initialRawResponse;
  let inputRef = input.initialInputRef;
  let repairRound = 0;
  let lastQa: QaResult | null = null;
  let lastParsed: ParsedBatchResult | null = null;
  let lastReason: string | null = null;

  deps.db.jobs.updateState(input.jobId, 'PARSING');
  persistProgress(deps.db, input.jobId, {
    phase: 'parsing',
    repairRound,
    maxRepairAttempts: maxAttempts,
  });

  for (;;) {
    const attemptNumber = nextAttemptNumber(deps.db, input.jobId);
    const attempt = deps.db.jobs.startAttempt({
      job_id: input.jobId,
      attempt_number: attemptNumber,
      reason: lastReason,
      input_ref: inputRef,
      state: 'RUNNING',
    });

    try {
      if (isGeminiSoftErrorText(raw)) {
        const snippet = geminiSoftErrorSnippet(raw);
        logger.warn('Repair loop got Gemini soft-error text', {
          jobId: input.jobId,
          snippet,
        });
        deps.db.jobs.completeAttempt(attempt.id, {
          state: 'FAILED',
          output: truncateOutput(raw),
          result: JSON.stringify({
            phase: 'provider_error',
            message: snippet,
            stop: 'gemini_soft_error',
          }),
          error: `PROVIDER_ERROR: ${snippet}`,
        });
        deps.db.jobs.markNeedsAttention(
          input.jobId,
          'PROVIDER_ERROR',
          `Gemini soft error: ${snippet}`,
        );
        persistProgress(deps.db, input.jobId, {
          phase: 'needs_attention',
          repairRound,
          providerError: snippet,
        });
        return {
          jobId: input.jobId,
          finalState: 'NEEDS_ATTENTION',
          repairRounds: repairRound,
          attempts: deps.db.jobs.listAttempts(input.jobId).map(toAttemptDto),
          qa: lastQa,
          parsed: lastParsed,
          message: `NEEDS_ATTENTION — Gemini soft error: ${snippet}`,
        };
      }

      deps.db.jobs.updateState(input.jobId, 'PARSING');
      let parsed = parser.parse(raw);
      lastParsed = parsed;

      const completeness = assessBatchCompleteness(
        raw,
        parsed,
        input.sourceParagraphIds,
      );
      if (completeness.incomplete && parsed.translations.some((t) => t.text.trim())) {
        const partialAttempt = deps.db.jobs.startAttempt({
          job_id: input.jobId,
          attempt_number: nextAttemptNumber(deps.db, input.jobId),
          reason: 'PARTIAL_RAW',
          input_ref: inputRef,
          state: 'RUNNING',
        });
        deps.db.jobs.completeAttempt(partialAttempt.id, {
          state: 'SUCCEEDED',
          output: truncateOutput(raw),
          result: JSON.stringify({
            phase: 'partial_raw',
            reason: completeness.reason,
            missingCount: completeness.missingCount,
          }),
        });
      }

      deps.db.jobs.updateState(input.jobId, 'QA');
      let qa = runLocalQa({
        parsed,
        sourceParagraphIds: input.sourceParagraphIds,
        sourceParagraphs,
        lockedTerms: input.lockedTerms,
      });

      // Multi-chunk merges often leave duplicate/unknown IDs → MANUAL_REVIEW.
      // Clean locally instead of full MALFORMED retranslate (soft-error prone).
      if (qa.verdict === 'MANUAL_REVIEW' && qaErrorsAreOnlyIdNoise(qa)) {
        const cleaned = normalizeParsedTranslations(parsed, input.sourceParagraphIds);
        if (cleaned.changed) {
          logger.info('Normalized duplicate/unknown translation IDs', {
            jobId: input.jobId,
            droppedDup: cleaned.droppedDup,
            droppedUnknown: cleaned.droppedUnknown,
          });
          parsed = cleaned.parsed;
          lastParsed = parsed;
          qa = runLocalQa({
            parsed,
            sourceParagraphIds: input.sourceParagraphIds,
            sourceParagraphs,
            lockedTerms: input.lockedTerms,
          });
        }
      }
      lastQa = qa;

      const attemptResult = {
        parseStatus: parsed.status,
        verdict: qa.verdict,
        missing: qa.missingParagraphIds,
        empty: qa.emptyParagraphIds,
        corrupt: qa.corruptParagraphIds,
        ...readChannelFromProgress(deps.db, input.jobId),
      };

      if (qa.verdict === 'PASS' || qa.verdict === 'PASS_WITH_WARNINGS') {
        deps.db.jobs.completeAttempt(attempt.id, {
          state: 'SUCCEEDED',
          output: truncateOutput(raw),
          result: JSON.stringify(attemptResult),
        });
        const state = 'COMPLETED';
        deps.db.jobs.updateState(input.jobId, state);
        const versionSource = repairRound === 0 ? 'AI_INITIAL' : 'AI_REPAIR';
        const translationPersist = persistParsedTranslations(deps.db, {
          projectId: input.projectId,
          parsed,
          versionSource,
        });

        persistProgress(deps.db, input.jobId, {
          phase: 'done',
          repairRound,
          qa,
          parsed,
          translationPersist,
        });

        // Phase 16: learning pipeline (TERM_DELTA / MEMORY_DELTA / consolidate)
        try {
          const jobRow = deps.db.jobs.getById(input.jobId);
          const sourceContextByParagraph: Record<string, string> = {};
          for (const p of input.batchParagraphs) {
            sourceContextByParagraph[p.paragraphId] = p.sourceText;
          }
          const learning = await runLearningPipeline(deps.db, {
            projectId: input.projectId,
            jobId: input.jobId,
            parsed,
            chapterFrom: jobRow?.chapter_from ?? null,
            chapterTo: jobRow?.chapter_to ?? null,
            sourceContextByParagraph,
          });
          const emptyDeltas =
            learning.terms.candidatesCreated === 0 &&
            learning.terms.candidatesMerged === 0 &&
            learning.terms.confirms === 0 &&
            learning.memory.applied === 0;
          if (emptyDeltas) {
            deps.db.knowledgeSyncEvents.insert({
              projectId: input.projectId,
              eventType: 'LEARNING_EMPTY_DELTAS',
              message:
                'Learning ran after PASS but TERM/MEMORY deltas produced no vault/character updates ' +
                '(AI returned empty deltas, parser discarded them, or discover wrote nothing new). ' +
                'Check Terms → Candidates and raw attempt output.',
            });
            logger.info('LEARNING_EMPTY_DELTAS after PASS', {
              jobId: input.jobId,
              projectId: input.projectId,
              termDeltaCount: parsed.termDeltas.length,
              memoryDeltaCount: parsed.memoryDeltas.length,
            });
          }
          persistProgress(deps.db, input.jobId, {
            phase: 'done',
            repairRound,
            qa,
            parsed,
            learning: {
              candidatesCreated: learning.terms.candidatesCreated,
              memoryApplied: learning.memory.applied,
              conflicts: learning.memory.conflicts.length,
              consolidated: learning.consolidated,
              archived: learning.compact.archivedEvents,
              emptyDeltas,
            },
          });
          deps.db.knowledgeSyncEvents.insert({
            projectId: input.projectId,
            eventType: 'LEARNING_APPLIED',
            message: emptyDeltas
              ? 'Learning applied (empty deltas).'
              : `Learning applied: +${learning.terms.candidatesCreated} candidates, +${learning.memory.applied} memory.`,
            metadata: { jobId: input.jobId },
          });
          // Append LEARNING_APPLIED to job timeline
          const jobAfterLearning = deps.db.jobs.getById(input.jobId);
          if (jobAfterLearning?.progress) {
            try {
              const prog = JSON.parse(jobAfterLearning.progress) as Record<string, unknown>;
              const timeline = Array.isArray(prog.timeline) ? [...prog.timeline] : [];
              timeline.push({
                at: new Date().toISOString(),
                event: 'LEARNING_APPLIED',
                message: emptyDeltas ? 'empty deltas' : 'ok',
              });
              deps.db.jobs.updateProgress(
                input.jobId,
                JSON.stringify({ ...prog, timeline: timeline.slice(-40) }),
              );
            } catch {
              // ignore
            }
          }
        } catch (error) {
          logger.warn('Learning pipeline failed after PASS', {
            jobId: input.jobId,
            message: error instanceof Error ? error.message : String(error),
          });
        }

        return {
          jobId: input.jobId,
          finalState: state,
          repairRounds: repairRound,
          attempts: deps.db.jobs.listAttempts(input.jobId).map(toAttemptDto),
          qa,
          parsed,
          message:
            qa.verdict === 'PASS'
              ? 'QA passed'
              : 'QA passed with warnings (auto-accepted)',
        };
      }

      const reason = classifyRepairReason(parsed, qa);
      lastReason = reason;

      const autoRepairable =
        reason === 'MISSING_PARAGRAPH' ||
        reason === 'EMPTY_PARAGRAPH' ||
        reason === 'CORRUPT_PARAGRAPH' ||
        reason === 'MALFORMED_OUTPUT' ||
        reason === 'TERM_VIOLATION' ||
        reason === 'MEMORY_JSON_INVALID' ||
        reason === 'OUTPUT_INCOMPLETE';

      const stopReason = reason ?? 'MANUAL_REVIEW';
      if (!reason || (!autoRepairable && qa.verdict === 'MANUAL_REVIEW')) {
        deps.db.jobs.completeAttempt(attempt.id, {
          state: 'FAILED',
          output: truncateOutput(raw),
          result: JSON.stringify({ ...attemptResult, stop: 'manual_review' }),
          error: 'Manual review required',
        });
        deps.db.jobs.markNeedsAttention(
          input.jobId,
          stopReason,
          'QA requires manual attention',
        );
        persistProgress(deps.db, input.jobId, {
          phase: 'needs_attention',
          repairRound,
          qa,
          parsed,
          reason,
        });
        return {
          jobId: input.jobId,
          finalState: 'NEEDS_ATTENTION',
          repairRounds: repairRound,
          attempts: deps.db.jobs.listAttempts(input.jobId).map(toAttemptDto),
          qa,
          parsed,
          message: 'NEEDS_ATTENTION — manual action required',
        };
      }

      if (repairRound >= maxAttempts) {
        deps.db.jobs.completeAttempt(attempt.id, {
          state: 'FAILED',
          output: truncateOutput(raw),
          result: JSON.stringify({ ...attemptResult, stop: 'max_attempts', reason }),
          error: `Max repair attempts (${maxAttempts}) reached`,
        });
        deps.db.jobs.markNeedsAttention(
          input.jobId,
          reason,
          `Max repair attempts (${maxAttempts}) reached`,
        );
        persistProgress(deps.db, input.jobId, {
          phase: 'needs_attention',
          repairRound,
          qa,
          parsed,
          reason,
          maxReached: true,
        });
        return {
          jobId: input.jobId,
          finalState: 'NEEDS_ATTENTION',
          repairRounds: repairRound,
          attempts: deps.db.jobs.listAttempts(input.jobId).map(toAttemptDto),
          qa,
          parsed,
          message: `NEEDS_ATTENTION after ${maxAttempts} repair attempt(s)`,
        };
      }

      // Record failed QA attempt then schedule repair send
      deps.db.jobs.completeAttempt(attempt.id, {
        state: 'FAILED',
        output: truncateOutput(raw),
        result: JSON.stringify({ ...attemptResult, reason, next: 'repair' }),
        error: reason,
      });

      repairRound += 1;
      deps.db.jobs.updateState(input.jobId, 'REPAIRING');
      const plan = buildRepairPlan({
        reason,
        qa,
        parsed,
        batchParagraphs: input.batchParagraphs,
        lockedTermHints: (input.lockedTerms ?? []).map((t) => ({
          source: t.source,
          preferred: t.preferred,
          paragraphIds: [],
        })),
      });

      persistProgress(deps.db, input.jobId, {
        phase: plan.mode === 'continuation' ? 'continuation' : 'repairing',
        repairRound,
        reason,
        planMode: plan.mode,
        qa,
      });

      const repairAttemptNumber = nextAttemptNumber(deps.db, input.jobId);
      const inherited = readRepairChannelFromProgress(
        deps.db.jobs.getById(input.jobId)?.progress,
      );
      const repairAttempt = deps.db.jobs.startAttempt({
        job_id: input.jobId,
        attempt_number: repairAttemptNumber,
        reason,
        input_ref: null,
        state: 'RUNNING',
        provider_type: inherited.providerType,
        account_id: inherited.accountId,
        notebook_id: inherited.notebookId,
        thread_ref: inherited.threadRef,
        pack_mode: inherited.packMode,
        knowledge_version: inherited.knowledgeVersion,
      });

      try {
        const sent = await input.sendRepair({
          jobId: input.jobId,
          attemptNumber: repairAttemptNumber,
          reason,
          plan,
          channel: inherited,
        });
        raw = sent.rawResponse;
        inputRef = sent.inputRef;
        const usedChannel = sent.channel ?? inherited;
        if (lastParsed && shouldMergePartialRepair(plan, input.batchParagraphs.length)) {
          const repairParsed = parser.parse(sent.rawResponse);
          const mergedTranslations = mergeRepairTranslations(
            lastParsed.translations,
            repairParsed.translations,
            input.sourceParagraphIds,
          );
          const termDeltas =
            repairParsed.termDeltas.length > 0
              ? repairParsed.termDeltas
              : lastParsed.termDeltas;
          const memoryDeltas =
            repairParsed.memoryDeltas.length > 0
              ? repairParsed.memoryDeltas
              : lastParsed.memoryDeltas;
          raw = buildMergedTranslationProtocol(
            mergedTranslations,
            termDeltas,
            memoryDeltas,
          );
        } else if (plan.mode === 'continuation' && lastParsed) {
          const contParsed = parser.parse(sent.rawResponse);
          const mergedTranslations = mergeTranslationsByParagraphId(
            lastParsed.translations,
            contParsed.translations,
            input.sourceParagraphIds,
          );
          raw = buildMergedTranslationProtocol(
            mergedTranslations,
            [...lastParsed.termDeltas, ...contParsed.termDeltas],
            [...lastParsed.memoryDeltas, ...contParsed.memoryDeltas],
          );
        }
        if (isGeminiSoftErrorText(raw)) {
          const snippet = geminiSoftErrorSnippet(raw);
          deps.db.jobs.completeAttempt(repairAttempt.id, {
            state: 'FAILED',
            input_ref: inputRef,
            output: truncateOutput(raw),
            error: `PROVIDER_ERROR: ${snippet}`,
            result: JSON.stringify({
              phase: 'repair_send_failed',
              reason,
              mode: plan.mode,
              message: snippet,
            }),
          });
          deps.db.jobs.markNeedsAttention(
            input.jobId,
            'PROVIDER_ERROR',
            `Gemini soft error on repair: ${snippet}`,
          );
          return {
            jobId: input.jobId,
            finalState: 'NEEDS_ATTENTION',
            repairRounds: repairRound,
            attempts: deps.db.jobs.listAttempts(input.jobId).map(toAttemptDto),
            qa: lastQa,
            parsed: lastParsed,
            message: `Repair soft error: ${snippet}`,
          };
        }
        deps.db.jobs.completeAttempt(repairAttempt.id, {
          state: 'SUCCEEDED',
          input_ref: inputRef,
          output: truncateOutput(raw),
          result: JSON.stringify({
            phase: 'repair_send',
            reason,
            mode: plan.mode,
            ...channelSnapshotForAttempt(usedChannel),
          }),
          provider_type: usedChannel.providerType,
          account_id: usedChannel.accountId,
          notebook_id: usedChannel.notebookId,
          thread_ref: usedChannel.threadRef,
          pack_mode: usedChannel.packMode,
          knowledge_version: usedChannel.knowledgeVersion,
        });
        persistProgress(deps.db, input.jobId, {
          ...channelSnapshotForAttempt(usedChannel),
          phase: plan.mode === 'continuation' ? 'continuation' : 'repairing',
          repairRound,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        deps.db.jobs.completeAttempt(repairAttempt.id, {
          state: 'FAILED',
          error: message,
          result: JSON.stringify({ phase: 'repair_send_failed', reason }),
        });
        deps.db.jobs.markNeedsAttention(input.jobId, reason, message);
        return {
          jobId: input.jobId,
          finalState: 'NEEDS_ATTENTION',
          repairRounds: repairRound,
          attempts: deps.db.jobs.listAttempts(input.jobId).map(toAttemptDto),
          qa: lastQa,
          parsed: lastParsed,
          message: `Repair send failed: ${message}`,
        };
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      deps.db.jobs.completeAttempt(attempt.id, {
        state: 'CRASHED',
        error: message,
        output: truncateOutput(raw),
        result: JSON.stringify({ crash: true }),
      });
      deps.db.jobs.markNeedsAttention(input.jobId, lastReason ?? 'MALFORMED_OUTPUT', message);
      return {
        jobId: input.jobId,
        finalState: 'NEEDS_ATTENTION',
        repairRounds: repairRound,
        attempts: deps.db.jobs.listAttempts(input.jobId).map(toAttemptDto),
        qa: lastQa,
        parsed: lastParsed,
        message: `Crash during repair loop: ${message}`,
      };
    }
  }
}

export function shouldMergePartialRepair(
  plan: RepairPromptPlan,
  batchParagraphCount: number,
): boolean {
  if (plan.mode === 'deltas_only' || !plan.retranslate) return false;
  if (plan.mode === 'continuation') return true;
  if (
    plan.mode === 'malformed_full' &&
    plan.targetParagraphIds.length >= batchParagraphCount
  ) {
    return false;
  }
  return (
    plan.mode === 'translation_empty' ||
    plan.mode === 'translation_corrupt' ||
    plan.mode === 'translation_missing' ||
    plan.mode === 'term_violation' ||
    plan.mode === 'malformed_full'
  );
}

/** Mark RUNNING attempts without completed_at as CRASHED (process died mid-attempt). */
export function recoverCrashedAttempts(db: DatabaseManager, jobId: string): number {
  return db.jobs.markRunningAttemptsCrashed(jobId);
}

export function hashPrompt(prompt: string): string {
  return createHash('sha256').update(prompt).digest('hex').slice(0, 16);
}

function nextAttemptNumber(db: DatabaseManager, jobId: string): number {
  const attempts = db.jobs.listAttempts(jobId);
  if (attempts.length === 0) return 1;
  return Math.max(...attempts.map((a) => a.attempt_number)) + 1;
}

function persistProgress(
  db: DatabaseManager,
  jobId: string,
  progress: Record<string, unknown>,
): void {
  const existing = readProgressObject(db, jobId);
  db.jobs.updateProgress(jobId, JSON.stringify({ ...existing, ...progress }));
}

function readProgressObject(
  db: DatabaseManager,
  jobId: string,
): Record<string, unknown> {
  const job = db.jobs.getById(jobId);
  if (!job?.progress) return {};
  try {
    const parsed = JSON.parse(job.progress) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function readChannelFromProgress(
  db: DatabaseManager,
  jobId: string,
): { providerType?: string; packMode?: string } {
  const progress = readProgressObject(db, jobId);
  return {
    providerType:
      typeof progress.providerType === 'string' ? progress.providerType : undefined,
    packMode:
      progress.packMode === 'slim' ||
      progress.packMode === 'hybrid' ||
      progress.packMode === 'fat'
        ? progress.packMode
        : undefined,
  };
}

function truncateOutput(raw: string, max = 50_000): string {
  if (raw.length <= max) return raw;
  return `${raw.slice(0, max)}\n…[truncated ${raw.length - max} chars]`;
}

function toAttemptDto(row: {
  id: string;
  job_id: string;
  attempt_number: number;
  state: string;
  reason: string | null;
  input_ref: string | null;
  output: string | null;
  result: string | null;
  error: string | null;
  provider_type?: string | null;
  account_id?: string | null;
  notebook_id?: string | null;
  thread_ref?: string | null;
  pack_mode?: string | null;
  knowledge_version?: number | null;
  started_at: string | null;
  completed_at: string | null;
}): JobAttemptDto {
  const packMode =
    row.pack_mode === 'slim' || row.pack_mode === 'hybrid' || row.pack_mode === 'fat'
      ? (row.pack_mode as PackMode)
      : null;
  return {
    id: row.id,
    jobId: row.job_id,
    attemptNumber: row.attempt_number,
    state: row.state,
    reason: row.reason,
    inputRef: row.input_ref,
    output: row.output,
    result: row.result,
    error: row.error,
    providerType: row.provider_type ?? null,
    accountId: row.account_id ?? null,
    notebookId: row.notebook_id ?? null,
    threadRef: row.thread_ref ?? null,
    packMode,
    knowledgeVersion: row.knowledge_version ?? null,
    startedAt: row.started_at,
    completedAt: row.completed_at,
  };
}

/** Test helper — create a synthetic job id without DB when needed. */
export function newRepairJobId(): string {
  return newId();
}
