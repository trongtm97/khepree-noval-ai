import { useCallback, useRef } from 'react';
import { useNotificationStore } from '../../stores/notification-store';

const SAVE_TOAST_MS = 2500;

/** Subtle auto-save toast + scoped error setter for Settings panels. */
export function useSettingsFeedback() {
  const add = useNotificationStore((s) => s.add);
  const lastToastRef = useRef<number>(0);

  const showSaved = useCallback(
    (message: string) => {
      const now = Date.now();
      if (now - lastToastRef.current < 400) return;
      lastToastRef.current = now;
      add({
        kind: 'SUCCESS',
        title: message,
        description: '',
        toast: true,
        toastDurationMs: SAVE_TOAST_MS,
      });
    },
    [add],
  );

  const showInfo = useCallback(
    (title: string, description = '') => {
      add({
        kind: 'INFO',
        title,
        description,
        toast: true,
        toastDurationMs: SAVE_TOAST_MS,
      });
    },
    [add],
  );

  return { showSaved, showInfo };
}
