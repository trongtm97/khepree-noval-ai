import fs from 'node:fs';
import path from 'node:path';
import { pathsService } from '../../services/paths-service';

export class BrowserProfileManager {
  resolveProfilePath(profileDirName: string): string {
    const root = pathsService.getPath('browserProfiles');
    const full = path.resolve(root, profileDirName);
    const rootResolved = path.resolve(root);
    if (full !== rootResolved && !full.startsWith(`${rootResolved}${path.sep}`)) {
      throw new Error('Profile path escapes browser-profiles directory');
    }
    return full;
  }

  createProfileDirectory(workerId: string): { profileDirName: string; profilePath: string } {
    const profileDirName = workerId;
    const profilePath = this.resolveProfilePath(profileDirName);
    fs.mkdirSync(profilePath, { recursive: true });
    return { profileDirName, profilePath };
  }

  deleteProfileDirectory(profileDirName: string): void {
    const profilePath = this.resolveProfilePath(profileDirName);
    if (fs.existsSync(profilePath)) {
      fs.rmSync(profilePath, { recursive: true, force: true });
    }
  }

  profileExists(profileDirName: string): boolean {
    return fs.existsSync(this.resolveProfilePath(profileDirName));
  }
}

export const browserProfileManager = new BrowserProfileManager();
