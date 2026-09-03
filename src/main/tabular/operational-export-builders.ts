import { QaResultSchema } from '@shared/schemas/output-protocol';
import type { DatabaseManager } from '../db/database-manager';
import type { JobRow } from '../db/repositories/job-repository';
import {
  ACTIVITY_LOG_EXPORT_COLUMNS,
  JOBS_EXPORT_COLUMNS,
  LEARNING_CONFLICTS_EXPORT_COLUMNS,
  OPERATIONAL_EXPORT_DEFAULT_LIMIT,
  QA_EXPORT_COLUMNS,
} from '@shared/constants/operational-tabular';
import {
  sanitizeOperationalJson,
  sanitizeOperationalText,
  type OperationalSanitizeOptions,
} from './operational-sanitize';

export interface OperationalExportContext {
  db: DatabaseManager;
  projectId?: string;
  limit?: number;
  sanitize?: OperationalSanitizeOptions;
}

function limitOf(ctx: OperationalExportContext): number {
  return ctx.limit ?? OPERATIONAL_EXPORT_DEFAULT_LIMIT;
}

function projectLabel(db: DatabaseManager, projectId: string): string {
  const project = db.projects.getById(projectId);
  return project ? `${project.title} (${projectId})` : projectId;
}

function editionLabel(db: DatabaseManager, editionId: string | null): string {
  if (!editionId) return '';
  const edition = db.translationEditions.getById(editionId);
  if (!edition) return editionId;
  const name = edition.name.trim() || edition.target_language;
  return `${name} (${editionId})`;
}

function chapterRange(job: JobRow): string {
  if (job.chapter_from == null) return '';
  if (job.chapter_to == null || job.chapter_to === job.chapter_from) {
    return String(job.chapter_from);
  }
  return `${job.chapter_from}-${job.chapter_to}`;
}

function durationMs(started: string | null, completed: string | null): string {
  if (!started || !completed) return '';
  const startMs = Date.parse(started);
  const endMs = Date.parse(completed);
  if (Number.isNaN(startMs) || Number.isNaN(endMs) || endMs < startMs) return '';
  return String(endMs - startMs);
}

function listJobs(db: DatabaseManager, projectId?: string, limit = OPERATIONAL_EXPORT_DEFAULT_LIMIT): JobRow[] {
  return projectId ? db.jobs.listByProject(projectId).slice(0, limit) : db.jobs.listAll(limit);
}

