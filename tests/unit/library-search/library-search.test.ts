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
});
