import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type NotificationKind =
  | 'SUCCESS'
  | 'INFO'
  | 'WARNING'
  | 'ERROR'
  | 'ACTION_REQUIRED';

/** All floating toasts auto-hide; persistent history stays in the notification panel. */
export function shouldAutoDismissToast(_kind: NotificationKind): boolean {
  return true;
}

const DEFAULT_TOAST_DURATION_MS: Record<NotificationKind, number> = {
  SUCCESS: 4_000,
  INFO: 4_000,
  WARNING: 6_000,
  ERROR: 8_000,
  ACTION_REQUIRED: 12_000,
};

export function resolveToastDurationMs(
  kind: NotificationKind,
  overrideMs?: number,
): number {
  if (typeof overrideMs === 'number' && overrideMs > 0) return overrideMs;
  return DEFAULT_TOAST_DURATION_MS[kind];
}

export interface ToastAction {
  label: string;
  action: 'open-file' | 'open-folder';
  path: string;
}

export interface AppNotification {
  id: string;
  kind: NotificationKind;
  title: string;
  description: string;
  timestamp: string;
  projectId?: string;
  projectName?: string;
  read: boolean;
  toast?: boolean;
  toastActions?: ToastAction[];
  toastDurationMs?: number;
}

interface NotificationState {
  items: AppNotification[];
  add: (n: Omit<AppNotification, 'id' | 'timestamp' | 'read'> & { id?: string }) => void;
  markRead: (id: string) => void;
  markAllRead: () => void;
  remove: (id: string) => void;
  clearToasts: () => void;
}

function uid(): string {
  return `n_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export const useNotificationStore = create<NotificationState>()(
  persist(
    (set) => ({
      items: [],
      add: (n) =>
        set((state) => ({
          items: [
            {
              id: n.id ?? uid(),
              kind: n.kind,
              title: n.title,
              description: n.description,
              timestamp: new Date().toISOString(),
              projectId: n.projectId,
              projectName: n.projectName,
              read: false,
              toast: n.toast ?? ['SUCCESS', 'ERROR', 'ACTION_REQUIRED'].includes(n.kind),
        toastActions: n.toastActions,
        toastDurationMs: n.toastDurationMs,
            },
            ...state.items,
          ].slice(0, 200),
        })),
      markRead: (id) =>
        set((state) => ({
          items: state.items.map((i) => (i.id === id ? { ...i, read: true, toast: false } : i)),
        })),
      markAllRead: () =>
        set((state) => ({
          items: state.items.map((i) => ({ ...i, read: true, toast: false })),
        })),
      remove: (id) => set((state) => ({ items: state.items.filter((i) => i.id !== id) })),
      clearToasts: () =>
        set((state) => ({
          items: state.items.map((i) => ({ ...i, toast: false })),
        })),
    }),
    { name: 'noveltrans-notifications' },
  ),
);
