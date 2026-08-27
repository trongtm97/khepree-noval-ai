import type { DatabaseManager } from '../db/database-manager';
import type { PackMode } from '@shared/constants/pack-mode';
import type {
  JobTimelineEntry,
  KnowledgeSourceMode,
  TranslationContextDiagnostics,
} from '@shared/constants/translation-context';
import { resolveTranslationNotebook } from '../notebook/notebook-resolver';
import type { PackModeDecision } from '../prompt/pack-mode-resolver';
import { utcNow } from '../db/utils/timestamps';
import type { KnowledgeSyncEventType } from '@shared/constants/knowledge';

export function resolveKnowledgeSourceMode(
  db: DatabaseManager,
  projectId: string,
  notebookId: string | null,
  packMode: PackMode,
): KnowledgeSourceMode {
  if (packMode === 'fat' || !notebookId) return 'LOCAL_ONLY';
  const bindings = notebookId
    ? db.notebookSourceBindings.listByNotebook(projectId, notebookId)
    : db.notebookSourceBindings.listByProject(projectId);
  const active = bindings.filter((b) => b.status === 'active');
  if (active.some((b) => b.binding_type === 'DRIVE_LIVE')) return 'DRIVE_LIVE';
  if (
    active.some(
      (b) =>
        b.binding_type === 'STATIC_UPLOAD' || b.binding_type === 'COPIED_TEXT',
    )
  ) {
    return 'STATIC';
  }
  return 'LOCAL_ONLY';
}

/**
 * Build diagnostics snapshot for a job send (pack + Notebook mapping).
 */
export function buildTranslationContextDiagnostics(
  db: DatabaseManager,
  input: {
    projectId: string;
    accountId: string | null;
    providerType: string | null;
    packDecision: PackModeDecision & { hotDeltaCount?: number };
    threadRef?: string | null;
  },
): TranslationContextDiagnostics {
  const packMode = input.packDecision.packMode;
  const mapping =
    input.accountId != null
      ? resolveTranslationNotebook(db, input.projectId, input.accountId)
      : null;
  const notebookId =
    input.packDecision.notebookId ?? mapping?.notebook_id ?? mapping?.id ?? null;
  const groundingVerified =
    packMode === 'slim' &&
    input.packDecision.sourceGroundingConfirmed &&
    input.packDecision.reason === 'ready_verified';

  const knowledgeSourceMode = resolveKnowledgeSourceMode(
    db,
    input.projectId,
    notebookId,
    packMode,
  );

  return {
    providerType: input.providerType,
    accountId: input.accountId,
    notebookRole:
      mapping?.notebook_role === 'RESEARCH' ||
      mapping?.notebook_role === 'TRANSLATION' ||
      mapping?.notebook_role === 'SINGLE'
        ? mapping.notebook_role
        : packMode === 'fat'
          ? null
          : 'TRANSLATION',
    notebookId,
    notebookName: mapping?.notebook_name ?? null,
    notebookGroundingVerified: groundingVerified,
    localKnowledgeVersion: input.packDecision.localKnowledgeVersion,
    notebookKnowledgeVersion: input.packDecision.notebookVerifiedVersion,
    packMode,
    hotDeltaCount: input.packDecision.hotDeltaCount ?? 0,
    threadRef: input.threadRef ?? null,
    knowledgeSourceMode,
  };
}

export function appendJobTimeline(
  existing: unknown,
  event: string,
  message?: string,
): JobTimelineEntry[] {
  const list: JobTimelineEntry[] = Array.isArray(existing)
    ? (existing as { event?: unknown; at?: unknown; message?: string }[]).filter(
        (e): e is JobTimelineEntry =>
          typeof e.event === 'string' && typeof e.at === 'string',
      )
    : [];
  list.push({
    at: utcNow(),
    event,
    ...(message ? { message } : {}),
  });
  // Cap so progress JSON stays small
  return list.slice(-40);
}

/** Persist diagnostics + timeline event onto job.progress (merge). */
export function mergeJobProgressDiagnostics(
  db: DatabaseManager,
  jobId: string,
  diagnostics: TranslationContextDiagnostics,
  timelineEvent?: { event: string; message?: string },
): void {
  const job = db.jobs.getById(jobId);
  let existing: Record<string, unknown> = {};
  if (job?.progress) {
    try {
      existing = JSON.parse(job.progress) as Record<string, unknown>;
    } catch {
      existing = {};
    }
  }
  const timeline = timelineEvent
    ? appendJobTimeline(existing.timeline, timelineEvent.event, timelineEvent.message)
    : Array.isArray(existing.timeline)
      ? (existing.timeline as JobTimelineEntry[])
      : [];

  db.jobs.updateProgress(
    jobId,
    JSON.stringify({
      ...existing,
      ...diagnostics,
      // Keep legacy aliases used by older UI / repair channel
      notebookVerifiedVersion: diagnostics.notebookKnowledgeVersion,
      timeline,
    }),
  );
}

export function logJobKnowledgeEvent(
  db: DatabaseManager,
  input: {
    projectId: string;
    jobId: string;
    eventType: KnowledgeSyncEventType;
    message: string;
    diagnostics?: Partial<TranslationContextDiagnostics>;
  },
): void {
  db.knowledgeSyncEvents.insert({
    projectId: input.projectId,
    eventType: input.eventType,
    message: input.message,
    metadata: {
      jobId: input.jobId,
      ...input.diagnostics,
    },
  });
}
