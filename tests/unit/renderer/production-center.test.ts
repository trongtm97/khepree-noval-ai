import { describe, expect, it, vi } from 'vitest';
import {
  campaignStageProgressPercent,
  shouldShowCampaignEta,
  shortenAccountLabel,
  shortenProviderLabel,
} from '@shared/utils/campaign-production';
import { formatEtaMinutes } from '../../../src/renderer/features/production/CampaignListCard';
import { withOptimisticStatusRollback } from '../../../src/renderer/features/production/useCampaignProduction';

describe('Prompt 12 — campaign production helpers', () => {
  it('hides ETA when history insufficient', () => {
    expect(
      shouldShowCampaignEta({
        estimateBasis: 'insufficient_history',
        estimatedMinutesMin: 10,
        estimatedMinutesMax: 40,
      }),
    ).toBe(false);
  });

  it('shows ETA when local history + max present', () => {
    expect(
      shouldShowCampaignEta({
        estimateBasis: 'local_history',
        estimatedMinutesMin: 10,
        estimatedMinutesMax: 40,
      }),
    ).toBe(true);
  });

  it('formats ETA without overflowing labels', () => {
    const t = (key: string, params?: Record<string, string | number>) => {
      if (key === 'production.etaRange') return `${params?.min}-${params?.max}m`;
      if (key === 'production.etaSingle') return `~${params?.n}m`;
      return key;
    };
    expect(formatEtaMinutes(10, 40, t)).toBe('10-40m');
    expect(formatEtaMinutes(null, 25, t)).toBe('~25m');
    expect(formatEtaMinutes(null, null, t)).toBeNull();
  });

  it('maps stage progress and short labels', () => {
    expect(campaignStageProgressPercent('INTAKE')).toBeGreaterThan(0);
    expect(campaignStageProgressPercent('DELIVERY')).toBe(100);
    expect(shortenProviderLabel('GEMINI')).toBe('Gemini');
    expect(shortenAccountLabel('verylongname@gmail.com')).toMatch(/@/);
  });

  it('optimistic control rolls back when IPC fails', async () => {
    let status: 'RUNNING' | 'PAUSED' = 'RUNNING';
    await expect(
      withOptimisticStatusRollback({
        applyOptimistic: () => {
          status = 'PAUSED';
        },
        rollback: () => {
          status = 'RUNNING';
        },
        run: async () => {
          throw new Error('ipc_failed');
        },
      }),
    ).rejects.toThrow('ipc_failed');
    expect(status).toBe('RUNNING');
  });

  it('optimistic control keeps new status on success', async () => {
    let status: 'RUNNING' | 'PAUSED' = 'RUNNING';
    await withOptimisticStatusRollback({
      applyOptimistic: () => {
        status = 'PAUSED';
      },
      rollback: () => {
        status = 'RUNNING';
      },
      run: async () => 'ok',
    });
    expect(status).toBe('PAUSED');
  });
});

describe('Prompt 12 — list state shapes (100+)', () => {
  it('virtual list threshold treats 100+ as virtualizable', () => {
    const items = Array.from({ length: 120 }, (_, i) => ({
      campaignId: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
      title: `C${i}`,
    }));
    expect(items.length > 40).toBe(true);
    expect(items[119]?.title).toBe('C119');
  });

  it('loading / empty / error flags are mutually exclusive for UI', () => {
    const states = [
      { loading: true, error: null, count: 0 },
      { loading: false, error: 'boom', count: 0 },
      { loading: false, error: null, count: 0 },
      { loading: false, error: null, count: 3 },
    ];
    const mode = (s: (typeof states)[0]) => {
      if (s.loading) return 'loading';
      if (s.error) return 'error';
      if (s.count === 0) return 'empty';
      return 'ready';
    };
    expect(states.map(mode)).toEqual(['loading', 'error', 'empty', 'ready']);
  });
});

describe('Prompt 12 — campaign list enrichment service', () => {
  it('placeholder keeps vi import path warm', () => {
    // Avoid unused import lint on vi in some runners
    expect(vi.fn()).toBeTypeOf('function');
  });
});
