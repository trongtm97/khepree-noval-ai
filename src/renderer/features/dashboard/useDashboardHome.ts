import { useCallback, useEffect, useMemo, useState } from 'react';
import type { CampaignListItemDto } from '@shared/schemas/translation-campaign';
import type { AttentionInboxItemDto } from '@shared/schemas/attention-inbox';
import { getResolvedUiLocale } from '../../i18n';
import { useDashboardData } from './useDashboardData';
import {
  hasReadyAccount,
  pickActiveCampaign,
  resolveNewbieOnboardingSteps,
  resolveRecentCompletions,
  resolveSimpleAccountLanes,
  summarizeAttention,
  type ActiveCampaignSummary,
  type AttentionSummary,
  type NewbieOnboardingStep,
  type RecentCompletionItem,
  type SimpleAccountStatus,
} from './resolve-dashboard-home';

export function useDashboardHome() {
  const base = useDashboardData();
  const [campaigns, setCampaigns] = useState<CampaignListItemDto[]>([]);
  const [attentionItems, setAttentionItems] = useState<AttentionInboxItemDto[]>([]);
  const [attentionOpenCount, setAttentionOpenCount] = useState(0);
  const [online, setOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true,
  );

  const loadExtras = useCallback(async () => {
    const [campRes, attnRes] = await Promise.allSettled([
      window.khepreeNovelAI.translationCampaign.list(),
      window.khepreeNovelAI.attentionInbox.list(),
    ]);
    if (campRes.status === 'fulfilled') {
      setCampaigns(
        Array.isArray(campRes.value.campaigns) ? campRes.value.campaigns : [],
      );
    }
    if (attnRes.status === 'fulfilled') {
      setAttentionItems(
        Array.isArray(attnRes.value.items) ? attnRes.value.items : [],
      );
      setAttentionOpenCount(
        typeof attnRes.value.openCount === 'number' ? attnRes.value.openCount : 0,
      );
    }
  }, []);

  useEffect(() => {
    void loadExtras();
  }, [loadExtras]);

  useEffect(() => {
    const onOnline = () => { setOnline(true); };
    const onOffline = () => { setOnline(false); };
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  useEffect(() => {
    const hasActiveCampaign = campaigns.some((c) =>
      ['STARTING', 'RUNNING', 'PAUSED'].includes(c.status),
    );
    if (!hasActiveCampaign && attentionOpenCount === 0) return;
    const id = window.setInterval(() => {
      void loadExtras();
    }, 10_000);
    return () => { window.clearInterval(id); };
  }, [campaigns, attentionOpenCount, loadExtras]);

  const activeProjects = useMemo(
    () => base.projects.filter((p) => p.status !== 'archived'),
    [base.projects],
  );

  const readyAccount = useMemo(
    () => hasReadyAccount(base.accounts),
    [base.accounts],
  );

  const hasCompletedJob = useMemo(
    () =>
      base.jobs.some(
        (j) => j.state === 'COMPLETED' || j.state === 'ACCEPTED_WITH_WARNINGS',
      ),
    [base.jobs],
  );

  const newbieSteps: NewbieOnboardingStep[] = useMemo(
    () =>
      resolveNewbieOnboardingSteps({
        projectCount: activeProjects.length,
        hasReadyAccount: readyAccount,
        hasCompletedJob,
      }),
    [activeProjects.length, readyAccount, hasCompletedJob],
  );

  const accountLanes: SimpleAccountStatus[] = useMemo(
    () => resolveSimpleAccountLanes(base.accounts),
    [base.accounts],
  );

  const activeCampaign: ActiveCampaignSummary | null = useMemo(() => {
    const titles = new Map(
      base.projects.map((p) => [p.id, p.title] as const),
    );
    return pickActiveCampaign(campaigns, titles);
  }, [campaigns, base.projects]);

  const [campaignCurrentNovel, setCampaignCurrentNovel] = useState<string | null>(
    null,
  );

  useEffect(() => {
    let cancelled = false;
    const id = activeCampaign?.campaignId;
    if (!id) {
      setCampaignCurrentNovel(null);
      return;
    }
    void window.khepreeNovelAI.translationCampaign
      .get(id)
      .then((res) => {
        if (cancelled) return;
        const running = res.campaign.projects.find(
          (p) => p.status === 'RUNNING' || p.status === 'QUEUED',
        );
        setCampaignCurrentNovel((running ?? res.campaign.projects[0])?.title ?? null);
      })
      .catch(() => {
        if (!cancelled) setCampaignCurrentNovel(null);
      });
    return () => {
      cancelled = true;
    };
  }, [activeCampaign?.campaignId]);

  const activeCampaignView = useMemo(() => {
    if (!activeCampaign) return null;
    return {
      ...activeCampaign,
      currentNovelTitle: campaignCurrentNovel ?? activeCampaign.currentNovelTitle,
    };
  }, [activeCampaign, campaignCurrentNovel]);

  const locale = getResolvedUiLocale();
  const attention: AttentionSummary = useMemo(
    () => summarizeAttention(attentionOpenCount, attentionItems, locale),
    [attentionOpenCount, attentionItems, locale],
  );

  const recentCompletions: RecentCompletionItem[] = useMemo(
    () =>
      resolveRecentCompletions({
        jobs: base.jobs,
        projects: base.projects,
        maxItems: 5,
      }),
    [base.jobs, base.projects],
  );

  const refresh = useCallback(() => {
    base.refresh();
    void loadExtras();
  }, [base, loadExtras]);

  return {
    ...base,
    activeProjects,
    readyAccount,
    newbieSteps,
    accountLanes,
    activeCampaign: activeCampaignView,
    attention,
    recentCompletions,
    online,
    refresh,
  };
}
