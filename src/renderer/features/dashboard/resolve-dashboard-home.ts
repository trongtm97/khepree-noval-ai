import type { CampaignListItemDto } from '@shared/schemas/translation-campaign';
import type { AttentionInboxItemDto } from '@shared/schemas/attention-inbox';
import type { GoogleAccountDto } from '@shared/schemas/account';
import type { JobDto } from '@shared/schemas/job';
import type { ProjectDto } from '@shared/schemas/import';
import { shouldShowCampaignEta } from '@shared/utils/campaign-production';
import { isJobCompleted } from '@shared/utils/job-progress';

/** Simple account lane for newbies — no worker/lease jargon. */
export type SimpleAccountLane = 'ready' | 'running' | 'needsLogin' | 'resting';

export interface SimpleAccountStatus {
  lane: SimpleAccountLane;
  count: number;
}

export interface NewbieOnboardingStep {
  id: 'import' | 'account' | 'translate';
  done: boolean;
}

export type DashboardSystemNoticeKind =
  | 'offline'
  | 'update'
  | 'announcement'
  | null;

export interface DashboardSystemNotice {
  kind: Exclude<DashboardSystemNoticeKind, null>;
  titleKey: string;
  bodyKey?: string;
  actionKey?: string;
  actionRoute?: string;
  /** Extra params for i18n */
  params?: Record<string, string | number>;
}

export interface ActiveCampaignSummary {
  campaignId: string;
  title: string;
  status: string;
  progressPercent: number;
  currentNovelTitle: string | null;
  estimatedMinutesMin: number | null;
  estimatedMinutesMax: number | null;
  showEta: boolean;
}

export interface AttentionSummary {
  openCount: number;
  nextTitle: string | null;
  nextAction: string | null;
  nextItemId: string | null;
}

export interface RecentCompletionItem {
  id: string;
  projectId: string;
  projectTitle: string;
  completedAt: string;
}

const ACTIVE_CAMPAIGN_STATUSES = new Set([
  'STARTING',
  'RUNNING',
  'PAUSED',
]);

export function resolveSimpleAccountLanes(
  accounts: Array<{ availability?: { availability?: string } | null; status?: string }>,
): SimpleAccountStatus[] {
  const counts: Record<SimpleAccountLane, number> = {
    ready: 0,
    running: 0,
    needsLogin: 0,
    resting: 0,
  };

  for (const acc of accounts) {
    const avail = (acc.availability?.availability ?? acc.status ?? '').toUpperCase();
    if (avail === 'READY') counts.ready += 1;
    else if (avail === 'BUSY') counts.running += 1;
    else if (
      avail === 'LOGIN_REQUIRED' ||
      avail === 'NEEDS_ATTENTION' ||
      avail === 'UNAVAILABLE' ||
      avail === 'CAPTCHA_REQUIRED'
    ) {
      counts.needsLogin += 1;
    } else {
      counts.resting += 1;
    }
  }

  return (Object.keys(counts) as SimpleAccountLane[])
    .map((lane) => ({ lane, count: counts[lane] }))
    .filter((row) => row.count > 0);
}

export function hasReadyAccount(
  accounts: Array<{ availability?: { availability?: string } | null; status?: string }>,
): boolean {
  return accounts.some((a) => {
    const avail = (a.availability?.availability ?? a.status ?? '').toUpperCase();
    return avail === 'READY' || avail === 'BUSY';
  });
}

/** 3 short steps when starting from zero. */
export function resolveNewbieOnboardingSteps(input: {
  projectCount: number;
  hasReadyAccount: boolean;
  hasCompletedJob: boolean;
}): NewbieOnboardingStep[] {
  return [
    { id: 'import', done: input.projectCount > 0 },
    { id: 'account', done: input.hasReadyAccount },
    {
      id: 'translate',
      done: input.hasCompletedJob || (input.projectCount > 0 && input.hasReadyAccount),
    },
  ];
}