function parseProgress(raw: string | null): Record<string, unknown> {
  if (!raw) return {};
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function activityLevel(state: string, error: string | null): string {
  const upper = state.toUpperCase();
  if (error || upper.includes('FAIL') || upper === 'CRASHED') return 'error';
  if (upper.includes('WARN') || upper.includes('ATTENTION')) return 'warn';
  return 'info';
}

function conflictChapter(row: { delta_source: string; proposed_value: string | null }): string {
  try {
    const parsed = JSON.parse(row.delta_source) as Record<string, unknown>;
    if (typeof parsed.chapter_number === 'number') return String(parsed.chapter_number);
    if (typeof parsed.chapterNumber === 'number') return String(parsed.chapterNumber);
  } catch {
    // fall through
  }
  if (row.proposed_value) {
    const m = /chapter[_\s-]?(\d+)/i.exec(row.proposed_value);
    if (m?.[1]) return m[1];
  }
  return '';
}

export function buildJobsExportRows(ctx: OperationalExportContext): Record<string, string>[] {
  const jobs = listJobs(ctx.db, ctx.projectId, limitOf(ctx));
  const rows: Record<string, string>[] = [];
  for (const job of jobs) {
    const attempts = ctx.db.jobs.listAttempts(job.id);
    const latestAttempt = attempts[attempts.length - 1];
    const progress = parseProgress(job.progress);
    const provider =
      latestAttempt.provider_type ??
      (typeof progress.providerType === 'string' ? progress.providerType : '');
    rows.push({
      job_id: job.id,
      project: projectLabel(ctx.db, job.project_id),
      edition: editionLabel(ctx.db, job.edition_id),
      chapters: chapterRange(job),
      worker: job.worker_id ?? '',
      provider: sanitizeOperationalText(provider, ctx.sanitize),
      state: job.state,
      started: job.started_at ?? '',
      completed: job.completed_at ?? '',
      duration: durationMs(job.started_at, job.completed_at),
      retry_count: String(job.attempt_count),
      error: sanitizeOperationalText(job.error, ctx.sanitize),
    });
  }
  return rows;
}

export function buildQaExportRows(ctx: OperationalExportContext): Record<string, string>[] {
  const jobs = listJobs(ctx.db, ctx.projectId, limitOf(ctx));
  const rows: Record<string, string>[] = [];
  for (const job of jobs) {
    const progress = parseProgress(job.progress);
    const qaParsed = QaResultSchema.safeParse(progress.qa);
    if (!qaParsed.success) continue;
    const qa = qaParsed.data;
    const project = projectLabel(ctx.db, job.project_id);
    const edition = editionLabel(ctx.db, job.edition_id);
    const chapter = chapterRange(job);
    const resolvedDefault =
      job.state === 'COMPLETED' || job.state === 'ACCEPTED_WITH_WARNINGS' ? 'yes' : 'no';

    const pushIssue = (
      issue: { code: string; severity: string; message: string; paragraphId?: string },
      severity: string,
    ) => {
      rows.push({
        project,
        edition,
        chapter,
        paragraph_id: issue.paragraphId ?? '',
        issue_type: issue.code,
        severity,
        message: sanitizeOperationalText(issue.message, ctx.sanitize),
        resolved: resolvedDefault,
      });
    };

    for (const issue of qa.errors) pushIssue(issue, 'error');
    for (const issue of qa.warnings) pushIssue(issue, 'warning');
  }
  return rows;
}

export function buildActivityLogExportRows(ctx: OperationalExportContext): Record<string, string>[] {
  const limit = limitOf(ctx);
  const rows: Record<string, string>[] = [];
  const sanitize = ctx.sanitize;

  const auditEvents = ctx.db.auditLog.listRecent(limit);
  for (const event of auditEvents) {
    if (ctx.projectId && event.resource_type === 'project' && event.resource_id !== ctx.projectId) {
      continue;
    }
    rows.push({
      timestamp: event.created_at,
      level: 'info',
      module: 'audit',
      project:
        event.resource_type === 'project' && event.resource_id
          ? projectLabel(ctx.db, event.resource_id)
          : '',
      job: '',
      message: sanitizeOperationalText(`${event.event_type}: ${event.summary}`, sanitize),
    });
  }

  if (ctx.projectId) {
    const learningEvents = ctx.db.learningEvents.listByProject(ctx.projectId, { limit });
    for (const event of learningEvents) {
      let payload: unknown = null;
      if (event.payload) {
        try {
          payload = JSON.parse(event.payload);
        } catch {
          payload = event.payload;
        }
      }
      rows.push({
        timestamp: event.created_at,
        level: 'info',
        module: 'learning',
        project: projectLabel(ctx.db, event.project_id),
        job: event.job_id ?? '',
        message: sanitizeOperationalJson({ type: event.event_type, payload }, sanitize),
      });
    }
  }

  const jobs = listJobs(ctx.db, ctx.projectId, Math.min(limit, 200));
  for (const job of jobs) {
    rows.push({
      timestamp: job.updated_at,
      level: activityLevel(job.state, job.error),
      module: 'jobs',
      project: projectLabel(ctx.db, job.project_id),
      job: job.id,
      message: sanitizeOperationalText(`${job.type} · ${job.state}`, sanitize),
    });
    for (const attempt of ctx.db.jobs.listAttempts(job.id)) {
      rows.push({
        timestamp: attempt.completed_at ?? attempt.started_at ?? attempt.created_at,
        level: activityLevel(attempt.state, attempt.error),
        module: 'job_attempt',
        project: projectLabel(ctx.db, job.project_id),
        job: job.id,
        message: sanitizeOperationalText(
          `attempt ${attempt.attempt_number} · ${attempt.state}${attempt.error ? ` · ${attempt.error}` : ''}`,
          sanitize,
        ),
      });
    }
  }

  rows.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  return rows.slice(0, limit);
}

export function buildLearningConflictsExportRows(
  ctx: OperationalExportContext,
): Record<string, string>[] {
  if (!ctx.projectId) return [];
  const rows = ctx.db.memoryConflicts.listByProject(ctx.projectId, limitOf(ctx));
  return rows.map((row) => ({
    conflict_id: row.id,
    entity_type: row.entity_type,
    field: row.field_key,
    old: sanitizeOperationalText(row.existing_value, ctx.sanitize),
    new: sanitizeOperationalText(row.proposed_value, ctx.sanitize),
    chapter: conflictChapter(row),
    status: row.status,
  }));
}

export function buildOperationalWorkbookData(ctx: OperationalExportContext): {
  jobs: Record<string, string>[];
  qa: Record<string, string>[];
  activityLog: Record<string, string>[];
  learningConflicts: Record<string, string>[];
} {
  return {
    jobs: buildJobsExportRows(ctx),
    qa: buildQaExportRows(ctx),
    activityLog: buildActivityLogExportRows(ctx),
    learningConflicts: buildLearningConflictsExportRows(ctx),
  };
}

export {
  JOBS_EXPORT_COLUMNS,
  QA_EXPORT_COLUMNS,
  ACTIVITY_LOG_EXPORT_COLUMNS,
  LEARNING_CONFLICTS_EXPORT_COLUMNS,
};
