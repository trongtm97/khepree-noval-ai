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
import { prepareLibraryFtsQuery } from '@main/library-search/fts-query';

async function waitForReindex(svc: ReturnType<typeof getLibrarySearchService>): Promise<void> {
  for (let i = 0; i < 80; i += 1) {
    const progress = svc.getReindexProgress();
    if (!progress || progress.status === 'COMPLETED' || progress.status === 'FAILED') {
      return;
    }
    await new Promise((r) => setTimeout(r, 50));
  }
}

describe('library search', () => {
  let tempRoot: string;

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nts-lib-search-'));
    pathsService.initializeAt(tempRoot);
    initializeDatabase({
      dataDir: pathsService.getPath('data'),
      backupsDir: pathsService.getPath('backups'),
    });
    resetLibrarySearchServiceForTests();
  });

  afterEach(() => {
    resetLibrarySearchServiceForTests();
    closeDatabase();
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it('prepares unicode FTS queries with punctuation', () => {
    expect(prepareLibraryFtsQuery('李白')).toBe('"李白"*');
    expect(prepareLibraryFtsQuery('Nguyễn Văn A')).toBe('"Nguyễn"* "Văn"* "A"*');
    expect(prepareLibraryFtsQuery('한국어 테스트')).toContain('"한국어"*');
  });

  it('indexes and finds Vietnamese, Chinese, Japanese, Korean terms', async () => {
    const db = getDatabase();
    const project = db.projects.create({ title: 'Unicode Novel 日本語' });
    db.chapters.create({
      project_id: project.id,
      chapter_number: 1,
      sequence_order: 1,
      chapter_title: '第一章 Việt',
      source_text: '李白は詩人です。Truyện hay.',
      status: 'pending',
      source_status: 'SOURCE_READY',
    });
    const term = db.terms.create({
      source_text: '한국어',
      scope: 'PROJECT',
      scope_ref: project.id,
      status: 'PROJECT_VERIFIED',
      preferred_translation: 'Korean',
    });

    const svc = getLibrarySearchService(db);
    await svc.startReindex(true);
    await waitForReindex(svc);

    const vi = svc.query({ query: 'Truyện' });
    expect(vi.total).toBeGreaterThan(0);

    const zh = svc.query({ query: '李白' });
    expect(zh.total).toBeGreaterThan(0);

    const ja = svc.query({ query: '日本語' });
    expect(ja.total).toBeGreaterThan(0);

    const ko = svc.query({ query: '한국어' });
    expect(ko.total).toBeGreaterThan(0);
    expect(ko.items.some((i) => i.entityId === term.id)).toBe(true);
  });

  it('respects opt-out for source and translation indexing', async () => {
    const db = getDatabase();
    const project = db.projects.create({ title: 'Sensitive' });
    const chapter = db.chapters.create({
      project_id: project.id,
      chapter_number: 2,
      sequence_order: 2,
      chapter_title: 'Secret chapter',
      source_text: 'SECRET_SOURCE_PHRASE',
      status: 'pending',
      source_status: 'SOURCE_READY',
    });
    const para = db.paragraphs.create({
      chapter_id: chapter.id,
      paragraph_id: 'c2-p1',
      sequence: 1,
      source_text: 'SECRET_SOURCE_PHRASE',
    });
    db.projects.setActiveEditionId(
      project.id,
      db.translationEditions.create({
        projectId: project.id,
        name: 'Main',
        targetLanguage: 'vi',
      }).id,
    );
    const editionId = db.projects.getById(project.id)!.active_edition_id!;
    db.translations.create({
      paragraph_id: para.id,
      edition_id: editionId,
      translated_text: 'SECRET_TRANSLATION_PHRASE',
      status: 'translated',
    });

    const svc = getLibrarySearchService(db);
    svc.updateSettings({ indexSourceText: false, indexTranslationText: false });
    await svc.startReindex(true);
    await waitForReindex(svc);

    expect(svc.query({ query: 'SECRET_SOURCE_PHRASE' }).total).toBe(0);
    expect(svc.query({ query: 'SECRET_TRANSLATION_PHRASE' }).total).toBe(0);
    expect(svc.query({ query: 'Secret chapter' }).total).toBeGreaterThan(0);
  });

  it('removes project rows when project deleted', async () => {
    const db = getDatabase();
    const project = db.projects.create({ title: 'Disposable Project' });
    const svc = getLibrarySearchService(db);
    await svc.startReindex(true);
    await waitForReindex(svc);
    expect(svc.query({ query: 'Disposable' }).total).toBeGreaterThan(0);

    db.projects.softDelete(project.id);
    db.librarySearch.deleteFtsByProject(project.id);

    expect(svc.query({ query: 'Disposable' }).total).toBe(0);
  });

  it('recovers from FTS corruption via rebuild', async () => {
    const db = getDatabase();
    db.projects.create({ title: 'Recover Test' });
    const svc = getLibrarySearchService(db);
    await svc.startReindex(true);
    await waitForReindex(svc);

    db.getConnection().exec('DROP TABLE library_search_fts');
    expect(svc.query({ query: 'Recover' }).total).toBe(0);

    svc.recoverFtsCorruption();
    await waitForReindex(svc);
    expect(svc.query({ query: 'Recover' }).total).toBeGreaterThan(0);
  });

  it('dedupes pending dirty rows and processes incrementally', async () => {
    const db = getDatabase();
    const project = db.projects.create({ title: 'Dirty Queue' });
    db.librarySearch.enqueueDirty('project', project.id, project.id);
    db.librarySearch.enqueueDirty('project', project.id, project.id);
    expect(db.librarySearch.listDirty(10).length).toBe(1);

    const svc = getLibrarySearchService(db);
    const processed = svc.processDirtyBatch(5);
    expect(processed).toBe(1);
    expect(db.librarySearch.listDirty(10).length).toBe(0);
    expect(svc.query({ query: 'Dirty' }).total).toBeGreaterThan(0);
  });

  it('indexes series world lore and navigates to series page', async () => {
    const db = getDatabase();
    const { FictionSeriesService, resetFictionSeriesServiceForTests } = await import(
      '@main/services/fiction-series-service'
    );
    resetFictionSeriesServiceForTests();
    const seriesSvc = new FictionSeriesService(() => db);
    const series = seriesSvc.createSeries({ title: 'Cloud Peak Saga' });
    db.fictionSeries.setWorldKnowledgeJson(
      series.id,
      JSON.stringify({ 青云门: 'Thanh Van Mon righteous sect' }),
    );
    db.fictionSeries.upsertStyleRule({
      seriesId: series.id,
      ruleKind: 'naming',
      content: 'Keep sect titles on first mention',
      sortOrder: 0,
    });

    const svc = getLibrarySearchService(db);
    await svc.startReindex(true);
    await waitForReindex(svc);

    const worldHits = svc.query({ query: 'Thanh Van Mon', entityTypes: ['world'] });
    expect(worldHits.total).toBeGreaterThan(0);
    const worldItem = worldHits.items.find((i) => i.entityType === 'world');
    expect(worldItem?.entityId).toBe(series.id);
    expect(worldItem?.route).toBe(`/series/${series.id}`);

    const seriesHits = svc.query({ query: 'sect titles', entityTypes: ['series'] });
    expect(seriesHits.items.some((i) => i.entityId === series.id)).toBe(true);
  });

  it('dirty-queues glossary translation edits and character aliases', async () => {
    const db = getDatabase();
    const project = db.projects.create({ title: 'Glossary Dirty' });
    const term = db.terms.create({
      source_text: '金丹',
      scope: 'PROJECT',
      scope_ref: project.id,
      status: 'PROJECT_VERIFIED',
      preferred_translation: 'Kim Đan',
    });
    const character = db.characters.create({
      project_id: project.id,
      canonical_name: '王林',
      translated_name: 'Vuong Lam',
    });

    // Clear trigger noise from create
    db.getConnection().prepare(`DELETE FROM library_search_dirty`).run();

    db.terms.setTranslations(term.id, 'Golden Core', []);
    const termDirty = db.librarySearch
      .listDirty(20)
      .some((d) => d.entity_type === 'term' && d.entity_id === term.id);
    expect(termDirty).toBe(true);

    db.getConnection().prepare(`DELETE FROM library_search_dirty`).run();
    db.characters.addAlias(character.id, 'Daoist Wang');
    const charDirty = db.librarySearch
      .listDirty(20)
      .some((d) => d.entity_type === 'character' && d.entity_id === character.id);
    expect(charDirty).toBe(true);

    const svc = getLibrarySearchService(db);
    svc.processDirtyBatch(20);
    await svc.startReindex(true);
    await waitForReindex(svc);
    expect(svc.query({ query: 'Golden Core' }).total).toBeGreaterThan(0);
    expect(svc.query({ query: 'Daoist Wang' }).total).toBeGreaterThan(0);
  });

  it('result routes use stable IDs for project chapter character series', async () => {
    const db = getDatabase();
    const project = db.projects.create({ title: 'Nav Novel' });
    const chapter = db.chapters.create({
      project_id: project.id,
      chapter_number: 3,
      sequence_order: 3,
      chapter_title: 'Nav Chapter',
      source_text: 'hello',
      status: 'pending',
      source_status: 'SOURCE_READY',
    });
    const character = db.characters.create({
      project_id: project.id,
      canonical_name: 'NavHero',
      translated_name: 'Hero',
    });
    const { FictionSeriesService, resetFictionSeriesServiceForTests } = await import(
      '@main/services/fiction-series-service'
    );
    resetFictionSeriesServiceForTests();
    const series = new FictionSeriesService(() => db).createSeries({ title: 'Nav Series' });

    const svc = getLibrarySearchService(db);
    await svc.startReindex(true);
    await waitForReindex(svc);

    const projectHit = svc.query({ query: 'Nav Novel', entityTypes: ['project'] }).items[0];
    expect(projectHit?.route).toBe(`/projects/${project.id}`);

    const chapterHit = svc.query({ query: 'Nav Chapter', entityTypes: ['chapter'] }).items[0];
    expect(chapterHit?.entityId).toBe(chapter.id);
    expect(chapterHit?.route).toContain(project.id);
    expect(chapterHit?.route).toContain(chapter.id);

    const charHit = svc.query({ query: 'NavHero', entityTypes: ['character'] }).items[0];
    expect(charHit?.route).toBe(
      `/projects/${project.id}/characters?characterId=${encodeURIComponent(character.id)}`,
    );

    const seriesHit = svc.query({ query: 'Nav Series', entityTypes: ['series'] }).items[0];
    expect(seriesHit?.route).toBe(`/series/${series.id}`);
  });
});
