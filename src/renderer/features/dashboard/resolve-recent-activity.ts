import type { JobDto } from '@shared/schemas/job';
import type { ProjectDto } from '@shared/schemas/import';
import { isJobCompleted } from '@shared/utils/job-progress';

export type DashboardActivityKind =
  | 'chapter_translated'
  | 'characters_detected'
  | 'chapters_imported'
  | 'terms_updated'
  | 'job_completed';

export interface DashboardActivityEvent {
  id: string;
  kind: DashboardActivityKind;
  messageKey: string;
  messageParams?: Record<string, string | number>;
  timestamp: string;
  route: string;
}

const NOISE_PHASES = new Set([
  'request_sent',
  'selector_found',
  'db_transaction',
  'context_hash_updated',
]);

/** User-meaningful activity only — no internal telemetry. */
export function resolveRecentActivity(input: {
  jobs: JobDto[];
  projects: ProjectDto[];
  maxItems?: number;
}): DashboardActivityEvent[] {
  const { jobs, projects, maxItems = 8 } = input;
  const projectTitle = (id: string) => projects.find((p) => p.id === id)?.title ?? id;
  const events: DashboardActivityEvent[] = [];

  for (const job of jobs) {
    if (!isJobCompleted(job.state)) continue;
    const ts = job.completedAt ?? job.updatedAt;
    const from = job.chapterFrom;
    const to = job.chapterTo ?? job.chapterFrom;
    const phase = job.progress?.phase?.toLowerCase() ?? '';
    if (phase && NOISE_PHASES.has(phase)) continue;

    if (from != null) {
      const chapterLabel = to != null && to !== from ? `${from}–${to}` : String(from);
      events.push({
        id: `job-done-${job.id}`,
        kind: 'chapter_translated',
        messageKey: 'dashboard.activityChapterTranslated',
        messageParams: { project: projectTitle(job.projectId), chapter: chapterLabel },
        timestamp: ts,
        route: `/projects/${job.projectId}/translate`,
      });
    } else {
      events.push({
        id: `job-done-${job.id}`,
        kind: 'job_completed',
        messageKey: 'dashboard.activityJobCompleted',
        messageParams: { project: projectTitle(job.projectId) },
        timestamp: ts,
        route: `/projects/${job.projectId}/translate`,
      });
    }
  }

  return events
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
    .slice(0, maxItems);
}
