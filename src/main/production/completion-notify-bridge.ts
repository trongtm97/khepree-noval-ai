import type { BrowserWindow } from 'electron';
import { IPC_CHANNELS } from '@shared/constants/ipc-channels';
import type { ProductionCompletionEvent } from '@shared/schemas/delivery-completion';
import { ProductionCompletionEventSchema } from '@shared/schemas/delivery-completion';
import type { DatabaseManager } from '../db/database-manager';
import { NOTIFY_META_KEYS } from '@shared/constants/notify-settings';

let mainWindow: BrowserWindow | null = null;
let dbRef: DatabaseManager | null = null;
const emittedIds = new Set<string>();

type ElectronNotificationCtor = {
  isSupported: () => boolean;
  new (opts: { title: string; body: string; silent?: boolean }): {
    on: (event: string, cb: () => void) => void;
    show: () => void;
  };
};

/** Resolve Electron.Notification without crashing incomplete vitest mocks. */
function getNotificationCtor(): ElectronNotificationCtor | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const electron = require('electron') as { Notification?: ElectronNotificationCtor };
    const Ctor = electron.Notification;
    if (typeof Ctor !== 'function') return null;
    if (typeof Ctor.isSupported === 'function' && !Ctor.isSupported()) return null;
    return Ctor;
  } catch {
    return null;
  }
}

export function setCompletionNotifyMainWindow(win: BrowserWindow | null): void {
  mainWindow = win;
}

export function setCompletionNotifyDb(db: DatabaseManager | null): void {
  dbRef = db;
}

export function isDesktopNotifyEnabled(db?: DatabaseManager | null): boolean {
  const store = db ?? dbRef;
  if (!store) return true;
  const raw = store.appMeta.get(NOTIFY_META_KEYS.desktopEnabled);
  if (raw == null) return true;
  return raw === 'true' || raw === '1';
}

export function setDesktopNotifyEnabled(db: DatabaseManager, enabled: boolean): void {
  db.appMeta.set(NOTIFY_META_KEYS.desktopEnabled, enabled ? 'true' : 'false');
}

/**
 * Emit durable completion event to renderer + optional OS notification.
 * Dedupes by event.id within process lifetime; durable store also upserts by id.
 */
export function emitProductionCompletion(
  event: ProductionCompletionEvent,
  options?: { forceDesktop?: boolean; skipDedupe?: boolean },
): void {
  const parsed = ProductionCompletionEventSchema.parse(event);
  if (!options?.skipDedupe && !parsed.openTarget) {
    if (emittedIds.has(parsed.id)) return;
    emittedIds.add(parsed.id);
  }

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(IPC_CHANNELS.PRODUCTION_ON_COMPLETION, parsed);
  }

  const wantDesktop =
    parsed.desktopNotify &&
    (options?.forceDesktop || isDesktopNotifyEnabled()) &&
    !parsed.openTarget;

  if (!wantDesktop) return;

  try {
    const NotificationCtor = getNotificationCtor();
    if (!NotificationCtor) return;
    const note = new NotificationCtor({
      title: parsed.title,
      body: parsed.description.slice(0, 200),
      silent: false,
    });
    note.on('click', () => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.focus();
        mainWindow.webContents.send(IPC_CHANNELS.PRODUCTION_ON_COMPLETION, {
          ...parsed,
          openTarget: true,
          desktopNotify: false,
        });
      }
    });
    note.show();
  } catch {
    // Notification may fail on headless / CI / incomplete electron mock — ignore
  }
}

export function resetCompletionNotifyBridgeForTests(): void {
  mainWindow = null;
  dbRef = null;
  emittedIds.clear();
}
