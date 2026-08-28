import { describe, expect, it } from 'vitest';
import { mockAccountAvailability } from '../../../helpers/account-availability-fixtures';
import { resolveBreadcrumb } from '../../../../src/renderer/features/dashboard/resolve-breadcrumb';
import {
  resolveDashboardReadiness,
  resolveOnboardingSteps,
  projectProgressPercent,
} from '../../../../src/renderer/features/dashboard/dashboard-readiness';
import {
  resolvePriorityProject,
  isProjectComplete,
} from '../../../../src/renderer/features/dashboard/resolve-priority-project';
import { resolveDashboardActions } from '../../../../src/renderer/features/dashboard/resolve-dashboard-actions';
import { resolveRecentActivity } from '../../../../src/renderer/features/dashboard/resolve-recent-activity';
import type { ProjectDto } from '@shared/schemas/import';
import type { JobDto } from '@shared/schemas/job';

function project(over: Partial<ProjectDto> & Pick<ProjectDto, 'id' | 'title'>): ProjectDto {
  return {
    sourceLanguage: 'zh-Hans',
    targetLanguage: 'vi',
    genre: null,
    description: null,
    status: 'active',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-10T12:00:00.000Z',
    sourceChapterCount: 184,
    translatedChapterCount: 15,
    reviewedChapterCount: 0,
    queuedChapterCount: 0,
    errorChapterCount: 0,
    nextUntranslatedChapter: 16,
    activeEditionId: null,
    sourceLanguageMode: 'AUTO',
    sourceLanguageHint: null,
    sourceLanguageConfidence: null,
    sourceLanguageDetectionMethod: null,
    sourceLanguageDetectionCheckedAt: null,
    health: {
      source: 'ok',
      google: 'ok',
      notebook: 'missing',
      memoryVersion: 65,
      memoryVerified: true,
    },
    ...over,
  };
}

describe('resolveBreadcrumb', () => {
  it('returns only Overview on global dashboard', () => {
    expect(resolveBreadcrumb('/', { id: 'p1', name: 'Truyện 1' })).toEqual([
      { labelKey: 'nav.dashboard' },
    ]);
  });

  it('shows project on translation route only', () => {
    expect(resolveBreadcrumb('/translation', { id: 'p1', name: 'Truyện 1' })).toEqual([
      { labelKey: 'nav.translation' },
      { text: 'Truyện 1' },
    ]);
  });

  it('does not append project on /jobs', () => {
    expect(resolveBreadcrumb('/jobs', { id: 'p1', name: 'Truyện 1' })).toEqual([
      { labelKey: 'nav.jobs' },
    ]);
  });
});

describe('resolvePriorityProject', () => {
  const projects = [
    project({ id: 'a', title: 'A', updatedAt: '2026-01-01T00:00:00.000Z' }),
    project({ id: 'b', title: 'B', updatedAt: '2026-01-05T00:00:00.000Z' }),
  ];

  it('prefers lastTranslationProjectId', () => {
    const picked = resolvePriorityProject({
      projects,
      lastTranslationProjectId: 'a',
      currentProjectId: 'b',
    });
    expect(picked?.id).toBe('a');
  });

  it('falls back to most recently updated incomplete project', () => {
    const picked = resolvePriorityProject({
      projects,
      lastTranslationProjectId: null,
      currentProjectId: null,
    });
    expect(picked?.id).toBe('b');
  });
});

describe('projectProgressPercent', () => {
  it('uses translatedChapterCount / sourceChapterCount', () => {
    const pct = projectProgressPercent(project({ id: 'x', title: 'X' }));
    expect(pct).toBe(Math.round((15 / 184) * 100));
  });

  it('does not treat chapterCount alias as translated', () => {
    const pct = projectProgressPercent(
      project({
        id: 'x',
        title: 'X',
        chapterCount: 999,
        translatedChapterCount: 15,
        sourceChapterCount: 184,
      }),
    );
    expect(pct).not.toBe(Math.round((15 / 999) * 100));
  });
});

describe('resolveDashboardReadiness', () => {
  it('auto-completes onboarding when project + translation + AI ready', () => {
    const readiness = resolveDashboardReadiness({
      projects: [project({ id: 'x', title: 'X' })],
      accounts: [{ availability: mockAccountAvailability({ availability: 'READY' }) }],
      hasCompletedJob: false,
      priorityProject: project({ id: 'x', title: 'X', translatedChapterCount: 1 }),
    });
    expect(readiness.onboardingComplete).toBe(true);
  });

  it('does not require notebook for readiness', () => {
    const readiness = resolveDashboardReadiness({
      projects: [
        project({
          id: 'x',
          title: 'X',
          health: {
            source: 'ok',
            google: 'ok',
            notebook: 'missing',
            memoryVersion: null,
            memoryVerified: false,
          },
        }),
      ],
      accounts: [{ availability: mockAccountAvailability({ availability: 'READY' }) }],
      hasCompletedJob: true,
    });
    expect(readiness.localMemoryReady).toBe(true);
  });
});

