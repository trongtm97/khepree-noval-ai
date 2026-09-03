import { app } from 'electron';

export type DesktopReleasePlatform = 'windows' | 'macos' | 'linux';
export type DesktopReleaseArchitecture = 'x64' | 'arm64' | 'universal';
export type DesktopReleaseChannel = 'stable' | 'beta' | 'alpha';

export function getDesktopReleasePlatform(): DesktopReleasePlatform {
  if (process.platform === 'win32') return 'windows';
  if (process.platform === 'darwin') return 'macos';
  return 'linux';
}

export function getDesktopArchitecture(): DesktopReleaseArchitecture {
  if (process.arch === 'arm64') return 'arm64';
  return 'x64';
}

export function getDesktopReleaseChannel(): DesktopReleaseChannel {
  const env = process.env.KHEPREE_RELEASE_CHANNEL?.trim();
  if (env === 'beta' || env === 'alpha') return env;
  return 'stable';
}

export function getDesktopAppVersion(): string {
  return app.getVersion();
}
