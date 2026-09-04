import { describe, expect, it } from 'vitest';
import { JobListResponseSchema } from '@shared/schemas/job';
import { CampaignListResponseSchema } from '@shared/schemas/translation-campaign';
import { AttentionInboxListResponseSchema } from '@shared/schemas/attention-inbox';
import { AiStatusSnapshotSchema } from '@shared/schemas/ai-auto-setup';
import { AiProviderRoutingResponseSchema } from '@shared/schemas/ai-provider';
import { AccountListResponseSchema } from '@shared/schemas/account';

describe('Production / Settings IPC list contracts', () => {
  it('jobs.list response always exposes jobs as an array', () => {
    expect(JobListResponseSchema.parse({ jobs: [] }).jobs).toEqual([]);
    expect(
      JobListResponseSchema.safeParse({ items: [], total: 0 }).success,
    ).toBe(false);
    expect(JobListResponseSchema.safeParse({ jobs: null }).success).toBe(false);
  });

  it('translationCampaign.list response always exposes campaigns as an array', () => {
    expect(CampaignListResponseSchema.parse({ campaigns: [] }).campaigns).toEqual([]);
    expect(CampaignListResponseSchema.safeParse({ items: [] }).success).toBe(false);
  });

  it('attentionInbox.list response always exposes items as an array', () => {
    expect(
      AttentionInboxListResponseSchema.parse({ items: [], openCount: 0 }).items,
    ).toEqual([]);
    expect(
      AttentionInboxListResponseSchema.safeParse({ items: '[]', openCount: 0 }).success,
    ).toBe(false);
  });

  it('accounts.list response always exposes accounts as an array', () => {
    const parsed = AccountListResponseSchema.parse({
      accounts: [],
      summary: {
        ready: 0,
        busy: 0,
        paused: 0,
        needsAttention: 0,
      },
    });
    expect(Array.isArray(parsed.accounts)).toBe(true);
  });

  it('autoSetupStatus providerHealth is always an array', () => {
    const parsed = AiStatusSnapshotSchema.parse({
      ready: false,
      usableAccountCount: 0,
      aiPreference: 'AUTO',
      providerHealth: [
        { preference: 'GEMINI', ok: false, accountCount: 0 },
        { preference: 'CHATGPT', ok: false, accountCount: 0 },
        { preference: 'META_AI', ok: false, accountCount: 0 },
      ],
      loginRequired: null,
    });
    expect(Array.isArray(parsed.providerHealth)).toBe(true);
    expect(
      AiStatusSnapshotSchema.safeParse({
        ready: false,
        usableAccountCount: 0,
        aiPreference: 'AUTO',
        providerHealth: { GEMINI: false },
        loginRequired: null,
      }).success,
    ).toBe(false);
  });

  it('getRouting providerHealth is always an array', () => {
    const parsed = AiProviderRoutingResponseSchema.parse({
      aiPreference: 'AUTO',
      primaryProviderId: null,
      globalPrimaryProviderId: null,
      fallbackEnabled: true,
      routingMode: 'AUTO',
      providerHealth: [
        { preference: 'GEMINI', ok: false, status: 'UNKNOWN' },
        { preference: 'CHATGPT', ok: false, status: 'UNKNOWN' },
        { preference: 'META_AI', ok: false, status: 'UNKNOWN' },
      ],
    });
    expect(Array.isArray(parsed.providerHealth)).toBe(true);
  });
});

describe('Series style-rules IPC contract', () => {
  it('listStyleRules returns { rules: array }, never a bare array', async () => {
    const { ListSeriesStyleRulesResponseSchema } = await import(
      '@shared/schemas/fiction-series'
    );
    expect(
      ListSeriesStyleRulesResponseSchema.parse({ rules: [] }).rules,
    ).toEqual([]);
    expect(ListSeriesStyleRulesResponseSchema.safeParse([]).success).toBe(false);
  });
});
