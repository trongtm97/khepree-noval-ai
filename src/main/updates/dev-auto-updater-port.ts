import { EventEmitter } from 'node:events';
import type { AutoUpdaterPort } from './update-ports';

/** Controlled fake updater for development and unit tests. */
export class DevAutoUpdaterPort extends EventEmitter {
  feedUrl: string | null = null;

  setFeedURL(options: { url: string }): void {
    this.feedUrl = options.url;
  }

  checkForUpdates(): void {
    this.emit('checking-for-update');
    queueMicrotask(() => {
      this.emit('update-not-available', { version: process.env.KHEPREE_DEV_MOCK_UPDATE_VERSION });
    });
  }

  quitAndInstall(): void {
    this.emit('quit-and-install');
  }

  /** Test helper — simulate update flow. */
  simulateAvailable(version: string, releaseNotes?: string): void {
    this.emit('update-available', { version, releaseNotes });
  }

  simulateDownloadProgress(percent: number): void {
    this.emit('download-progress', { percent, transferred: percent, total: 100 });
  }

  simulateDownloaded(version: string, releaseNotes?: string): void {
    this.emit('update-downloaded', { version, releaseNotes });
  }

  simulateError(message: string): void {
    this.emit('error', new Error(message));
  }
}

export function createDevAutoUpdaterPort(): AutoUpdaterPort {
  return new DevAutoUpdaterPort();
}
