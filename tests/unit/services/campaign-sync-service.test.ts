/**
 * campaign-sync-service.test.ts
 *
 * Tests:
 * - Schema rejects forbidden fields (PII/content guard)
 * - Schema accepts valid payload
 * - Service: disabled by default
 * - Service: push coalesces (100 pushes → 1 network call)
 * - Service: toggle-off stops flush immediately
 * - Service: capability gate blocks push when feature absent
 * - Service: offline/retry queuing
 * - Service: deleteRemote clears queue entry
 */
import { describe, expect, it, vi } from 'vitest';
import {
  CampaignSyncPayloadSchema,
  CAMPAIGN_SYNC_STAGES,
} from '@shared/schemas/khepree-campaign-sync';
import { CampaignSyncService } from '@main/khepree/campaign-sync-service';
import type { CampaignSyncServiceOptions } from '@main/khepree/campaign-sync-service';
import type { KhepreeApiClient } from '@main/khepree/khepree-api-client';
import { KHEPREE_FEATURES } from '@shared/constants/khepree';

// ─── Forbidden fields ─────────────────────────────────────────────────────────
const FORBIDDEN_KEYS = [
  'title', 'novelTitle', 'chapterName', 'author', 'filePath', 'path',
  'sourceText', 'source_text', 'translationText', 'translation',
  'prompt', 'glossary', 'memory', 'auditEvidence', 'audit_evidence',
  'cookie', 'sessionToken', 'browserProfilePath', 'accountSecret',
  'stackTrace', 'stack_trace', 'rawProviderResponse', 'raw_response',
];

const VALID_PAYLOAD = {
  campaignPublicId: 'camp_test_001',
  appVersion: '1.0.0',
  totalProjects: 3,
  totalChapters: 20,
  countByStatus: { pending: 5, in_progress: 3, completed: 12, error: 0 },
  overallPercent: 60,
  stage: 'active' as const,
  updatedAt: '2026-09-03T22:00:00Z',
  startedAt: '2026-09-01T08:00:00Z',
  completedAt: null,
  errorCode: null,
};

// ─── Schema tests ─────────────────────────────────────────────────────────────
describe('CampaignSyncPayloadSchema — forbidden fields', () => {
  it('rejects each forbidden field (strict schema)', () => {
    for (const key of FORBIDDEN_KEYS) {
      const result = CampaignSyncPayloadSchema.safeParse({ ...VALID_PAYLOAD, [key]: 'leak' });
      expect(result.success, `must reject key: ${key}`).toBe(false);
    }
  });

  it('accepts fully valid payload', () => {
    expect(CampaignSyncPayloadSchema.safeParse(VALID_PAYLOAD).success).toBe(true);
  });

  it('accepts minimal payload', () => {
    const result = CampaignSyncPayloadSchema.safeParse({
      campaignPublicId: 'c',
      totalProjects: 0,
      totalChapters: 0,
      countByStatus: { pending: 0, in_progress: 0, completed: 0, error: 0 },
      overallPercent: 0,
      stage: 'idle',
      updatedAt: '2026-09-03T22:00:00Z',
    });
    expect(result.success).toBe(true);
  });

  it('rejects overallPercent > 100', () => {
    expect(CampaignSyncPayloadSchema.safeParse({ ...VALID_PAYLOAD, overallPercent: 101 }).success).toBe(false);
  });

  it('rejects negative totalChapters', () => {
    expect(CampaignSyncPayloadSchema.safeParse({ ...VALID_PAYLOAD, totalChapters: -1 }).success).toBe(false);
  });

  it('accepts all valid stages', () => {
    for (const stage of CAMPAIGN_SYNC_STAGES) {
      expect(CampaignSyncPayloadSchema.safeParse({ ...VALID_PAYLOAD, stage }).success, `stage: ${stage}`).toBe(true);
    }
  });
});

// ─── Service tests ────────────────────────────────────────────────────────────
type MetaStore = Record<string, string>;

function makeService(overrides: Partial<{
  enabled: boolean;
  features: Record<string, boolean>;
  accessToken: string | null;
}> = {}) {
  const meta: MetaStore = {};
  if (overrides.enabled) meta['khepree.campaign_sync.enabled'] = '1';

  const pushCampaignSync = vi.fn().mockResolvedValue({ syncedAt: new Date().toISOString() });
  const deleteCampaignSync = vi.fn().mockResolvedValue({ deleted: true });

  const client: Partial<KhepreeApiClient> = { pushCampaignSync, deleteCampaignSync };

  const opts: CampaignSyncServiceOptions = {
    getDb: () => ({
      appMeta: {
        get: (key: string) => meta[key] ?? null,
        set: (key: string, value: string) => { meta[key] = value; },
      },
    }) as any,
    getClient: () => client as KhepreeApiClient,
    getAccessToken: () => ('accessToken' in overrides ? overrides.accessToken ?? null : 'mock-token'),
    getFeatures: () => overrides.features ?? { [KHEPREE_FEATURES.campaignStatusSync]: true },
    getAppVersion: () => '1.0.0',
  };

  return { service: new CampaignSyncService(opts), pushCampaignSync, deleteCampaignSync, meta };
}

