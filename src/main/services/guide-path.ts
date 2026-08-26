import fs from 'node:fs';
import path from 'node:path';
import { app } from 'electron';
import {
  APP_GUIDE_FILES,
  type AppGuideId,
} from '@shared/constants/guides';

/**
 * Resolve bundled HTML guide path (dev: repo resources/guides, packaged: resources/guides).
 */
export function resolveGuidePath(guideId: AppGuideId): string {
  const fileName = APP_GUIDE_FILES[guideId];
  const candidates = [
    path.join(process.cwd(), 'resources', 'guides', fileName),
    path.join(app.getAppPath(), 'resources', 'guides', fileName),
    path.join(process.resourcesPath ?? '', 'guides', fileName),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  throw new Error(`Guide not found: ${guideId}`);
}
