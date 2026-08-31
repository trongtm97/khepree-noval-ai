import type { ProjectDto } from '@shared/schemas/import';
import type {
  AccountAvailabilityDto,
  AccountAvailabilitySummary,
} from '@shared/schemas/account-availability';
import { countUsableForNewJob } from '@shared/utils/account-availability';

export interface AccountReadinessInput {
  availability: AccountAvailabilityDto;
}

export interface DashboardReadiness {
  aiReady: boolean;
  sourceReady: boolean;
  localMemoryReady: boolean;
  hasProject: boolean;
  hasSource: boolean;
  hasTranslation: boolean;
  needsAction: boolean;
  onboardingComplete: boolean;
  accountSummary: AccountAvailabilitySummary;
}

export interface OnboardingStep {
  id: 'ai' | 'project' | 'source' | 'translation';
  done: boolean;
}

/** Single source for onboarding + dashboard readiness — uses canonical availability DTO. */
export function resolveDashboardReadiness(input: {
  projects: ProjectDto[];
  accounts: AccountReadinessInput[];
  hasCompletedJob: boolean;
  priorityProject?: ProjectDto | null;
  /** Any translation AI channel ready (Gemini, ChatGPT, Meta, Web API). */
  anyAiChannelReady?: boolean;
}): DashboardReadiness {
  const { projects, accounts, hasCompletedJob, priorityProject, anyAiChannelReady } = input;
  const hasProject = projects.length > 0;
  const hasTranslation =
    projects.some((p) => (p.translatedChapterCount ?? 0) > 0) || hasCompletedJob;

  const usable = countUsableForNewJob(accounts.map((a) => ({ availability: a.availability })));
  const needsLogin = accounts.some(
    (a) => a.availability.availability === 'LOGIN_REQUIRED',
  );
  const needsAttention = accounts.some(
    (a) =>
      a.availability.availability === 'NEEDS_ATTENTION' ||
      a.availability.availability === 'UNAVAILABLE',
  );
  const aiReady =
    anyAiChannelReady === true
      ? true
      : usable > 0 && !needsLogin && !needsAttention;

  const accountSummary: AccountAvailabilitySummary = {
    ready: accounts.filter((a) => a.availability.availability === 'READY').length,
    busy: accounts.filter((a) => a.availability.availability === 'BUSY').length,
    paused: accounts.filter((a) => a.availability.availability === 'PAUSED').length,
    needsAttention: accounts.filter(
      (a) =>
        a.availability.availability !== 'READY' &&
        a.availability.availability !== 'BUSY' &&
        a.availability.availability !== 'PAUSED',
    ).length,
  };

  const project = priorityProject ?? projects.find((p) => p.status !== 'archived') ?? null;
  const sourceReady = project?.health?.source === 'ok';
  const hasSource =
    project?.health?.source === 'ok' || project?.health?.source === 'warn';

  const memoryStale =
    project?.health?.memoryVersion != null && !project.health.memoryVerified;
  const localMemoryReady = !memoryStale;

  const needsAction =
    !aiReady ||
    (project != null && project.health?.source === 'missing') ||
    (project != null && project.health?.source === 'warn') ||
    memoryStale;

  const onboardingComplete = hasProject && hasTranslation && aiReady;

  return {
    aiReady,
    sourceReady,
    localMemoryReady,
    hasProject,
    hasSource,
    hasTranslation,
    needsAction,
    onboardingComplete,
    accountSummary,
  };
}

export function resolveOnboardingSteps(input: {
  projects: ProjectDto[];
  accounts: AccountReadinessInput[];
  hasCompletedJob: boolean;
  priorityProject?: ProjectDto | null;
  anyAiChannelReady?: boolean;
}): OnboardingStep[] {
  const readiness = resolveDashboardReadiness(input);
  const project = input.priorityProject ?? input.projects.find((p) => p.status !== 'archived') ?? null;

  return [
    { id: 'ai', done: readiness.aiReady },
    { id: 'project', done: readiness.hasProject },
    {
      id: 'source',
      done: project != null && (project.health?.source === 'ok' || project.health?.source === 'warn'),
    },
    { id: 'translation', done: readiness.hasTranslation },
  ];
}

export function projectProgressPercent(project: ProjectDto): number {
  const total = project.sourceChapterCount ?? 0;
  const done = project.translatedChapterCount ?? 0;
  if (total <= 0) return 0;
  return Math.round((done / total) * 100);
}
