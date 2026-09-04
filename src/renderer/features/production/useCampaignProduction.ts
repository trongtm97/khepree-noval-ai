import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  CampaignDetailDto,
  CampaignListItemDto,
} from '@shared/schemas/translation-campaign';
import type { TranslationCampaignStatus } from '@shared/constants/translation-campaign';

export type ProductionTab = 'campaigns' | 'queue' | 'attention';

export function useCampaignList(pollMs = 8000) {
  const [campaigns, setCampaigns] = useState<CampaignListItemDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await window.khepreeNovelAI.translationCampaign.list();
      setCampaigns(res.campaigns);
      setError(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'list_failed');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => {
      void refresh();
    }, pollMs);
    return () => { clearInterval(timer); };
  }, [refresh, pollMs]);

  return { campaigns, loading, error, refresh };
}

export function useCampaignDetail(campaignId: string | undefined, pollMs = 5000) {
  const [campaign, setCampaign] = useState<CampaignDetailDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [optimisticStatus, setOptimisticStatus] =
    useState<TranslationCampaignStatus | null>(null);
  const rollbackRef = useRef<TranslationCampaignStatus | null>(null);

  const refresh = useCallback(async () => {
    if (!campaignId) return;
    try {
      const res = await window.khepreeNovelAI.translationCampaign.get(campaignId);
      setCampaign(res.campaign);
      setOptimisticStatus(null);
      setError(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'get_failed');
    } finally {
      setLoading(false);
    }
  }, [campaignId]);

  useEffect(() => {
    setLoading(true);
    void refresh();
    if (!campaignId) return;
    const timer = setInterval(() => {
      void refresh();
    }, pollMs);
    return () => { clearInterval(timer); };
  }, [campaignId, refresh, pollMs]);

  const displayStatus = optimisticStatus ?? campaign?.status ?? null;

  const runControl = useCallback(
    async (action: 'pause' | 'resume' | 'cancel') => {
      if (!campaignId || !campaign) return;
      const next: TranslationCampaignStatus =
        action === 'pause'
          ? 'PAUSED'
          : action === 'resume'
            ? 'RUNNING'
            : 'CANCELLED';
      rollbackRef.current = campaign.status;
      setOptimisticStatus(next);
      try {
        if (action === 'pause') {
          await window.khepreeNovelAI.translationCampaign.pause(campaignId);
        } else if (action === 'resume') {
          await window.khepreeNovelAI.translationCampaign.resume(campaignId);
        } else {
          await window.khepreeNovelAI.translationCampaign.cancel(campaignId);
        }
        await refresh();
      } catch (err: unknown) {
        setOptimisticStatus(rollbackRef.current);
        setError(err instanceof Error ? err.message : 'control_failed');
        throw err;
      }
    },
    [campaign, campaignId, refresh],
  );

  return {
    campaign,
    loading,
    error,
    displayStatus,
    refresh,
    runControl,
    setError,
  };
}

/** Pure helper for tests — optimistic rollback path. */
export async function withOptimisticStatusRollback<T>(opts: {
  applyOptimistic: () => void;
  rollback: () => void;
  run: () => Promise<T>;
}): Promise<T> {
  opts.applyOptimistic();
  try {
    return await opts.run();
  } catch (err) {
    opts.rollback();
    throw err;
  }
}
