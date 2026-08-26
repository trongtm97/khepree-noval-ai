/**
 * Auto-update provider abstraction.
 * No fake production updater — use ManualPlaceholder until a real server exists.
 */

export interface UpdateCheckResult {
  ok: boolean;
  status: 'up-to-date' | 'update-available' | 'unavailable' | 'error';
  currentVersion: string;
  latestVersion: string | null;
  message: string;
  releaseNotes: string | null;
  downloadUrl: string | null;
}

export interface UpdateProvider {
  readonly id: string;
  readonly label: string;
  checkForUpdates(currentVersion: string): Promise<UpdateCheckResult>;
}

/**
 * Valid placeholder: honest "no production update server configured".
 * Manual Check for Updates uses this until a real provider is wired.
 */
export class ManualPlaceholderUpdateProvider implements UpdateProvider {
  readonly id = 'manual-placeholder';
  readonly label = 'Manual check (no update server)';

  async checkForUpdates(currentVersion: string): Promise<UpdateCheckResult> {
    await Promise.resolve();
    return {
      ok: true,
      status: 'unavailable',
      currentVersion,
      latestVersion: null,
      message:
        'No production update server configured. Install updates manually from the official release channel when available.',
      releaseNotes: null,
      downloadUrl: null,
    };
  }
}

let activeProvider: UpdateProvider = new ManualPlaceholderUpdateProvider();

export function getUpdateProvider(): UpdateProvider {
  return activeProvider;
}

/** Tests / future wiring only. */
export function setUpdateProvider(provider: UpdateProvider): void {
  activeProvider = provider;
}

export async function checkForUpdates(currentVersion: string): Promise<UpdateCheckResult> {
  return getUpdateProvider().checkForUpdates(currentVersion);
}
