import type { BrowserWindow } from 'electron';
import { IPC_CHANNELS } from '@shared/constants/ipc-channels';
import type { SourceFolderEventDto } from '@shared/schemas/source-folder';

let mainWindow: BrowserWindow | null = null;
const folderUnavailableNotified = new Set<string>();

export function setSourceFolderMainWindow(win: BrowserWindow | null): void {
  mainWindow = win;
}

export function emitSourceFolderEvent(event: SourceFolderEventDto): void {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }
  mainWindow.webContents.send(IPC_CHANNELS.SOURCE_FOLDER_ON_SCAN_PROGRESS, event);
}

export function emitFolderUnavailableOnce(projectId: string, message: string): void {
  if (folderUnavailableNotified.has(projectId)) {
    return;
  }
  folderUnavailableNotified.add(projectId);
  emitSourceFolderEvent({
    type: 'folder_unavailable',
    projectId,
    message,
  });
}

export function clearFolderUnavailableNotice(projectId: string): void {
  folderUnavailableNotified.delete(projectId);
}

export function resetSourceFolderEventBridgeForTests(): void {
  mainWindow = null;
  folderUnavailableNotified.clear();
}
