import type { BrowserWindow } from 'electron';
import { IPC_CHANNELS } from '@shared/constants/ipc-channels';
import type { KhepreeAccessState } from '@shared/schemas/khepree';

let mainWindow: BrowserWindow | null = null;

export function setKhepreeMainWindow(win: BrowserWindow | null): void {
  mainWindow = win;
}

export function broadcastKhepreeAccessState(state: KhepreeAccessState): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(IPC_CHANNELS.KHEPREE_ACCESS_STATE, state);
  }
}
