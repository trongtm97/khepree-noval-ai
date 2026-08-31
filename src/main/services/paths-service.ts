import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { APP_DATA_DIR_NAME } from '@shared/constants/db';
import { APP_PATH_DIRS, type AppPathKey } from '@shared/constants/paths';
import type { AppPaths } from '@shared/schemas/ipc';

export function resolveAppPaths(appDataRoot: string): AppPaths {
  const root = path.join(appDataRoot, APP_DATA_DIR_NAME);
  return {
    root,
    data: path.join(root, APP_PATH_DIRS.data),
    logs: path.join(root, APP_PATH_DIRS.logs),
    browserProfiles: path.join(root, APP_PATH_DIRS.browserProfiles),
    exports: path.join(root, APP_PATH_DIRS.exports),
    backups: path.join(root, APP_PATH_DIRS.backups),
    cache: path.join(root, APP_PATH_DIRS.cache),
  };
}

export class PathsService {
  private paths: AppPaths | null = null;

  initialize(): AppPaths {
    const appData = app.getPath('appData');
    this.paths = resolveAppPaths(appData);
    this.ensureDirectories();
    return this.paths;
  }

  /** For tests — supply explicit AppData root (e.g. os.tmpdir()). */
  initializeAt(appDataRoot: string): AppPaths {
    this.paths = resolveAppPaths(appDataRoot);
    this.ensureDirectories();
    return this.paths;
  }

  getPaths(): AppPaths {
    if (!this.paths) {
      return this.initialize();
    }
    return this.paths;
  }

  isInitialized(): boolean {
    return this.paths !== null;
  }

  getPath(key: AppPathKey): string {
    return this.getPaths()[key];
  }

  isManagedPath(targetPath: string): boolean {
    const paths = this.getPaths();
    const normalized = path.resolve(targetPath);
    return Object.values(paths).some((managed) => {
      const base = path.resolve(managed);
      return normalized === base || normalized.startsWith(`${base}${path.sep}`);
    });
  }

  ensureDirectories(): void {
    const paths = this.getPaths();
    for (const key of Object.keys(APP_PATH_DIRS) as Exclude<AppPathKey, 'root'>[]) {
      fs.mkdirSync(paths[key], { recursive: true });
    }
  }
}

export const pathsService = new PathsService();
