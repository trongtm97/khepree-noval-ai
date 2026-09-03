import { useCallback, useEffect, useState } from 'react';
import type { UpdateStatus } from '@shared/schemas/updates';
import { useNotificationStore } from '../stores/notification-store';
import { useT } from '../i18n';

function updateNotificationId(version: string): string {
  return `khepree-update:${version}`;
}

export function useUpdateStatus(): {
  status: UpdateStatus | null;
  loading: boolean;
  checkNow: () => Promise<void>;
  installAndRestart: () => Promise<{ ok: boolean; reason?: string }>;
  postpone: () => Promise<void>;
} {
  const t = useT();
  const add = useNotificationStore((s) => s.upsert);
  const [status, setStatus] = useState<UpdateStatus | null>(null);
  const [loading, setLoading] = useState(true);

  const emitUpdateNotification = useCallback(
    (next: UpdateStatus) => {
      if (!next.latestVersion) return;
      if (next.phase === 'available' || next.phase === 'downloading' || next.phase === 'downloaded') {
        add({
          id: updateNotificationId(next.latestVersion),
          kind: next.mandatoryUpdate ? 'ACTION_REQUIRED' : 'INFO',
          title: next.mandatoryUpdate
            ? t('updates.notificationMandatoryTitle', { version: next.latestVersion })
            : t('updates.notificationAvailableTitle', { version: next.latestVersion }),
          description:
            next.releaseNotes?.slice(0, 240) ??
            t('updates.notificationAvailableBody', { version: next.latestVersion }),
          toast: next.phase === 'downloaded' || next.mandatoryUpdate,
          read: false,
        });
      }
    },
    [add, t],
  );

  useEffect(() => {
    void window.khepreeNovelAI.updates.getStatus().then((initial) => {
      setStatus(initial);
      setLoading(false);
    });
    const unsub = window.khepreeNovelAI.updates.onStatus((next) => {
      setStatus(next);
      emitUpdateNotification(next);
    });
    return unsub;
  }, [emitUpdateNotification]);

  const checkNow = useCallback(async () => {
    setLoading(true);
    try {
      const next = await window.khepreeNovelAI.updates.checkNow();
      setStatus(next);
      emitUpdateNotification(next);
    } finally {
      setLoading(false);
    }
  }, [emitUpdateNotification]);

  const installAndRestart = useCallback(async () => {
    return window.khepreeNovelAI.updates.installAndRestart();
  }, []);

  const postpone = useCallback(async () => {
    await window.khepreeNovelAI.updates.postpone();
    const next = await window.khepreeNovelAI.updates.getStatus();
    setStatus(next);
  }, []);

  return { status, loading, checkNow, installAndRestart, postpone };
}

/** Plain-text release notes — no HTML injection. */
export function formatReleaseNotesForDisplay(notes: string | null): string {
  if (!notes) return '';
  return notes
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/javascript:/gi, '')
    .trim();
}
