import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { resolveAppPaths } from '@main/services/paths-service';
import { createDatabaseManager, closeDatabase } from '@main/db/connection';
import type { DatabaseManager } from '@main/db/database-manager';

describe('clearAiByChapter', () => {
  let tempRoot: string;
  let db: DatabaseManager;
  let projectId: string;
  let chapterId: string;
  let aiParaId: string;
  let lockedParaId: string;

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nts-clear-'));
    const paths = resolveAppPaths(tempRoot);
    closeDatabase();
    db = createDatabaseManager({ dataDir: paths.data, backupsDir: paths.backups });
    projectId = db.projects.create({ title: 'Clear Novel' }).id;
    const chapter = db.chapters.create({
      project_id: projectId,
      chapter_number: 1,
      sequence_order: 1,
      source_text: 'A。B。',
    });
    chapterId = chapter.id;
    aiParaId = db.paragraphs.create({
      chapter_id: chapterId,
      paragraph_id: '[C000001:P000001]',
      sequence: 1,
      source_text: 'A。',
    }).id;
    lockedParaId = db.paragraphs.create({
      chapter_id: chapterId,
      paragraph_id: '[C000001:P000002]',
      sequence: 2,
      source_text: 'B。',
    }).id;

    db.translations.upsert({
      paragraph_id: aiParaId,
      translated_text: 'AI A',
      version_source: 'AI_INITIAL',
      human_locked: false,
    });
    db.translations.saveHumanEdit(lockedParaId, 'Human B');
  });

  afterEach(() => {
    db.close();
    closeDatabase();
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it('deletes unlocked AI rows and keeps human_locked', () => {
    const result = db.translations.clearAiByChapter(chapterId);
    expect(result.deleted).toBe(1);
    expect(result.keptLocked).toBe(1);
    expect(db.translations.getByParagraphId(aiParaId)).toBeNull();
    expect(db.translations.getByParagraphId(lockedParaId)?.translated_text).toBe('Human B');
    expect(db.translations.getByParagraphId(lockedParaId)?.human_locked).toBe(1);
  });
});
