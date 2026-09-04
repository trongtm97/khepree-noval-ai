/**
 * Series dirty fan-out benchmark (Release Hardening V4 §12).
 *
 * Measure — do NOT redesign. O(N) local dirty writes may be fine for users.
 * Reports wall time + DB write proxies for 20 / 100 / 500 / 1000 projects.
 *
 * Run: npm run test:perf -- tests/perf/series-dirty-benchmark.test.ts
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { closeDatabase, getDatabase, initializeDatabase } from '@main/db/connection';
import { pathsService } from '@main/services/paths-service';
import {
  FictionSeriesService,
  resetFictionSeriesServiceForTests,
} from '@main/services/fiction-series-service';
import { resetNotebookBindingServiceForTests } from '@main/services/notebook-binding-service-singleton';

interface BenchRow {
  volumes: number;
  wallMs: number;
  dirtyFlags: number;
  notebookRows: number;
  eventLoopGapMs: number;
}

function measureEventLoopGap(): Promise<number> {
  return new Promise((resolve) => {
    const start = Date.now();
    setImmediate(() => {
      resolve(Date.now() - start);
    });
  });
}

async function runDirtyBench(volumeCount: number): Promise<BenchRow> {
  const db = getDatabase();
  const service = new FictionSeriesService(() => db);
  const series = service.createSeries({ title: `Bench ${volumeCount}` });
  const projectIds: string[] = [];
  for (let i = 0; i < volumeCount; i += 1) {
    const id = db.projects.create({ title: `Vol ${i}` }).id;
    projectIds.push(id);
    service.assignProjectToSeries({ seriesId: series.id, projectId: id, force: true });
  }

  // Warm event loop baseline
  await measureEventLoopGap();

  const t0 = Date.now();
  service.setWorldKnowledge(series.id, { bench_token: `n=${volumeCount}` });
  const wallMs = Date.now() - t0;
  const eventLoopGapMs = await measureEventLoopGap();

  let dirtyFlags = 0;
  let notebookRows = 0;
  for (const id of projectIds) {
    if (db.knowledgeFiles.anyDirty(id)) dirtyFlags += 1;
    notebookRows += db.notebooks.listByProject(id).length;
  }

  return {
    volumes: volumeCount,
    wallMs,
    dirtyFlags,
    notebookRows,
    eventLoopGapMs,
  };
}

describe('series dirty propagate benchmark', () => {
  let tempRoot: string;
  const results: BenchRow[] = [];

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nts-series-dirty-bench-'));
    pathsService.initializeAt(tempRoot);
    initializeDatabase({
      dataDir: pathsService.getPath('data'),
      backupsDir: pathsService.getPath('backups'),
    });
    resetFictionSeriesServiceForTests();
    resetNotebookBindingServiceForTests();
  });

  afterEach(() => {
    resetFictionSeriesServiceForTests();
    resetNotebookBindingServiceForTests();
    closeDatabase();
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  for (const n of [20, 100, 500, 1000] as const) {
    it(`markDirty fan-out for ${n} projects`, async () => {
      const row = await runDirtyBench(n);
      results.push(row);

      // Functional invariants — never create notebooks; all volumes dirty.
      expect(row.notebookRows).toBe(0);
      expect(row.dirtyFlags).toBe(n);

      // Soft latency budget: local SQLite dirty flags should stay interactive.
      // 1000 volumes under 5s is ample; if exceeded → propose revision design.
      expect(row.wallMs).toBeLessThan(5_000);

      // eslint-disable-next-line no-console
      console.log(
        JSON.stringify({
          seriesDirtyBench: row,
          verdict:
            row.wallMs < 200
              ? 'KEEP_SIMPLE — not user-visible'
              : row.wallMs < 1000
                ? 'ACCEPTABLE — monitor at large series'
                : 'REVIEW — consider revision-based dirty',
        }),
      );
    }, 120_000);
  }
});