export function pickActiveCampaign(
  campaigns: CampaignListItemDto[],
  projectTitleById?: Map<string, string>,
): ActiveCampaignSummary | null {
  const active = campaigns
    .filter((c) => ACTIVE_CAMPAIGN_STATUSES.has(c.status))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
  if (!active) return null;

  // List DTO has no current novel — surface first attention/running hint via counts.
  let currentNovelTitle: string | null = null;
  if (active.runningCount > 0 && projectTitleById && projectTitleById.size > 0) {
    currentNovelTitle = [...projectTitleById.values()][0] ?? null;
  }

  return {
    campaignId: active.campaignId,
    title: active.title,
    status: active.status,
    progressPercent: active.progressPercent,
    currentNovelTitle,
    estimatedMinutesMin: active.estimatedMinutesMin,
    estimatedMinutesMax: active.estimatedMinutesMax,
    showEta: shouldShowCampaignEta(active),
  };
}

export function summarizeAttention(
  openCount: number,
  items: AttentionInboxItemDto[],
  locale: 'vi' | 'en' = 'vi',
): AttentionSummary {
  const next = items[0] ?? null;
  return {
    openCount,
    nextTitle: next
      ? locale === 'vi'
        ? next.titleVi
        : next.titleEn
      : null,
    nextAction: next?.primaryAction ?? null,
    nextItemId: next?.id ?? null,
  };
}

export function resolveRecentCompletions(input: {
  jobs: JobDto[];
  projects: ProjectDto[];
  maxItems?: number;
}): RecentCompletionItem[] {
  const { jobs, projects, maxItems = 5 } = input;
  const title = (id: string) => projects.find((p) => p.id === id)?.title ?? id;
  return jobs
    .filter((j) => isJobCompleted(j.state))
    .sort((a, b) =>
      (b.completedAt ?? b.updatedAt).localeCompare(a.completedAt ?? a.updatedAt),
    )
    .slice(0, maxItems)
    .map((j) => ({
      id: j.id,
      projectId: j.projectId,
      projectTitle: title(j.projectId),
      completedAt: j.completedAt ?? j.updatedAt,
    }));
}

/**
 * Single system notice — never stack modals.
 * Priority: offline > update available > announcement.
 */
export function resolveDashboardSystemNotice(input: {
  online: boolean;
  updatePhase?: string | null;
  updateVersion?: string | null;
  announcementTitle?: string | null;
}): DashboardSystemNotice | null {
  if (!input.online) {
    return {
      kind: 'offline',
      titleKey: 'dashboard.notice.offlineTitle',
      bodyKey: 'dashboard.notice.offlineBody',
    };
  }
  const phase = input.updatePhase ?? '';
  if (phase === 'available' || phase === 'downloaded' || phase === 'downloading') {
    return {
      kind: 'update',
      titleKey: 'dashboard.notice.updateTitle',
      bodyKey: 'dashboard.notice.updateBody',
      actionKey: 'dashboard.notice.updateAction',
      actionRoute: '/settings',
      params: { version: input.updateVersion ?? '' },
    };
  }
  if (input.announcementTitle) {
    return {
      kind: 'announcement',
      titleKey: 'dashboard.notice.announcementTitle',
      bodyKey: 'dashboard.notice.announcementBody',
      params: { title: input.announcementTitle },
    };
  }
  return null;
}

export function accountLaneLabelKey(lane: SimpleAccountLane): string {
  switch (lane) {
    case 'ready':
      return 'dashboard.accountLane.ready';
    case 'running':
      return 'dashboard.accountLane.running';
    case 'needsLogin':
      return 'dashboard.accountLane.needsLogin';
    case 'resting':
      return 'dashboard.accountLane.resting';
    default:
      return 'dashboard.accountLane.resting';
  }
}

/** Type helper for GoogleAccountDto consumers. */
export type DashboardAccountLike = Pick<GoogleAccountDto, 'id'> & {
  availability?: GoogleAccountDto['availability'];
  status?: string;
};
