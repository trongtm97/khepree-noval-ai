/**
 * campaign-sync-service.ts
 *
 * Opt-in campaign status sync to Khepree backend.
 *
 * PRIVACY: Only aggregate counts + stage. Never story content, filenames,
 * prompts, glossary, memory, cookies, or any other sensitive data.
 *
 * Default: OFF. User must explicitly enable via toggle.
 * Disabling immediately stops future flushes; queue retained for re-enable.
 */

import { KHEPREE_FEATURES } from '@shared/constants/khepree';
import {
  CampaignSyncPayloadSchema,
  CAMPAIGN_SYNC_PRIVACY_COPY,
  type CampaignSyncPayload,
} from '@shared/schemas/khepree-campaign-sync';
import type { DatabaseManager } from '../db/database-manager';
import { logger } from '../logging/logger';
import type { KhepreeApiClient } from './khepree-api-client';

export { CAMPAIGN_SYNC_PRIVACY_COPY };

// ─── Storage keys (app_meta) ─────────────────────────────────────────────────
const META_ENABLED = 'khepree.campaign_sync.enabled' as const;
const META_QUEUE = 'khepree.campaign_sync.queue' as const;

// ─── Retry ───────────────────────────────────────────────────────────────────
const BACKOFF_MS = [5_000, 15_000, 30_000, 60_000] as const;

export interface CampaignSyncServiceOptions {
  getDb: () => DatabaseManager;
  getClient: () => KhepreeApiClient;
  getAccessToken: () => string | null;
  /** Features from current lease. Used to gate capability. */
  getFeatures: () => Record<string, boolean>;
  /** App version string forwarded to server. */
  getAppVersion: () => string;
}

export class CampaignSyncService {
  /** In-memory coalesced queue: latest payload wins per campaignPublicId. */
  private queue = new Map<string, CampaignSyncPayload>();
  private flushing = false;
  private retryHandle: ReturnType<typeof setTimeout> | null = null;
  private retryAttempt = 0;

  constructor(private readonly opts: CampaignSyncServiceOptions) {
    this.restoreQueue();
  }

  // ─── Public API ────────────────────────────────────────────────────────────

  isEnabled(): boolean {
    try {
      const db = this.opts.getDb();
      return db.appMeta.get(META_ENABLED) === '1';
    } catch {
      return false;
    }
  }

  setEnabled(value: boolean): void {
    try {
      this.opts.getDb().appMeta.set(META_ENABLED, value ? '1' : '0');
    } catch (err) {
      logger.warn('[campaign-sync] Failed to persist enabled flag', { err });
    }
    if (!value) {
      this.cancelRetry();
      // Queue retained in memory/storage — user may re-enable later.
    }
  }

  /**
   * Is the capability active in the current lease?
   * Even if enabled by user, server will reject if capability is off.
   */
  isCapabilityActive(): boolean {
    return this.opts.getFeatures()[KHEPREE_FEATURES.campaignStatusSync] === true;
  }

  /**
   * Enqueue a payload update.
   * Coalesces: latest payload per campaignPublicId wins.
   * Silent no-op if disabled or capability not active.
   */
  push(rawPayload: CampaignSyncPayload): void {
    if (!this.isEnabled() || !this.isCapabilityActive()) return;

    // Validate + strip (strict schema rejects forbidden fields)
    const parsed = CampaignSyncPayloadSchema.safeParse({
      ...rawPayload,
      appVersion: rawPayload.appVersion ?? this.opts.getAppVersion(),
      updatedAt: new Date().toISOString(),
    });
    if (!parsed.success) {
      logger.warn('[campaign-sync] push() rejected invalid payload', {
        errors: parsed.error.errors,
      });
      return;
    }

    this.queue.set(parsed.data.campaignPublicId, parsed.data);
    this.persistQueue();
  }

  /**
   * Send all queued payloads. Skips if disabled, no token, or already flushing.
   * Schedules retry with backoff on network failure.
   */
  async flush(): Promise<void> {
    if (!this.isEnabled() || !this.isCapabilityActive()) return;
    if (this.flushing || this.queue.size === 0) return;

    const token = this.opts.getAccessToken();
    if (!token) return;

    this.flushing = true;
    this.cancelRetry();
    const snapshot = [...this.queue.values()];
    let anyFailed = false;

    try {
      for (const payload of snapshot) {
        const ok = await this.sendOne(token, payload);
        if (ok) {
          this.queue.delete(payload.campaignPublicId);
        } else {
          anyFailed = true;
        }
      }
    } finally {
      this.flushing = false;
      this.persistQueue();
    }

    if (anyFailed) {
      this.scheduleRetry();
    } else {
      this.retryAttempt = 0;
    }
  }

  /** Delete a campaign's synced status from the server and local queue. */
  async deleteRemote(campaignPublicId: string): Promise<void> {
    const token = this.opts.getAccessToken();
    if (!token) throw new Error('Not authenticated');

    try {
      await this.opts.getClient().deleteCampaignSync({ accessToken: token, campaignPublicId });
    } catch (err) {
      logger.warn('[campaign-sync] deleteRemote failed', { campaignPublicId, err });
      throw err;
    }

    this.queue.delete(campaignPublicId);
    this.persistQueue();
  }

  /** Call on app quit / cleanup. */
  destroy(): void {
    this.cancelRetry();
  }

  // ─── Private ───────────────────────────────────────────────────────────────

  private async sendOne(accessToken: string, payload: CampaignSyncPayload): Promise<boolean> {
    try {
      await this.opts.getClient().pushCampaignSync({ accessToken, payload });
      return true;
    } catch (err) {
      logger.debug('[campaign-sync] sendOne failed', { campaignPublicId: payload.campaignPublicId, err });
      return false;
    }
  }

  private scheduleRetry(): void {
    const delayMs = BACKOFF_MS[Math.min(this.retryAttempt, BACKOFF_MS.length - 1)] ?? 60_000;
    this.retryAttempt += 1;
    this.retryHandle = setTimeout(() => {
      this.retryHandle = null;
      void this.flush();
    }, delayMs);
  }

  private cancelRetry(): void {
    if (this.retryHandle != null) {
      clearTimeout(this.retryHandle);
      this.retryHandle = null;
    }
  }

  private persistQueue(): void {
    try {
      const items = [...this.queue.values()];
      this.opts.getDb().appMeta.set(META_QUEUE, JSON.stringify(items));
    } catch (err) {
      logger.warn('[campaign-sync] Failed to persist queue', { err });
    }
  }

  private restoreQueue(): void {
    try {
      const raw = this.opts.getDb().appMeta.get(META_QUEUE);
      if (!raw) return;
      const items: unknown[] = JSON.parse(raw);
      for (const item of items) {
        const parsed = CampaignSyncPayloadSchema.safeParse(item);
        if (parsed.success) {
          this.queue.set(parsed.data.campaignPublicId, parsed.data);
        }
      }
    } catch {
      // Corrupt queue — start fresh silently
    }
  }
}
