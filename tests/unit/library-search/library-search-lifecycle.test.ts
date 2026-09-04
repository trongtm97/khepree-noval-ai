import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { closeDatabase, getDatabase, initializeDatabase } from '@main/db/connection';
import { pathsService } from '@main/services/paths-service';
import {
  getLibrarySearchService,
  resetLibrarySearchServiceForTests,
} from '@main/library-search/library-search-service';
import { buildLibrarySearchRoute } from '@main/library-search/index-builder';
import {
  FictionSeriesService,
  resetFictionSeriesServiceForTests,
} from '@main/services/fiction-series-service';

async function waitForReindex(svc: ReturnType<typeof getLibrarySearchService>): Promise<void> {
  for (let i = 0; i < 80; i += 1) {
    const progress = svc.getReindexProgress();
    if (!progress || progress.status === 'COMPLETED' || progress.status === 'FAILED') {
      return;
    }
    await new Promise((r) => setTimeout(r, 50));
  }
}

describe('library search dirty lifecycle + deep link routes', () => {
  let tempRoot: string;

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nts-lib-dirty-'));
    pathsService.initializeAt(tempRoot);
    initializeDatabase({
      dataDir: pathsService.getPath('data'),
      backupsDir: pathsService.getPath('backups'),
    });
    resetLibrarySearchServiceForTests();
    resetFictionSeriesServiceForTests();
  });

  afterEach(() => {
    resetLibrarySearchServiceForTests();
    resetFictionSeriesServiceForTests();
    closeDatabase();
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it('chapter/translation routes use stable ids not titles', () => {
    const projectId = '11111111-1111-1111-1111-111111111111';
    const chapterId = '22222222-2222-2222-2222-222222222222';
    const paragraphId = '[C000001:P000003]';
    expect(
      buildLibrarySearchRoute({
        entityType: 'chapter',
        entityId: chapterId,
        projectId,
      }),
    ).toBe(`/projects/${projectId}/translate?chapter=${chapterId}`);
    const translationRoute = buildLibrarySearchRoute({
      entityType: 'translation',
      entityId: 'x',
      projectId,
      chapterId,
      stableParagraphId: paragraphId,
    });
    expect(translationRoute).toContain(`chapter=${chapterId}`);
    expect(translationRoute).toContain('paragraph=');
  });

  it('series world edit is findable after reindex', async () => {
    const db = getDatabase();
    const seriesSvc = new FictionSeriesService(() => db);
    const series = seriesSvc.createSeries({ title: 'Dirty Series' });
    const projectId = db.projects.create({ title: 'Vol' }).id;
    seriesSvc.assignProjectToSeries({ seriesId: series.id, projectId, force: true });
    seriesSvc.setWorldKnowledge(series.id, { unique_token_xyz: 'KiemTongKyLa' });

    const svc = getLibrarySearchService(db);
    await svc.startReindex(true);
    await waitForReindex(svc);

    const results = svc.query({ query: 'KiemTongKyLa' });
    expect(results.total).toBeGreaterThan(0);
    expect(
      results.items.some((i) => i.entityType === 'world' || i.entityType === 'series'),
    ).toBe(true);
  });

  it('deleted project no longer returns in search after dirty process', async () => {
    const db = getDatabase();
    const project = db.projects.create({ title: 'DeleteMeUniqueTitleZZZ' });
    const svc = getLibrarySearchService(db);
    await svc.startReindex(true);
    await waitForReindex(svc);

    expect(svc.query({ query: 'DeleteMeUniqueTitleZZZ' }).total).toBeGreaterThan(0);

    db.getConnection()
      .prepare(`UPDATE projects SET deleted_at = datetime('now') WHERE id = ?`)
      .run(project.id);
    db.librarySearch.enqueueDirty('project', project.id, project.id);
    svc.processDirtyBatch(50);

    const after = svc.query({ query: 'DeleteMeUniqueTitleZZZ' });
    expect(after.items.some((i) => i.entityId === project.id)).toBe(false);
  });
});
