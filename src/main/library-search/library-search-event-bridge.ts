import type { BrowserWindow } from 'electron';
import { IPC_CHANNELS } from '@shared/constants/ipc-channels';
import type { LibrarySearchIndexProgressDto } from '@shared/schemas/library-search';

let mainWindow: BrowserWindow | null = null;

export function setLibrarySearchMainWindow(win: BrowserWindow | null): void {
  mainWindow = win;
}

export function emitLibrarySearchReindexProgress(payload: LibrarySearchIndexProgressDto): void {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }
  mainWindow.webContents.send(IPC_CHANNELS.LIBRARY_SEARCH_ON_REINDEX_PROGRESS, payload);
}
