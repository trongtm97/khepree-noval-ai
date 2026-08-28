import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { resolveAppPaths } from '@main/services/paths-service';
import { createDatabaseManager, closeDatabase } from '@main/db/connection';
import type { DatabaseManager } from '@main/db/database-manager';
import { persistParsedTranslations } from '@main/learning/translation-persistence';
import { TranslationEditorService } from '@main/services/translation-editor-service';
import { ensureDefaultEdition } from '@main/services/edition-service';

describe('Translation editor persistence (Phase 17)', () => {
  let tempRoot: string;
  let db: DatabaseManager;
  let projectId: string;
  let chapterId: string;
  let paraUuid: string;
  const stableId = '[C000001:P000001]';

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nts-editor-'));
    const paths = resolveAppPaths(tempRoot);
    closeDatabase();
    db = createDatabaseManager({ dataDir: paths.data, backupsDir: paths.backups });
    projectId = db.projects.create({ title: 'Editor Novel' }).id;
    ensureDefaultEdition(db, projectId);
    const chapter = db.chapters.create({
      project_id: projectId,
      chapter_number: 1,
      sequence_order: 1,
      source_text: '测试段落。',
    });
    chapterId = chapter.id;
    const para = db.paragraphs.create({
      chapter_id: chapterId,
      paragraph_id: stableId,
      sequence: 1,
      source_text: '测试段落。',
    });
    paraUuid = para.id;
  });

  afterEach(() => {
    db.close();
    closeDatabase();
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it('persists AI_INITIAL on PASS parse', () => {
    const result = persistParsedTranslations(db, {
      projectId,
      parsed: {
        status: 'ok',
        translations: [{ paragraphId: stableId, text: 'Đoạn thử.' }],
        termDeltas: [],
        memoryDeltas: [],
        warnings: [],
        recoveryUsed: false,
        protocolVersion: 1,
      },
      versionSource: 'AI_INITIAL',
    });
    expect(result.saved).toBe(1);
    const row = db.translations.getByParagraphId(paraUuid);
    expect(row?.translated_text).toBe('Đoạn thử.');
    expect(row?.version_source).toBe('AI_INITIAL');
    expect(row?.human_locked).toBe(0);
  });

  it('skips AI overwrite when human_locked', () => {
    const editionId = db.projects.getById(projectId)?.active_edition_id ?? null;
    db.translations.saveHumanEdit(paraUuid, 'Bản người sửa.', editionId);
    const result = persistParsedTranslations(db, {
      projectId,
      parsed: {
        status: 'ok',
        translations: [{ paragraphId: stableId, text: 'AI mới.' }],
        termDeltas: [],
        memoryDeltas: [],
        warnings: [],
        recoveryUsed: false,
        protocolVersion: 1,
      },
      versionSource: 'AI_REPAIR',
    });
    expect(result.skipped).toBe(1);
    expect(result.saved).toBe(0);
    expect(db.translations.getByParagraphId(paraUuid, editionId)?.translated_text).toBe(
      'Bản người sửa.',
    );
  });

  it('saveHumanEdit creates HUMAN_EDIT version with lock', () => {
    const service = new TranslationEditorService(db);
    const chapter = service.getChapter(projectId, chapterId);
    expect(chapter.paragraphs).toHaveLength(1);

    const saved = service.saveHumanParagraph(projectId, chapterId, stableId, 'Sửa tay.');
    expect(saved.paragraph.translatedText).toBe('Sửa tay.');
    expect(saved.paragraph.humanLocked).toBe(true);
    expect(saved.paragraph.versionSource).toBe('HUMAN_EDIT');

    const translationId = saved.paragraph.translationId;
    if (!translationId) throw new Error('missing translationId');
    const versions = db.translations.listVersions(translationId);
    expect(versions.length).toBeGreaterThanOrEqual(1);
    expect(versions[0]?.version_source).toBe('HUMAN_EDIT');
  });

  it('listVersions tracks append history', () => {
    db.translations.upsert({
      paragraph_id: paraUuid,
      translated_text: 'V1',
      version_source: 'AI_INITIAL',
    });
    db.translations.upsert({
      paragraph_id: paraUuid,
      translated_text: 'V2',
      version_source: 'AI_REPAIR',
    });
    const row = db.translations.getByParagraphId(paraUuid);
    if (!row) throw new Error('expected translation row');
    const versions = db.translations.listVersions(row.id);
    expect(versions.length).toBe(2);
    expect(versions[0]?.translated_text).toBe('V2');
  });
});
