import type { ProjectDto } from '@shared/schemas/import';
import type { JobDto } from '@shared/schemas/job';
import { isJobAttention } from '@shared/utils/job-progress';
import { detectDuplicateCharacterGroups } from '../characters/detect-duplicate-characters';
import type { CharacterDto } from '@shared/schemas/memory';

export type DashboardActionSeverity = 'ERROR' | 'ACTION_REQUIRED' | 'WARNING';

export interface DashboardActionItem {
  id: string;
  severity: DashboardActionSeverity;
  messageKey: string;
  messageParams?: Record<string, string | number>;
  actionKey: string;
  route: string;
}

export interface DashboardActionContext {
  projects: ProjectDto[];
  jobs: JobDto[];
  accounts: {
    id: string;
    status?: string;
    availability?: { availability: string };
  }[];
  termsReviewCount: number;
  termCandidatesByProject: Map<string, number>;
  sourceModifiedByProject: Map<string, number>;
  characterConflictsByProject: Map<string, number>;
  priorityProjectId?: string | null;
}

const SEVERITY_RANK: Record<DashboardActionSeverity, number> = {
  ERROR: 0,
  ACTION_REQUIRED: 1,
  WARNING: 2,
};

/** User-facing actionable items — ERROR / ACTION_REQUIRED / meaningful WARNING only. */
export function resolveDashboardActions(ctx: DashboardActionContext): DashboardActionItem[] {
  const items: DashboardActionItem[] = [];

  const loginRequired = ctx.accounts.filter((a) => {
    const avail = a.availability?.availability ?? a.status ?? '';
    return avail === 'LOGIN_REQUIRED' || avail === 'NEEDS_ATTENTION';
  });
  if (loginRequired.length > 0) {
    items.push({
      id: 'ai-login',
      severity: 'ERROR',
      messageKey: 'dashboard.actionAiLogin',
      messageParams: { count: loginRequired.length },
      actionKey: 'dashboard.actionCheckAccounts',
      route: '/accounts',
    });
  }

  for (const job of ctx.jobs) {
    if (!isJobAttention(job.state)) continue;
    const project = ctx.projects.find((p) => p.id === job.projectId);
    items.push({
      id: `job-attention-${job.id}`,
      severity: job.state === 'FAILED' ? 'ERROR' : 'ACTION_REQUIRED',
      messageKey: 'dashboard.actionJobAttention',
      messageParams: {
        project: project?.title ?? job.projectId,
        state: job.state,
      },
      actionKey: 'actions.handle',
      route: '/jobs',
    });
  }

  const focusIds = new Set<string>();
  if (ctx.priorityProjectId) focusIds.add(ctx.priorityProjectId);
  for (const p of ctx.projects) {
    if (p.status !== 'archived') focusIds.add(p.id);
  }

  if (ctx.termsReviewCount > 0) {
    items.push({
      id: 'terms-review',
      severity: 'ACTION_REQUIRED',
      messageKey: 'dashboard.actionTermsReview',
      messageParams: { count: ctx.termsReviewCount },
      actionKey: 'dashboard.actionView',
      route: ctx.priorityProjectId
        ? `/projects/${ctx.priorityProjectId}/terms`
        : '/projects',
    });
  }

  for (const projectId of focusIds) {
    const project = ctx.projects.find((p) => p.id === projectId);
    if (!project) continue;

    const modified = ctx.sourceModifiedByProject.get(projectId) ?? 0;
    if (modified > 0) {
      items.push({
        id: `source-modified-${projectId}`,
        severity: 'WARNING',
        messageKey: 'dashboard.actionSourceChanged',
        messageParams: { count: modified, project: project.title },
        actionKey: 'dashboard.actionCheck',
        route: `/projects/${projectId}/chapters`,
      });
    }

    const conflicts = ctx.characterConflictsByProject.get(projectId) ?? 0;
    if (conflicts > 0) {
      items.push({
        id: `character-conflicts-${projectId}`,
        severity: 'WARNING',
        messageKey: 'dashboard.actionCharacterConflicts',
        messageParams: { count: conflicts, project: project.title },
        actionKey: 'dashboard.actionResolve',
        route: `/projects/${projectId}/characters`,
      });
    }

    const candidates = ctx.termCandidatesByProject.get(projectId) ?? 0;
    if (candidates > 0 && ctx.termsReviewCount === 0) {
      items.push({
        id: `term-candidates-${projectId}`,
        severity: 'ACTION_REQUIRED',
        messageKey: 'dashboard.actionTermsReview',
        messageParams: { count: candidates },
        actionKey: 'dashboard.actionView',
        route: `/projects/${projectId}/terms`,
      });
    }

    if (project.health?.source === 'missing') {
      items.push({
        id: `source-missing-${projectId}`,
        severity: 'ERROR',
        messageKey: 'dashboard.actionSourceMissing',
        messageParams: { project: project.title },
        actionKey: 'dashboard.actionSelectFolder',
        route: `/projects/${projectId}/chapters`,
      });
    } else if (project.health?.source === 'warn') {
      items.push({
        id: `source-warn-${projectId}`,
        severity: 'WARNING',
        messageKey: 'dashboard.actionSourceDisconnected',
        messageParams: { project: project.title },
        actionKey: 'dashboard.actionCheck',
        route: `/projects/${projectId}/chapters`,
      });
    }

    if (project.health?.memoryVersion != null && !project.health.memoryVerified) {
      items.push({
        id: `memory-stale-${projectId}`,
        severity: 'WARNING',
        messageKey: 'dashboard.actionMemoryUpdate',
        actionKey: 'dashboard.actionCheck',
        route: `/projects/${projectId}/ai-memory`,
      });
    }
  }

  return items
    .sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity])
    .slice(0, 8);
}

export function countCharacterConflicts(characters: CharacterDto[]): number {
  return detectDuplicateCharacterGroups(characters).length;
}
