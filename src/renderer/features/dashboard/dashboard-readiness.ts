import type { ProjectDto } from '@shared/schemas/import';

export interface AccountReadinessInput {
  status: string;
  workerEnabled?: boolean;
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
}

export interface OnboardingStep {
  id: 'ai' | 'project' | 'source' | 'translation';
  done: boolean;
}

/** Single source for onboarding + dashboard readiness — not per-widget inference. */
export function resolveDashboardReadiness(input: {
  projects: ProjectDto[];
  accounts: AccountReadinessInput[];
  hasCompletedJob: boolean;
  priorityProject?: ProjectDto | null;
}): DashboardReadiness {
  const { projects, accounts, hasCompletedJob, priorityProject } = input;
  const hasProject = projects.length > 0;
  const hasTranslation =
    projects.some((p) => (p.translatedChapterCount ?? 0) > 0) || hasCompletedJob;

  const geminiReady = accounts.some(
    (a) => a.status === 'READY' && a.workerEnabled !== false,
  );
  const needsLogin = accounts.some(
    (a) => a.status === 'LOGIN_REQUIRED' || a.status === 'NEEDS_ATTENTION',
  );
  const aiReady = geminiReady && !needsLogin;

  const project = priorityProject ?? projects.find((p) => p.status !== 'archived') ?? null;
  const sourceReady = project?.health?.source === 'ok';
  const hasSource =
    project?.health?.source === 'ok' || project?.health?.source === 'warn';

  // Local memory auto-inits; only flag when verified mismatch genuinely blocks translation.
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
  };
}

export function resolveOnboardingSteps(input: {
  projects: ProjectDto[];
  accounts: AccountReadinessInput[];
  hasCompletedJob: boolean;
  priorityProject?: ProjectDto | null;
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
