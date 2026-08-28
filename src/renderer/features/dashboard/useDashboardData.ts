import { useCallback, useEffect, useMemo, useState } from 'react';
import type { JobDto } from '@shared/schemas/job';
import type { ProjectDto } from '@shared/schemas/import';
import type { GoogleAccountDto } from '@shared/schemas/account';
import { isJobActive } from '@shared/utils/job-progress';
import { useUiShellStore } from '../../stores/ui-shell-store';
import { resolvePriorityProject } from './resolve-priority-project';
import {
  resolveDashboardActions,
  countCharacterConflicts,
  type DashboardActionItem,
} from './resolve-dashboard-actions';
import {
  resolveDashboardReadiness,
  resolveOnboardingSteps,
  type DashboardReadiness,
  type OnboardingStep,
} from './dashboard-readiness';
import { resolveRecentActivity, type DashboardActivityEvent } from './resolve-recent-activity';

export interface DashboardData {
  projects: ProjectDto[];
  jobs: JobDto[];
  accounts: GoogleAccountDto[];
  priorityProject: ProjectDto | null;
  priorityNewChapterCount: number;
  runningJobs: JobDto[];
  actions: DashboardActionItem[];
  activity: DashboardActivityEvent[];
  readiness: DashboardReadiness;
  onboardingSteps: OnboardingStep[];
  loading: boolean;
  essentialError: string | null;
  partialErrors: string[];
  refresh: () => void;
}