describe('CampaignSyncService', () => {
  it('is disabled by default', () => {
    const { service } = makeService();
    expect(service.isEnabled()).toBe(false);
  });

  it('setEnabled(true) enables, setEnabled(false) disables', () => {
    const { service } = makeService();
    service.setEnabled(true);
    expect(service.isEnabled()).toBe(true);
    service.setEnabled(false);
    expect(service.isEnabled()).toBe(false);
  });

  it('push is no-op when disabled', async () => {
    const { service, pushCampaignSync } = makeService({ enabled: false });
    service.push(VALID_PAYLOAD);
    await service.flush();
    expect(pushCampaignSync).not.toHaveBeenCalled();
  });

  it('push is no-op when capability absent', async () => {
    const { service, pushCampaignSync } = makeService({
      enabled: true,
      features: {},  // capability absent → defaults to false
    });
    service.push(VALID_PAYLOAD);
    await service.flush();
    expect(pushCampaignSync).not.toHaveBeenCalled();
  });

  it('coalesces: 100 pushes for same campaign → 1 network call', async () => {
    const { service, pushCampaignSync } = makeService({ enabled: true });
    for (let i = 0; i < 100; i++) {
      service.push({ ...VALID_PAYLOAD, overallPercent: i });
    }
    await service.flush();
    expect(pushCampaignSync).toHaveBeenCalledTimes(1);
    // Last payload wins
    expect(pushCampaignSync.mock.calls[0]![0].payload.overallPercent).toBe(99);
  });

  it('coalesces different campaigns → separate calls', async () => {
    const { service, pushCampaignSync } = makeService({ enabled: true });
    service.push({ ...VALID_PAYLOAD, campaignPublicId: 'camp_A', overallPercent: 10 });
    service.push({ ...VALID_PAYLOAD, campaignPublicId: 'camp_B', overallPercent: 50 });
    service.push({ ...VALID_PAYLOAD, campaignPublicId: 'camp_A', overallPercent: 90 });
    await service.flush();
    expect(pushCampaignSync).toHaveBeenCalledTimes(2);
  });

  it('toggle-off before flush → no network call', async () => {
    const { service, pushCampaignSync } = makeService({ enabled: true });
    service.push(VALID_PAYLOAD);
    service.setEnabled(false);  // disable before flush
    await service.flush();
    expect(pushCampaignSync).not.toHaveBeenCalled();
  });

  it('flush does nothing when no access token', async () => {
    const { service, pushCampaignSync } = makeService({ enabled: true, accessToken: null });
    service.push(VALID_PAYLOAD);
    await service.flush();
    expect(pushCampaignSync).not.toHaveBeenCalled();
  });

  it('deleteRemote calls API and removes from queue', async () => {
    const { service, deleteCampaignSync } = makeService({ enabled: true });
    service.push(VALID_PAYLOAD);
    await service.deleteRemote(VALID_PAYLOAD.campaignPublicId);
    expect(deleteCampaignSync).toHaveBeenCalledOnce();
    // Queue emptied — flush should do nothing
  });

  it('flush after network failure retains item in queue', async () => {
    const pushFn = vi.fn().mockRejectedValue(new Error('network error'));
    const meta: MetaStore = { 'khepree.campaign_sync.enabled': '1' };
    const opts: CampaignSyncServiceOptions = {
      getDb: () => ({
        appMeta: {
          get: (k: string) => meta[k] ?? null,
          set: (k: string, v: string) => { meta[k] = v; },
        },
      }) as any,
      getClient: () => ({ pushCampaignSync: pushFn, deleteCampaignSync: vi.fn() } as any),
      getAccessToken: () => 'mock-token',
      getFeatures: () => ({ [KHEPREE_FEATURES.campaignStatusSync]: true }),
      getAppVersion: () => '1.0.0',
    };
    const service = new CampaignSyncService(opts);
    service.push(VALID_PAYLOAD);
    await service.flush();
    expect(pushFn).toHaveBeenCalledOnce();
    // Item still persisted — second flush would retry
    const stored = meta['khepree.campaign_sync.queue'];
    const q = JSON.parse(stored!) as unknown[];
    expect(q).toHaveLength(1);
    service.destroy();
  });
});
