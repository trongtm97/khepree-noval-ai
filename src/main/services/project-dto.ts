import type { ProjectRow } from '../db/repositories/project-repository';
import type { ProjectDto } from '@shared/schemas/import';
import type { DatabaseManager } from '../db/database-manager';
import { JOB_TERMINAL_STATES, type JobState } from '@shared/constants/job';
import { NOTEBOOK_CHANNEL_READY } from '@shared/constants/notebook';

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
    const from = job.chapter_from as number;
    const to = job.chapter_to as number;
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
  const ready = accounts.some((a) => {
    if (a.status !== 'READY') return false;
    const worker = db.workerStates.getByAccountId(a.id);
    return worker != null && worker.is_enabled === 1;
  });
  const needsLogin = accounts.some(
    (a) => a.status === 'LOGIN_REQUIRED' || a.status === 'NEEDS_ATTENTION',
  );
  let google: ProjectHealthTone = 'missing';
  if (ready) google = 'ok';
  else if (accounts.length > 0 || needsLogin) google = 'warn';

  const notebooks = db.notebooks.listByProject(row.id);
  const usable = notebooks.find((n) => NOTEBOOK_CHANNEL_READY.has(n.status));
  const anyNotebook = notebooks[0];
  let notebook: ProjectHealthTone = 'missing';
  if (usable) notebook = 'ok';
  else if (anyNotebook) notebook = 'warn';

  const memoryVersion =
    usable?.local_knowledge_version ??
    usable?.knowledge_version ??
    anyNotebook?.local_knowledge_version ??
    null;
  const memoryVerified =
    Boolean(usable) &&
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
