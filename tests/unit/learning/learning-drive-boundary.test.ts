import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';

describe('LearningPipeline Drive boundary', () => {
  it('does not import DriveSyncService — sync only via NotebookSyncService', () => {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const src = fs.readFileSync(
      path.resolve(here, '../../../src/main/learning/learning-pipeline.ts'),
      'utf8',
    );
    expect(src).not.toMatch(
      /(?:from|import)\s+['"][^'"]*drive-sync-service[^'"]*['"]|getDriveSyncService\s*\(/,
    );
    expect(src).toContain('NotebookSyncService');
    expect(src).toContain('syncDrive');
    expect(src).toContain('scheduleBackgroundVersionProbe');
    expect(src).toContain('resolveProjectWorker');
  });
});
