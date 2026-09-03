import { useCallback, useEffect, useState } from 'react';
import type { KhepreeAnnouncementDto } from '@shared/schemas/khepree-announcements';
import { useNotificationStore } from '../stores/notification-store';
import { useT } from '../i18n';

function announcementId(publicId: string): string {
  return `khepree-ann:${publicId}`;
}

function mergeAnnouncement(existingToast: boolean | undefined, item: KhepreeAnnouncementDto): boolean {
  if (item.read) return false;
  if (existingToast) return false;
  return item.kind === 'ERROR' || item.kind === 'ACTION_REQUIRED' || item.kind === 'WARNING';
}

export function useKhepreeAnnouncements(enabled: boolean): {
  refresh: () => Promise<void>;
  syncStatus: 'idle' | 'syncing' | 'offline' | 'error';
} {
  const upsert = useNotificationStore((s) => s.upsert);
  const remove = useNotificationStore((s) => s.remove);
  const items = useNotificationStore((s) => s.items);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'offline' | 'error'>('idle');

  const applyList = useCallback(
    (remote: KhepreeAnnouncementDto[]) => {
      const remoteIds = new Set(remote.map((a) => announcementId(a.publicId)));
      for (const local of items) {
        if (local.khepreePublicId && !remoteIds.has(local.id)) {
          remove(local.id);
        }
      }
      for (const ann of remote) {
        const id = announcementId(ann.publicId);
        const existing = items.find((i) => i.id === id);
        upsert({
          id,
          kind: ann.kind,
          title: ann.title,
          description: ann.description,
          read: ann.read,
          toast: mergeAnnouncement(existing?.toast, ann),
          khepreePublicId: ann.publicId,
          khepreeCta: ann.cta,
        });
      }
    },
    [items, remove, upsert],
  );

  const refresh = useCallback(async () => {
    setSyncStatus('syncing');
    try {
      const result = await window.khepreeNovelAI.khepree.syncAnnouncements();
      setSyncStatus(result.syncStatus);
      applyList(result.items);
    } catch {
      setSyncStatus('error');
    }
  }, [applyList]);

  useEffect(() => {
    if (!enabled) return;
    void window.khepreeNovelAI.khepree.listAnnouncements().then((result) => {
      setSyncStatus(result.syncStatus);
      applyList(result.items);
    });
  }, [applyList, enabled]);

  return {
    refresh,
    syncStatus,
  };
}

export function useKhepreeAnnouncementActions(): {
  markRead: (publicId: string) => Promise<void>;
  dismiss: (publicId: string) => Promise<void>;
  syncErrorLabel: (code: string | null) => string;
} {
  const t = useT();
  const markReadStore = useNotificationStore((s) => s.markRead);
  const remove = useNotificationStore((s) => s.remove);

  const markRead = useCallback(
    async (publicId: string) => {
      markReadStore(announcementId(publicId));
      await window.khepreeNovelAI.khepree.markAnnouncementRead({ publicId });
    },
    [markReadStore],
  );

  const dismiss = useCallback(
    async (publicId: string) => {
      remove(announcementId(publicId));
      await window.khepreeNovelAI.khepree.dismissAnnouncement({ publicId });
    },
    [remove],
  );

  const syncErrorLabel = useCallback(
    (code: string | null) => {
      if (!code) return '';
      if (code === 'network') return t('announcements.syncOffline');
      return t('announcements.syncError');
    },
    [t],
  );

  return { markRead, dismiss, syncErrorLabel };
}
