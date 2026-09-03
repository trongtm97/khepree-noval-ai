import type { ProjectRow } from '../db/repositories/project-repository';
import type { ProjectDto } from '@shared/schemas/import';
import type { DatabaseManager } from '../db/database-manager';
import { JOB_TERMINAL_STATES, type JobState } from '@shared/constants/job';
import { NOTEBOOK_CHANNEL_READY } from '@shared/constants/notebook';
import {
  resolveNotebookMappedAccountId,
  resolveProjectWorker,
} from './project-worker-resolver';

function isNotebookChannelUsable(status: string): boolean {
  return NOTEBOOK_CHANNEL_READY.has(status);
}

export interface ProjectChapterStatsInput {
  sourceChapterCount: number;
  translatedChapterCount: number;
  reviewedChapterCount: number;
  queuedChapterCount: number;
  errorChapterCount: number;
  nextUntranslatedChapter: number | null;
}

export type ProjectHealthTone = 'ok' | 'warn' | 'missing';

export interface ProjectHealthInput {
  source: ProjectHealthTone;
  google: ProjectHealthTone;
  notebook: ProjectHealthTone;
  memoryVersion: number | null;
  memoryVerified: boolean;
}

export function toProjectDto(
  row: ProjectRow,
  chapterCountOrStats?: number | ProjectChapterStatsInput,
  health?: ProjectHealthInput,
): ProjectDto {
  const stats =
    typeof chapterCountOrStats === 'number'
      ? {
          sourceChapterCount: chapterCountOrStats,
          translatedChapterCount: 0,
          reviewedChapterCount: 0,
          queuedChapterCount: 0,
          errorChapterCount: 0,
          nextUntranslatedChapter: null as number | null,
        }
      : chapterCountOrStats;

  const sourceChapterCount = stats?.sourceChapterCount;
  return {
    id: row.id,
    title: row.title,
    sourceLanguage: row.source_language,
    targetLanguage: row.target_language,
    genre: row.genre,
    description: row.description,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    chapterCount: sourceChapterCount,
    sourceChapterCount,
    translatedChapterCount: stats?.translatedChapterCount,
    reviewedChapterCount: stats?.reviewedChapterCount,
    queuedChapterCount: stats?.queuedChapterCount,
    errorChapterCount: stats?.errorChapterCount,
    nextUntranslatedChapter: stats?.nextUntranslatedChapter ?? null,
    activeEditionId: row.active_edition_id ?? null,
    sourceLanguageMode: row.source_language_mode,
    sourceLanguageHint: row.source_language_hint ?? null,
    sourceLanguageConfidence: row.source_language_confidence ?? null,
    sourceLanguageDetectionMethod: row.source_language_detection_method ?? null,
    sourceLanguageDetectionCheckedAt: row.source_language_detection_checked_at ?? null,
    health,
  };
}

function countQueuedChapters(
  db: DatabaseManager,
  projectId: string,
): number {
  const jobs = db.jobs.listByProject(projectId).filter((job) => {
    if (JOB_TERMINAL_STATES.has(job.state as JobState)) return false;
    return job.chapter_from != null && job.chapter_to != null;
  });
  if (jobs.length === 0) return 0;

  const chapters = db.chapters.listByProject(projectId);
  const numbered = new Set(
    chapters
      .map((c) => c.chapter_number)
      .filter((n): n is number => typeof n === 'number'),
  );
  const queued = new Set<number>();
  for (const job of jobs) {
    if (job.chapter_from == null || job.chapter_to == null) continue;
    const from = job.chapter_from;
    const to = job.chapter_to;
    const lo = Math.min(from, to);
    const hi = Math.max(from, to);
    for (let n = lo; n <= hi; n += 1) {
      if (numbered.has(n)) queued.add(n);
    }
  }
  return queued.size;
}

function projectHealth(
  db: DatabaseManager,
  row: ProjectRow,
  errorChapterCount: number,
): ProjectHealthInput {
  let source: ProjectHealthTone = 'missing';
  if (row.source_folder_path) {
    source = row.source_folder_status === 'AVAILABLE' ? 'ok' : 'warn';
  }
  if (source === 'ok' && errorChapterCount > 0) source = 'warn';

  const accounts = db.googleAccounts.list();
  const mappedWorker = resolveProjectWorker(db, {
    projectId: row.id,
    purpose: 'translation',
  });
  const mappedAccountId = mappedWorker.accountId;
  const ready = mappedAccountId
    ? (() => {
        const a = accounts.find((x) => x.id === mappedAccountId);
        if (!a || (a.status !== 'READY' && a.status !== 'BUSY')) return false;
        const worker = db.workerStates.getByAccountId(a.id);
        return worker?.is_enabled === 1;
      })()
    : accounts.some((a) => {
        if (a.status !== 'READY') return false;
        const worker = db.workerStates.getByAccountId(a.id);
        return worker?.is_enabled === 1;
      });
  const needsLogin = accounts.some(
    (a) => a.status === 'LOGIN_REQUIRED' || a.status === 'NEEDS_ATTENTION',
  );
  let google: ProjectHealthTone = 'missing';
  if (ready) google = 'ok';
  else if (accounts.length > 0 || needsLogin) google = 'warn';

  // Prefer Translation Notebook mapped to project worker — never first READY notebook.
  const notebookAccountId =
    resolveNotebookMappedAccountId(db, row.id, 'translation') ?? mappedAccountId;
  const notebooks = db.notebooks.listByProject(row.id);
  const mappedNotebooks = notebookAccountId
    ? notebooks.filter((n) => n.google_account_id === notebookAccountId)
    : notebooks;
  const translationNotebooks = mappedNotebooks.filter(
    (n) => n.notebook_role === 'TRANSLATION' || n.notebook_role === 'SINGLE',
  );
  const pool = translationNotebooks.length > 0 ? translationNotebooks : mappedNotebooks;
  const usable = pool.find((n) => isNotebookChannelUsable(n.status));
  const anyNotebook = pool.at(0) ?? notebooks.at(0);
  let notebook: ProjectHealthTone = 'missing';
  if (usable) notebook = 'ok';
  else if (anyNotebook) notebook = 'warn';

  const memoryVersion =
    usable?.local_knowledge_version ??
    usable?.knowledge_version ??
    anyNotebook?.local_knowledge_version ??
    null;
  const memoryVerified =
    usable != null &&
    usable.local_knowledge_version > 0 &&
    usable.local_knowledge_version === usable.knowledge_version;

  return {
    source,
    google,
    notebook,
    memoryVersion: memoryVersion && memoryVersion > 0 ? memoryVersion : null,
    memoryVerified,
  };
}

/** Full Command Center DTO for list/get. */
export function toProjectDtoFromDb(db: DatabaseManager, row: ProjectRow): ProjectDto {
  const base = db.chapters.getProjectChapterStats(row.id);
  const queuedChapterCount = countQueuedChapters(db, row.id);
  return toProjectDto(
    row,
    { ...base, queuedChapterCount },
    projectHealth(db, row, base.errorChapterCount),
  );
}
