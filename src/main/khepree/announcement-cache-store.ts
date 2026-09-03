import type { DatabaseManager } from '../db/database-manager';
import type { DesktopAnnouncementItem } from '@shared/schemas/khepree-announcements';
import { KHEPREE_ANNOUNCEMENT_CACHE_MAX } from '@shared/constants/khepree';

const META_LAST_SYNC = 'khepree.announcements.last_synced_at';
const META_PENDING_READS = 'khepree.announcements.pending_reads';
const META_PENDING_DISMISSES = 'khepree.announcements.pending_dismisses';
const META_ITEMS = 'khepree.announcements.cache';

export interface CachedAnnouncement extends DesktopAnnouncementItem {
  cachedAt: string;
}

export class AnnouncementCacheStore {
  constructor(private readonly getDb: () => DatabaseManager) {}

  getLastSyncedAt(): string | null {
    return this.getDb().appMeta.get(META_LAST_SYNC);
  }

  setLastSyncedAt(iso: string): void {
    this.getDb().appMeta.set(META_LAST_SYNC, iso);
  }

  listCached(): CachedAnnouncement[] {
    const raw = this.getDb().appMeta.get(META_ITEMS);
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw) as CachedAnnouncement[];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  upsertMany(items: DesktopAnnouncementItem[]): CachedAnnouncement[] {
    const now = new Date().toISOString();
    const byId = new Map(this.listCached().map((item) => [item.publicId, item]));
    for (const item of items) {
      const existing = byId.get(item.publicId);
      byId.set(item.publicId, {
        ...item,
        cachedAt: existing?.cachedAt ?? now,
      });
    }
    const merged = [...byId.values()]
      .sort((a, b) => {
        const aTime = a.publishedAt ?? a.cachedAt;
        const bTime = b.publishedAt ?? b.cachedAt;
        return bTime.localeCompare(aTime);
      })
      .slice(0, KHEPREE_ANNOUNCEMENT_CACHE_MAX);
    this.getDb().appMeta.set(META_ITEMS, JSON.stringify(merged));
    return merged;
  }

  markReadLocal(publicId: string, readAt: string): void {
    const items = this.listCached().map((item) =>
      item.publicId === publicId ? { ...item, readAt } : item,
    );
    this.getDb().appMeta.set(META_ITEMS, JSON.stringify(items));
  }

  markDismissedLocal(publicId: string, dismissedAt: string, readAt: string | null): void {
    const items = this.listCached().map((item) =>
      item.publicId === publicId ? { ...item, dismissedAt, readAt: readAt ?? item.readAt } : item,
    );
    this.getDb().appMeta.set(META_ITEMS, JSON.stringify(items));
  }

  queueReadReceipt(publicId: string): void {
    const pending = this.readPendingReads();
    if (!pending.includes(publicId)) {
      pending.push(publicId);
      this.getDb().appMeta.set(META_PENDING_READS, JSON.stringify(pending));
    }
  }

  dequeueReadReceipt(publicId: string): void {
    const pending = this.readPendingReads().filter((id) => id !== publicId);
    this.getDb().appMeta.set(META_PENDING_READS, JSON.stringify(pending));
  }

  readPendingReads(): string[] {
    return this.readStringArray(META_PENDING_READS);
  }

  queueDismissReceipt(publicId: string): void {
    const pending = this.readPendingDismisses();
    if (!pending.includes(publicId)) {
      pending.push(publicId);
      this.getDb().appMeta.set(META_PENDING_DISMISSES, JSON.stringify(pending));
    }
  }

  dequeueDismissReceipt(publicId: string): void {
    const pending = this.readPendingDismisses().filter((id) => id !== publicId);
    this.getDb().appMeta.set(META_PENDING_DISMISSES, JSON.stringify(pending));
  }

  readPendingDismisses(): string[] {
    return this.readStringArray(META_PENDING_DISMISSES);
  }

  private readStringArray(key: string): string[] {
    const raw = this.getDb().appMeta.get(key);
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw) as string[];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
}
