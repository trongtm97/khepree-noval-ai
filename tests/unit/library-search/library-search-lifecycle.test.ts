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

  it('edit paragraph → dirty/reindex → old token disappears, new token appears', async () => {
    const db = getDatabase();
    const project = db.projects.create({ title: 'Edit Para Project' });
    const chapter = db.chapters.create({
      project_id: project.id,
      chapter_number: 1,
      sequence_order: 1,
      chapter_title: 'Edit Ch',
      source_text: 'OLD_TOKEN_ALPHA_ZZZ unique source',
      source_status: 'SOURCE_READY',
    });
    db.paragraphs.create({
      chapter_id: chapter.id,
      paragraph_id: '[C000001:P000001]',
      sequence: 0,
      source_text: 'OLD_TOKEN_ALPHA_ZZZ unique source',
    });

    const svc = getLibrarySearchService(db);
    await svc.startReindex(true);
    await waitForReindex(svc);
    expect(svc.query({ query: 'OLD_TOKEN_ALPHA_ZZZ' }).total).toBeGreaterThan(0);

    db.getConnection()
      .prepare(`UPDATE chapters SET source_text = ? WHERE id = ?`)
      .run('NEW_TOKEN_BETA_YYY unique source', chapter.id);
    db.getConnection()
      .prepare(`UPDATE chapter_paragraphs SET source_text = ? WHERE chapter_id = ?`)
      .run('NEW_TOKEN_BETA_YYY unique source', chapter.id);
    db.librarySearch.enqueueDirty('chapter', chapter.id, project.id);
    svc.processDirtyBatch(20);

    expect(svc.query({ query: 'OLD_TOKEN_ALPHA_ZZZ' }).total).toBe(0);
    expect(svc.query({ query: 'NEW_TOKEN_BETA_YYY' }).total).toBeGreaterThan(0);
  });

  it('deleted chapter stale search does not crash and entity disappears', async () => {
    const db = getDatabase();
    const project = db.projects.create({ title: 'Delete Chapter Project' });
    const chapter = db.chapters.create({
      project_id: project.id,
      chapter_number: 1,
      sequence_order: 1,
      chapter_title: 'StaleChapterTokenQQQ',
      source_text: 'body',
      source_status: 'SOURCE_READY',
    });

    const svc = getLibrarySearchService(db);
    await svc.startReindex(true);
    await waitForReindex(svc);
    const before = svc.query({ query: 'StaleChapterTokenQQQ' });
    expect(before.total).toBeGreaterThan(0);
    const staleRoute = before.items[0]?.route;
    expect(staleRoute).toContain(chapter.id);

    db.getConnection().prepare(`DELETE FROM chapters WHERE id = ?`).run(chapter.id);
    db.librarySearch.enqueueDirty('chapter', chapter.id, project.id);
    expect(() => svc.processDirtyBatch(20)).not.toThrow();
    expect(() => svc.query({ query: 'StaleChapterTokenQQQ' })).not.toThrow();
    expect(
      svc.query({ query: 'StaleChapterTokenQQQ' }).items.some((i) => i.entityId === chapter.id),
    ).toBe(false);
  });

  it('open result A then result B — B route wins; distinct deep-link targets', () => {
    const projectId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    const chapterA = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
    const chapterB = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
    const paraA = '[C000001:P000001]';
    const paraB = '[C000002:P000003]';

    const routeA = buildLibrarySearchRoute({
      entityType: 'translation',
      entityId: 'ta',
      projectId,
      chapterId: chapterA,
      stableParagraphId: paraA,
    });
    const routeB = buildLibrarySearchRoute({
      entityType: 'translation',
      entityId: 'tb',
      projectId,
      chapterId: chapterB,
      stableParagraphId: paraB,
    });

    expect(routeA).not.toBe(routeB);
    expect(routeA).toContain(`chapter=${chapterA}`);
    expect(routeA).toContain(`paragraph=${encodeURIComponent(paraA)}`);
    expect(routeB).toContain(`chapter=${chapterB}`);
    expect(routeB).toContain(`paragraph=${encodeURIComponent(paraB)}`);
    // Last navigation target is B — no shared stale paragraph id from A.
    expect(routeB).not.toContain(paraA);
    expect(routeB).not.toContain(chapterA);
  });
});
