import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type NotificationKind =
  | 'SUCCESS'
  | 'INFO'
  | 'WARNING'
  | 'ERROR'
  | 'ACTION_REQUIRED';

/** Sticky toasts stay until the user acts. ACTION_REQUIRED must not auto-hide. */
export function shouldAutoDismissToast(kind: NotificationKind): boolean {
  return kind !== 'ACTION_REQUIRED';
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
