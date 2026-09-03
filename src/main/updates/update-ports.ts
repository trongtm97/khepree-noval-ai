/** Port for Electron autoUpdater — mock in tests. */
export interface AutoUpdaterPort {
  setFeedURL(options: { url: string }): void;
  checkForUpdates(): void;
  quitAndInstall(): void;
  on(event: 'checking-for-update', listener: () => void): void;
  on(
    event: 'update-available' | 'update-downloaded',
    listener: (info: { version?: string; releaseNotes?: string }) => void,
  ): void;
  on(event: 'update-not-available', listener: (info: { version?: string }) => void): void;
  on(
    event: 'download-progress',
    listener: (progress: { percent?: number; transferred?: number; total?: number }) => void,
  ): void;
  on(event: 'error', listener: (error: Error) => void): void;
  removeAllListeners(event?: string): void;
}

export interface UpdateApiPort {
  fetchLatestUpdate(input: {
    accessToken: string;
    clientId: string;
    currentVersion: string;
    platform: string;
    architecture: string;
    channel: string;
    locale: string;
  }): Promise<{
    update: {
      version: string;
      mandatoryUpdate: boolean;
      releaseNotes: string | null;
      artifacts: { fileName: string; artifactPublicId: string }[];
    } | null;
  }>;

  requestSquirrelFeedTicket(input: {
    accessToken: string;
    clientId: string;
    architecture?: string;
    channel?: string;
  }): Promise<{ feedBaseUrl: string; feedTicketExpiresAt: string }>;
}

export type JobsRunningProbe = () => number;

export type AccessTokenProvider = () => Promise<string | null>;

export type LocaleProvider = () => string;

export type UpdateEventSink = (status: import('@shared/schemas/updates').UpdateStatus) => void;
