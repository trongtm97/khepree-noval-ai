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
  /** Local path from trusted app context only — never accept arbitrary paths from remote/server payloads. */
  path: string;
}

/**
 * Invariant: server/remote notification sources must NOT supply `open-file` / `open-folder`
 * actions with user-controlled paths. Only locally emitted notifications (export complete, etc.)
 * may attach toastActions; future remote API should use opaque action tokens resolved in main.
 */
export type TrustedLocalToastAction = ToastAction;

export interface AppNotification {
  id: string;
  kind: NotificationKind;
  title: string;
  description: string;
  timestamp: string;
  projectId?: string;
  projectName?: string;
  /** In-app route (hash router path) when user opens the notification. */
  route?: string;
  read: boolean;
  toast?: boolean;
  toastActions?: ToastAction[];
  toastDurationMs?: number;
  /** Khepree system announcement — stable id `khepree-ann:{publicId}`. */
  khepreePublicId?: string;
  khepreeCta?: import('@shared/schemas/khepree-announcements').SafeAnnouncementCta | null;
}

interface NotificationState {
  items: AppNotification[];
  add: (n: Omit<AppNotification, 'id' | 'timestamp' | 'read'> & { id?: string }) => void;
  /** Upsert by id — for Khepree announcements without duplicate toasts. */
  upsert: (n: Omit<AppNotification, 'timestamp' | 'read'> & { read?: boolean }) => void;
  /** Hide floating toast only — does not change read state. */
  dismissToast: (id: string) => void;
  markRead: (id: string) => void;
  markAllRead: () => void;
  remove: (id: string) => void;
  clearToasts: () => void;
}

function uid(): string {
  return `n_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

const NOTIFICATION_PERSIST_VERSION = 1;

type PersistedNotificationState = Pick<NotificationState, 'items'>;

/** Pre-v1 persisted rows may omit read/toast flags. */
type LegacyPersistedNotification = Omit<AppNotification, 'read' | 'toast'> & {
  read?: boolean;
  toast?: boolean;
};

export function migrateNotificationPersist(
  persisted: unknown,
  version: number,
): PersistedNotificationState {
  const state = (persisted ?? { items: [] }) as PersistedNotificationState;
  const items = Array.isArray(state.items) ? state.items : [];

  if (version < NOTIFICATION_PERSIST_VERSION) {
    return {
      items: items.map((raw) => {
        const item = raw as LegacyPersistedNotification;
        return {
          ...item,
          read: item.read ?? false,
          toast: item.toast ?? false,
        };
      }),
    };
  }

  return { items };
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
              route: n.route,
              read: false,
              toast: n.toast ?? ['SUCCESS', 'ERROR', 'ACTION_REQUIRED'].includes(n.kind),
              toastActions: n.toastActions,
              toastDurationMs: n.toastDurationMs,
              khepreePublicId: n.khepreePublicId,
              khepreeCta: n.khepreeCta,
            },
            ...state.items,
          ].slice(0, 200),
        })),
      upsert: (n) =>
        set((state) => {
          const existing = state.items.find((i) => i.id === n.id);
          if (existing) {
            const shouldToast =
              n.toast === true && existing.toast === false && !existing.read && !n.read;
            return {
              items: state.items.map((i) =>
                i.id === n.id
                  ? {
                      ...i,
                      kind: n.kind,
                      title: n.title,
                      description: n.description,
                      projectId: n.projectId ?? i.projectId,
                      projectName: n.projectName ?? i.projectName,
                      route: n.route ?? i.route,
                      read: n.read ?? i.read,
                      toast: shouldToast ? true : (n.toast ?? i.toast),
                      toastActions: n.toastActions ?? i.toastActions,
                      khepreePublicId: n.khepreePublicId ?? i.khepreePublicId,
                      khepreeCta: n.khepreeCta ?? i.khepreeCta,
                    }
                  : i,
              ),
            };
          }
          return {
            items: [
              {
                id: n.id,
                kind: n.kind,
                title: n.title,
                description: n.description,
                timestamp: new Date().toISOString(),
                projectId: n.projectId,
                projectName: n.projectName,
                route: n.route,
                read: n.read ?? false,
                toast: n.toast ?? ['SUCCESS', 'ERROR', 'ACTION_REQUIRED'].includes(n.kind),
                toastActions: n.toastActions,
                khepreePublicId: n.khepreePublicId,
                khepreeCta: n.khepreeCta,
              },
              ...state.items,
            ].slice(0, 200),
          };
        }),
      dismissToast: (id) =>
        set((state) => ({
          items: state.items.map((i) => (i.id === id ? { ...i, toast: false } : i)),
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
    {
      name: 'khepree-novel-ai-notifications',
      version: NOTIFICATION_PERSIST_VERSION,
      migrate: migrateNotificationPersist,
    },
  ),
);