export function useDashboardData(): DashboardData {
  const lastTranslationProjectId = useUiShellStore((s) => s.lastTranslationProjectId);
  const currentProjectId = useUiShellStore((s) => s.currentProjectId);

  const [projects, setProjects] = useState<ProjectDto[]>([]);
  const [jobs, setJobs] = useState<JobDto[]>([]);
  const [accounts, setAccounts] = useState<GoogleAccountDto[]>([]);
  const [termsReviewCount, setTermsReviewCount] = useState(0);
  const [termCandidatesByProject, setTermCandidatesByProject] = useState<Map<string, number>>(
    new Map(),
  );
  const [sourceModifiedByProject, setSourceModifiedByProject] = useState<Map<string, number>>(
    new Map(),
  );
  const [characterConflictsByProject, setCharacterConflictsByProject] = useState<
    Map<string, number>
  >(new Map());
  const [sourceNewByProject, setSourceNewByProject] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(true);
  const [essentialError, setEssentialError] = useState<string | null>(null);
  const [partialErrors, setPartialErrors] = useState<string[]>([]);

  const load = useCallback(async (options?: { silent?: boolean }) => {
    if (!options?.silent) {
      setLoading(true);
      setEssentialError(null);
      setPartialErrors([]);
    }

    const errors: string[] = [];

    const [projectsRes, jobsRes, accountsRes, termsRes] = await Promise.allSettled([
      window.novelTrans.projects.list(),
      window.novelTrans.jobs.list(undefined),
      window.novelTrans.accounts.list(),
      window.novelTrans.terms.reviewQueue(),
    ]);

    if (projectsRes.status === 'rejected') {
      if (!options?.silent) {
        setEssentialError(
          projectsRes.reason instanceof Error
            ? projectsRes.reason.message
            : 'Failed to load projects',
        );
        setLoading(false);
      }
      return;
    }

    const projectList = projectsRes.value.projects;
    setProjects(projectList);

    if (jobsRes.status === 'fulfilled') {
      setJobs(jobsRes.value.jobs);
    } else {
      errors.push('jobs');
    }

    if (accountsRes.status === 'fulfilled') {
      setAccounts(accountsRes.value.accounts);
    } else {
      errors.push('accounts');
    }

    if (termsRes.status === 'fulfilled') {
      setTermsReviewCount(termsRes.value.terms.length);
    } else {
      errors.push('terms');
    }

    const activeProjects = projectList.filter((p) => p.status !== 'archived').slice(0, 5);
    const candidateMap = new Map<string, number>();
    const sourceMap = new Map<string, number>();
    const newChapterMap = new Map<string, number>();
    const conflictMap = new Map<string, number>();

    await Promise.allSettled(
      activeProjects.map(async (project) => {
        const [candidatesRes, sourceRes, charactersRes] = await Promise.allSettled([
          window.novelTrans.terms.listCandidates({ projectId: project.id }),
          window.novelTrans.sourceFolder.getStatus(project.id),
          window.novelTrans.memory.listCharacters(project.id),
        ]);

        if (candidatesRes.status === 'fulfilled') {
          candidateMap.set(project.id, candidatesRes.value.candidates.length);
        }
        if (sourceRes.status === 'fulfilled' && sourceRes.value.scanSummary) {
          const modified = sourceRes.value.scanSummary.modifiedCount;
          const newCount = sourceRes.value.scanSummary.newCount;
          if (modified > 0) sourceMap.set(project.id, modified);
          if (newCount > 0) newChapterMap.set(project.id, newCount);
        }
        if (charactersRes.status === 'fulfilled') {
          const conflicts = countCharacterConflicts(charactersRes.value.characters);
          if (conflicts > 0) conflictMap.set(project.id, conflicts);
        }
      }),
    );

    setTermCandidatesByProject(candidateMap);
    setSourceModifiedByProject(sourceMap);
    setSourceNewByProject(newChapterMap);
    setCharacterConflictsByProject(conflictMap);
    setPartialErrors(errors);
    if (!options?.silent) setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const hasRunning = jobs.some((j) => isJobActive(j.state));
    if (!hasRunning) return;
    const id = window.setInterval(() => {
      void load({ silent: true });
    }, 8000);
    return () => {
      window.clearInterval(id);
    };
  }, [jobs, load]);

  const priorityProject = useMemo(
    () =>
      resolvePriorityProject({
        projects,
        lastTranslationProjectId,
        currentProjectId,
      }),
    [projects, lastTranslationProjectId, currentProjectId],
  );

  const runningJobs = useMemo(
    () => jobs.filter((j) => isJobActive(j.state)).slice(0, 5),
    [jobs],
  );

  const hasCompletedJob = useMemo(
    () => jobs.some((j) => j.state === 'COMPLETED' || j.state === 'ACCEPTED_WITH_WARNINGS'),
    [jobs],
  );

  const readiness = useMemo(
    () =>
      resolveDashboardReadiness({
        projects,
        accounts: accounts.map((a) => ({ availability: a.availability })),
        hasCompletedJob,
        priorityProject,
      }),
    [projects, accounts, hasCompletedJob, priorityProject],
  );

  const actions = useMemo(
    () =>
      resolveDashboardActions({
        projects,
        jobs,
        accounts,
        termsReviewCount,
        termCandidatesByProject,
        sourceModifiedByProject,
        characterConflictsByProject,
        priorityProjectId: priorityProject?.id ?? null,
      }),
    [
      projects,
      jobs,
      accounts,
      termsReviewCount,
      termCandidatesByProject,
      sourceModifiedByProject,
      characterConflictsByProject,
      priorityProject,
    ],
  );

  const activity = useMemo(
    () => resolveRecentActivity({ jobs, projects, maxItems: 8 }),
    [jobs, projects],
  );

  const onboardingSteps = useMemo(
    () =>
      resolveOnboardingSteps({
        projects,
        accounts,
        hasCompletedJob,
        priorityProject,
      }),
    [projects, accounts, hasCompletedJob, priorityProject],
  );

  const priorityNewChapterCount =
    priorityProject != null ? (sourceNewByProject.get(priorityProject.id) ?? 0) : 0;

  return {
    projects,
    jobs,
    accounts,
    priorityProject,
    priorityNewChapterCount,
    runningJobs,
    actions,
    activity,
    readiness,
    onboardingSteps,
    loading,
    essentialError,
    partialErrors,
    refresh: () => {
      void load();
    },
  };
}
