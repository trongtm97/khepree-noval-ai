import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { resolveAppPaths, pathsService } from '@main/services/paths-service';
import { createDatabaseManager, closeDatabase } from '@main/db/connection';
import type { DatabaseManager } from '@main/db/database-manager';
import {
  createEdition,
  ensureDefaultEdition,
  listEditions,
  switchEdition,
} from '@main/services/edition-service';
import { formatNotebookNameForRole } from '@shared/constants/notebook-role';

describe('Translation Editions', () => {
  let db: DatabaseManager;
  let tempRoot: string;

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nts-editions-'));
    pathsService.initializeAt(tempRoot);
    const paths = resolveAppPaths(tempRoot);
    closeDatabase();
    db = createDatabaseManager({ dataDir: paths.data, backupsDir: paths.backups });
  });

  afterEach(() => {
    db.close();
    closeDatabase();
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it('auto-creates one legacy edition from project target_language', () => {
    const project = db.projects.create({
      title: '仙逆',
      source_language: 'zh-Hans',
      target_language: 'vi',
      target_title: 'Tiên Nghịch',
    });

    const edition = ensureDefaultEdition(db, project.id);
    expect(edition.target_language).toBe('vi');
    expect(edition.name).toBe('Tiên Nghịch');
    expect(db.projects.getById(project.id)?.active_edition_id).toBe(edition.id);

    // Idempotent
    const again = ensureDefaultEdition(db, project.id);
    expect(again.id).toBe(edition.id);
    expect(db.translationEditions.listByProject(project.id)).toHaveLength(1);
  });

  it('migration backfill creates edition for existing projects', () => {
    // createDatabaseManager already ran migrations including 031 backfill
    // for empty DB — seed project then ensure still works after fresh list
    const project = db.projects.create({
      title: 'Legacy Novel',
      source_language: 'zh-Hans',
      target_language: 'en',
    });
    // Simulate pre-edition project: clear active + editions then re-run ensure
    db.getConnection()
      .prepare(`UPDATE projects SET active_edition_id = NULL WHERE id = ?`)
      .run(project.id);
    db.getConnection()
      .prepare(`DELETE FROM translation_editions WHERE project_id = ?`)
      .run(project.id);

    const edition = ensureDefaultEdition(db, project.id);
    expect(edition.target_language).toBe('en');
    expect(listEditions(db, project.id)).toHaveLength(1);
  });

  it('add language creates new edition without touching source chapters', () => {
    const project = db.projects.create({
      title: '仙逆',
      source_language: 'zh-Hans',
      target_language: 'vi',
    });
    ensureDefaultEdition(db, project.id);

    const chapter = db.chapters.create({
      project_id: project.id,
      chapter_number: 1,
      chapter_title: '第一章',
      sequence_order: 1,
      source_status: 'SOURCE_READY',
    });

    const { edition, editions } = createEdition(db, {
      projectId: project.id,
      targetLanguage: 'en',
      name: 'Renegade Immortal',
      activate: true,
    });

    expect(edition.targetLanguage).toBe('en');
    expect(edition.name).toBe('Renegade Immortal');
    expect(editions).toHaveLength(2);
    expect(db.projects.getById(project.id)?.target_language).toBe('en');
    expect(db.chapters.getById(chapter.id)?.chapter_title).toBe('第一章');
    expect(db.chapters.listByProject(project.id)).toHaveLength(1);
  });

  it('switch edition mirrors target_language and does not re-import source', () => {
    const project = db.projects.create({
      title: '仙逆',
      source_language: 'zh-Hans',
      target_language: 'vi',
    });
    const vi = ensureDefaultEdition(db, project.id);
    const { edition: en } = createEdition(db, {
      projectId: project.id,
      targetLanguage: 'en',
      name: 'English',
      activate: true,
    });
    expect(db.projects.getById(project.id)?.target_language).toBe('en');

    switchEdition(db, { projectId: project.id, editionId: vi.id });
    expect(db.projects.getById(project.id)?.target_language).toBe('vi');
    expect(db.projects.getById(project.id)?.active_edition_id).toBe(vi.id);
    expect(en.id).not.toBe(vi.id);
  });

  it('Research notebook name stays project-scoped; Translation includes language', () => {
    expect(formatNotebookNameForRole('仙逆', 'RESEARCH')).toBe('[Research] 仙逆');
    expect(
      formatNotebookNameForRole('仙逆', 'TRANSLATION', {
        targetLanguage: 'vi',
        editionTitle: 'Tiên Nghịch',
      }),
    ).toBe('[Translation][VI] Tiên Nghịch');
    expect(
      formatNotebookNameForRole('仙逆', 'TRANSLATION', {
        targetLanguage: 'en',
        editionTitle: 'Renegade Immortal',
      }),
    ).toBe('[Translation][EN] Renegade Immortal');
  });

  it('translations are edition-scoped — VI and EN rows coexist', () => {
    const project = db.projects.create({
      title: '仙逆',
      source_language: 'zh-Hans',
      target_language: 'vi',
    });
    const vi = ensureDefaultEdition(db, project.id);
    const { edition: en } = createEdition(db, {
      projectId: project.id,
      targetLanguage: 'en',
      activate: false,
    });

    const chapter = db.chapters.create({
      project_id: project.id,
      chapter_number: 1,
      chapter_title: 'Ch1',
      sequence_order: 1,
      source_status: 'SOURCE_READY',
    });
    const para = db.paragraphs.create({
      chapter_id: chapter.id,
      paragraph_id: '[C000001:P000001]',
      sequence: 1,
      source_text: '你好',
    });

    db.translations.upsert({
      paragraph_id: para.id,
      edition_id: vi.id,
      translated_text: 'Xin chào',
      version_source: 'AI_INITIAL',
    });
    db.translations.upsert({
      paragraph_id: para.id,
      edition_id: en.id,
      translated_text: 'Hello',
      version_source: 'AI_INITIAL',
    });

    expect(db.translations.getByParagraphId(para.id, vi.id)?.translated_text).toBe(
      'Xin chào',
    );
    expect(db.translations.getByParagraphId(para.id, en.id)?.translated_text).toBe(
      'Hello',
    );
  });
});