describe('resolveOnboardingSteps', () => {
  it('excludes notebook as required step', () => {
    const steps = resolveOnboardingSteps({
      projects: [project({ id: 'x', title: 'X' })],
      accounts: [{ availability: mockAccountAvailability({ availability: 'READY' }) }],
      hasCompletedJob: true,
    });
    expect(steps.map((s: { id: string }) => s.id)).toEqual(['ai', 'project', 'source', 'translation']);
  });
});

describe('resolveDashboardActions', () => {
  it('returns empty when healthy', () => {
    const actions = resolveDashboardActions({
      projects: [project({ id: 'x', title: 'X' })],
      jobs: [],
      accounts: [{ id: 'a1', availability: mockAccountAvailability({ availability: 'READY' }) }],
      termsReviewCount: 0,
      termCandidatesByProject: new Map(),
      sourceModifiedByProject: new Map(),
      characterConflictsByProject: new Map(),
    });
    expect(actions).toHaveLength(0);
  });

  it('surfaces term review and AI login', () => {
    const actions = resolveDashboardActions({
      projects: [project({ id: 'x', title: 'X' })],
      jobs: [],
      accounts: [{ id: 'a1', availability: mockAccountAvailability({ availability: 'LOGIN_REQUIRED', uiLane: 'login' }) }],
      termsReviewCount: 5,
      termCandidatesByProject: new Map(),
      sourceModifiedByProject: new Map(),
      characterConflictsByProject: new Map(),
    });
    expect(actions.some((a: { id: string }) => a.id === 'ai-login')).toBe(true);
    expect(actions.some((a: { id: string }) => a.id === 'terms-review')).toBe(true);
  });

  it('does not warn for unconfigured notebook alone', () => {
    const actions = resolveDashboardActions({
      projects: [
        project({
          id: 'x',
          title: 'X',
          health: {
            source: 'ok',
            google: 'ok',
            notebook: 'missing',
            memoryVersion: 65,
            memoryVerified: true,
          },
        }),
      ],
      jobs: [],
      accounts: [{ id: 'a1', availability: mockAccountAvailability({ availability: 'READY' }) }],
      termsReviewCount: 0,
      termCandidatesByProject: new Map(),
      sourceModifiedByProject: new Map(),
      characterConflictsByProject: new Map(),
    });
    expect(actions.some((a: { messageKey: string }) => a.messageKey.includes('Notebook'))).toBe(false);
    expect(actions.some((a: { messageKey: string }) => a.messageKey.includes('v65'))).toBe(false);
  });
});

describe('resolveRecentActivity', () => {
  it('builds user-facing completion events', () => {
    const jobs: JobDto[] = [
      {
        id: '11111111-1111-4111-8111-111111111111',
        projectId: 'x',
        type: 'TRANSLATE',
        state: 'COMPLETED',
        workerId: null,
        priority: 0,
        chapterFrom: 15,
        chapterTo: 15,
        workerMode: 'POOL',
        pinnedAccountId: null,
        attemptCount: 1,
        error: null,
        pausedReason: null,
        maxRepairAttempts: 2,
        repairRound: 0,
        lastQa: null,
        lastParsed: null,
        attentionActions: [],
        progress: null,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T01:00:00.000Z',
        startedAt: null,
        completedAt: '2026-01-01T01:00:00.000Z',
      },
    ];
    const events = resolveRecentActivity({
      jobs,
      projects: [project({ id: 'x', title: 'Truyện 1' })],
    });
    expect(events).toHaveLength(1);
    expect(events[0].messageKey).toBe('dashboard.activityChapterTranslated');
  });
});

describe('isProjectComplete', () => {
  it('detects completed project', () => {
    expect(
      isProjectComplete(
        project({ id: 'x', title: 'X', translatedChapterCount: 184, sourceChapterCount: 184 }),
      ),
    ).toBe(true);
  });
});

describe('nextUntranslatedChapter', () => {
  it('uses resolver field not translated+1 heuristic in priority card data', () => {
    const p = project({
      id: 'x',
      title: 'X',
      translatedChapterCount: 10,
      nextUntranslatedChapter: 15,
    });
    expect(p.nextUntranslatedChapter).toBe(15);
    expect(p.nextUntranslatedChapter).not.toBe(11);
  });
});
