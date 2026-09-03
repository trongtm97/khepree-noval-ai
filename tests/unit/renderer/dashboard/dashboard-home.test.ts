import { describe, expect, it } from 'vitest';
import type { CampaignListItemDto } from '@shared/schemas/translation-campaign';
import type { AttentionInboxItemDto } from '@shared/schemas/attention-inbox';
import type { JobDto } from '@shared/schemas/job';
import type { ProjectDto } from '@shared/schemas/import';
import {
  hasReadyAccount,
  pickActiveCampaign,
  resolveDashboardSystemNotice,
  resolveNewbieOnboardingSteps,
  resolveRecentCompletions,
  resolveSimpleAccountLanes,
  summarizeAttention,
} from '../../../../src/renderer/features/dashboard/resolve-dashboard-home';

function campaign(
  over: Partial<CampaignListItemDto> & Pick<CampaignListItemDto, 'campaignId' | 'title'>,
): CampaignListItemDto {
  return {
    status: 'DRAFT',
    recipeId: 'balanced',
    recipeMode: 'BALANCED',
    recipeName: 'Balanced',
    projectCount: 1,
    progressPercent: 0,
    completedCount: 0,
    runningCount: 0,
    attentionCount: 0,
    estimatedMinutesMin: null,
    estimatedMinutesMax: null,
    estimateBasis: 'insufficient_history',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...over,
  };
}

describe('Prompt 13 — newbie dashboard home resolvers', () => {
  it('first run: 3 onboarding steps all incomplete', () => {
    const steps = resolveNewbieOnboardingSteps({
      projectCount: 0,
      hasReadyAccount: false,
      hasCompletedJob: false,
    });
    expect(steps).toHaveLength(3);
    expect(steps.every((s) => !s.done)).toBe(true);
  });

  it('no ready account: hasReadyAccount false + needsLogin lane', () => {
    expect(
      hasReadyAccount([{ availability: { availability: 'LOGIN_REQUIRED' } as never }]),
    ).toBe(false);
    const lanes = resolveSimpleAccountLanes([
      { availability: { availability: 'LOGIN_REQUIRED' } },
      { availability: { availability: 'PAUSED' } },
    ]);
    expect(lanes.find((l) => l.lane === 'needsLogin')?.count).toBe(1);
    expect(lanes.find((l) => l.lane === 'resting')?.count).toBe(1);
    expect(lanes.find((l) => l.lane === 'ready')).toBeUndefined();
  });

  it('active campaign picked with ETA hidden when insufficient history', () => {
    const active = pickActiveCampaign([
      campaign({
        campaignId: '11111111-1111-4111-8111-111111111111',
        title: 'Batch A',
        status: 'RUNNING',
        progressPercent: 42,
        runningCount: 2,
        estimateBasis: 'insufficient_history',
        estimatedMinutesMax: 30,
        updatedAt: '2026-02-01T00:00:00.000Z',
      }),
      campaign({
        campaignId: '22222222-2222-4222-8222-222222222222',
        title: 'Old',
        status: 'COMPLETED',
        progressPercent: 100,
        updatedAt: '2026-01-01T00:00:00.000Z',
      }),
    ]);
    expect(active?.title).toBe('Batch A');
    expect(active?.progressPercent).toBe(42);
    expect(active?.showEta).toBe(false);
  });

  it('attention summary exposes next action', () => {
    const items = [
      {
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        titleVi: 'Cần đăng nhập',
        titleEn: 'Login required',
        primaryAction: 'OPEN_LOGIN',
      },
    ] as AttentionInboxItemDto[];
    const summary = summarizeAttention(3, items, 'vi');
    expect(summary.openCount).toBe(3);
    expect(summary.nextTitle).toBe('Cần đăng nhập');
    expect(summary.nextAction).toBe('OPEN_LOGIN');
  });

  it('update available notice wins over announcement; offline wins over update', () => {
    const update = resolveDashboardSystemNotice({
      online: true,
      updatePhase: 'available',
      updateVersion: '1.2.3',
      announcementTitle: 'Server note',
    });
    expect(update?.kind).toBe('update');

    const offline = resolveDashboardSystemNotice({
      online: false,
      updatePhase: 'available',
      updateVersion: '1.2.3',
      announcementTitle: 'Server note',
    });
    expect(offline?.kind).toBe('offline');

    const ann = resolveDashboardSystemNotice({
      online: true,
      updatePhase: 'idle',
      announcementTitle: 'Server note',
    });
    expect(ann?.kind).toBe('announcement');
  });

  it('recent completions from finished jobs only', () => {
    const projects = [
      { id: 'p1', title: 'Novel One' },
    ] as ProjectDto[];
    const jobs = [
      {
        id: 'j1',
        projectId: 'p1',
        state: 'COMPLETED',
        completedAt: '2026-03-01T00:00:00.000Z',
        updatedAt: '2026-03-01T00:00:00.000Z',
      },
      {
        id: 'j2',
        projectId: 'p1',
        state: 'RUNNING',
        updatedAt: '2026-03-02T00:00:00.000Z',
      },
    ] as JobDto[];
    const recent = resolveRecentCompletions({ jobs, projects, maxItems: 5 });
    expect(recent).toHaveLength(1);
    expect(recent[0]?.projectTitle).toBe('Novel One');
  });

  it('simple lanes: ready / running / needsLogin / resting', () => {
    const lanes = resolveSimpleAccountLanes([
      { availability: { availability: 'READY' } },
      { availability: { availability: 'BUSY' } },
      { availability: { availability: 'LOGIN_REQUIRED' } },
      { availability: { availability: 'PAUSED' } },
    ]);
    expect(lanes.map((l) => l.lane).sort()).toEqual(
      ['needsLogin', 'ready', 'resting', 'running'].sort(),
    );
  });
});
