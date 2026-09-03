import type { BrowserWindow } from 'electron';
import { IPC_CHANNELS } from '@shared/constants/ipc-channels';
import type { BatchImportProgressEventDto } from '@shared/schemas/batch-import';

let mainWindow: BrowserWindow | null = null;

export function setBatchImportMainWindow(win: BrowserWindow | null): void {
  mainWindow = win;
}

export function emitBatchImportProgress(event: BatchImportProgressEventDto): void {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send(IPC_CHANNELS.BATCH_IMPORT_ON_PROGRESS, event);
}

export function resetBatchImportEventBridgeForTests(): void {
  mainWindow = null;
}
