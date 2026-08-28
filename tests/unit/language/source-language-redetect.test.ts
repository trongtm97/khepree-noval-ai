import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resolveAppPaths } from '@main/services/paths-service';
import { createDatabaseManager, closeDatabase } from '@main/db/connection';
import type { DatabaseManager } from '@main/db/database-manager';
import { redetectProjectSourceLanguage } from '@main/services/source-language-redetect';
import { ensureDefaultEdition } from '@main/services/edition-service';

const KO =
  '안녕하세요. 이것은 한국어 소설입니다. 주인공은 서울에 살고 있습니다. 이야기는 현대 한국을 배경으로 합니다.';

describe('source language re-detect with translations', () => {
  let tempRoot: string;
  let db: DatabaseManager;
  let projectId: string;
  let chapterFile: string;

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nts-redetect-'));
    const paths = resolveAppPaths(tempRoot);
    closeDatabase();
    db = createDatabaseManager({ dataDir: paths.data, backupsDir: paths.backups });

    const project = db.projects.create({
      title: 'Redetect Novel',
      source_language: 'ja',
      source_language_hint: 'ja',
      source_language_mode: 'HINTED',
    });
    projectId = project.id;
    ensureDefaultEdition(db, projectId);

    chapterFile = path.join(tempRoot, 'ch1.txt');
    fs.writeFileSync(chapterFile, KO, 'utf8');

    const chapter = db.chapters.create({
      project_id: projectId,
      chapter_number: 1,
      sequence_order: 1,
      source_file_path: chapterFile,
      source_text: KO,
    });
    const para = db.paragraphs.create({
      chapter_id: chapter.id,
      paragraph_id: '[C000001:P000001]',
      sequence: 1,
      source_text: KO,
    });
    db.translations.upsert({
      paragraph_id: para.id,
      translated_text: 'Bản dịch thử.',
      version_source: 'AI_INITIAL',
    });
  });

  afterEach(() => {
    db.close();
    closeDatabase();
    try {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    } catch {
      /* Windows EBUSY */
    }
  });

  it('TEST 13: does not silently change when project has translations', async () => {
    const preview = await redetectProjectSourceLanguage(db, projectId, { apply: false });
    expect(preview.changed).toBe(true);
    expect(preview.hasTranslations).toBe(true);
    expect(preview.requiresConfirmation).toBe(true);
    expect(preview.applied).toBe(false);
    expect(preview.detection.detectedLanguage).toBe('ko');

    const row = db.projects.getById(projectId);
    expect(row?.source_language).toBe('ja');
  });
});
