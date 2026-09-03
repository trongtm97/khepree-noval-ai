import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TRANSLATION_SPREADSHEET_COLUMNS, TRANSLATION_SPREADSHEET_WARNINGS } from '@shared/constants/translation-spreadsheet';
import { closeDatabase, getDatabase, initializeDatabase } from '@main/db/connection';
import { ensureDefaultEdition } from '@main/services/edition-service';
import { detectTranslationConflict } from '@main/tabular/handlers/translations-handler';
import { importPreviewService } from '@main/tabular/import-preview-service';
import { importCommitService } from '@main/tabular/import-commit-service';
import { translationsTabularHandler } from '@main/tabular/handlers/translations-handler';

describe('translation spreadsheet', () => {
  let tempRoot: string;

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nts-trans-sheet-'));
    closeDatabase();
    initializeDatabase({
      dataDir: path.join(tempRoot, 'data'),
      backupsDir: path.join(tempRoot, 'backups'),
    });
  });

  afterEach(() => {
    closeDatabase();
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  function seedProjectWithParagraph(source: string, translated: string) {
    const db = getDatabase();
    const project = db.projects.create({
      title: 'Test',
      source_language: 'zh-Hans',
      target_language: 'vi',
    });
    const edition = ensureDefaultEdition(db, project.id);

    const chapter = db.chapters.create({
      project_id: project.id,
      chapter_number: 1,
      sequence_order: 1,
      chapter_title: 'Ch1',
    });

    const stableId = '[C000001:P000001]';
    const para = db.paragraphs.create({
      chapter_id: chapter.id,
      paragraph_id: stableId,
      sequence: 1,
      source_text: source,
    });

    db.translations.create({
      paragraph_id: para.id,
      edition_id: edition.id,
      translated_text: translated,
      status: 'translated',
      version_source: 'AI_INITIAL',
    });

    return { projectId: project.id, editionId: edition.id, stableId, paraUuid: para.id };
  }

  it('detects conflict when app updated after export', () => {
    const older = '2020-01-01T00:00:00.000Z';
    const newer = '2025-01-01T00:00:00.000Z';
    expect(
      detectTranslationConflict(older, newer, 'Excel text', 'App text'),
    ).toBe(true);
    expect(
      detectTranslationConflict(newer, older, 'Same', 'Same'),
    ).toBe(false);
  });

  it('roundtrips unicode and RTL without shifting paragraph_id', async () => {
    const source = '你好世界';
    const translated = 'مرحبا بالعالم';
    const { projectId, editionId, stableId } = seedProjectWithParagraph(source, 'old vi');

    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nts-trans-csv-'));
    const csvPath = path.join(tempDir, 'translations.csv');
    fs.writeFileSync(
      csvPath,
      [
        'project_id,edition_id,chapter_number,chapter_title,paragraph_id,source_text,translated_text,translation_status,human_locked,qa_status,notes,updated_at',
        `${projectId},${editionId},1,Ch1,${stableId},${source},${translated},reviewed,1,,note,2020-01-01T00:00:00.000Z`,
      ].join('\n'),
      'utf8',
    );

    const preview = await importPreviewService.preview({
      filePath: csvPath,
      projectId,
      editionId,
      dataTypeHint: 'translations',
      conflictStrategy: 'USE_EXCEL',
    });
    expect(preview.validCount + preview.warningCount).toBeGreaterThan(0);

    const commit = importCommitService.commit({
      previewId: preview.previewId,
      mode: 'IMPORT_VALID_ONLY',
      projectId,
      editionId,
      conflictStrategy: 'USE_EXCEL',
    });
    expect(commit.updated).toBe(1);

    const db = getDatabase();
    const para = db.paragraphs.getByStableId(stableId);
    expect(para?.paragraph_id).toBe(stableId);
    if (!para) throw new Error('expected paragraph');
    const tr = db.translations.getByParagraphId(para.id, editionId);
    expect(tr?.translated_text).toBe(translated);
    if (!tr) throw new Error('expected translation');
    const versions = db.translations.listVersions(tr.id);
    expect(versions.length).toBeGreaterThanOrEqual(2);
    expect(versions[0]?.version_source).toBe('HUMAN_EDIT');

    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('warns SOURCE_CHANGED without overwriting source', () => {
    const { projectId, editionId } = seedProjectWithParagraph('原文', 'dịch');
    const result = translationsTabularHandler.validateRow(
      {
        paragraph_id: '[C000001:P000001]',
        source_text: 'changed source',
        translated_text: 'dịch mới',
        project_id: projectId,
        edition_id: editionId,
      },
      2,
      {
        db: getDatabase(),
        projectId,
        editionId,
      },
    );
    expect(result.messages).toContain(TRANSLATION_SPREADSHEET_WARNINGS.SOURCE_CHANGED);
    expect(result.normalized.source_text).toBe('原文');
  });

  it('flags CONFLICT_APP_NEWER when app text changed after export', () => {
    const { projectId, editionId, stableId } = seedProjectWithParagraph('原文', 'app newer');
    const db = getDatabase();
    const para = db.paragraphs.getByStableId(stableId);
    if (!para) throw new Error('expected paragraph');
    const tr = db.translations.getByParagraphId(para.id, editionId);
    if (!tr) throw new Error('expected translation');
    db.getConnection()
      .prepare(`UPDATE translations SET updated_at = ?, translated_text = ? WHERE id = ?`)
      .run('2025-06-01T00:00:00.000Z', 'app newer', tr.id);

    const result = translationsTabularHandler.validateRow(
      {
        paragraph_id: stableId,
        source_text: '原文',
        translated_text: 'excel old',
        project_id: projectId,
        edition_id: editionId,
        updated_at: '2020-01-01T00:00:00.000Z',
      },
      2,
      { db, projectId, editionId },
    );
    expect(result.messages).toContain(TRANSLATION_SPREADSHEET_WARNINGS.CONFLICT_APP_NEWER);
  });
});

const RUN_PERF = process.env.TABULAR_PERF === '1';

describe.skipIf(!RUN_PERF)('translation spreadsheet performance', () => {
  let tempRoot: string;

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nts-trans-perf-'));
    closeDatabase();
    initializeDatabase({
      dataDir: path.join(tempRoot, 'data'),
      backupsDir: path.join(tempRoot, 'backups'),
    });
  });

  afterEach(() => {
    closeDatabase();
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it('roundtrips 50k paragraphs without shifting ids', async () => {
    const db = getDatabase();
    const project = db.projects.create({
      title: 'Perf Novel',
      source_language: 'zh-Hans',
      target_language: 'vi',
    });
    const edition = ensureDefaultEdition(db, project.id);
    const chapter = db.chapters.create({
      project_id: project.id,
      chapter_number: 1,
      sequence_order: 1,
      chapter_title: 'Bulk',
    });

    const conn = db.getConnection();
    const insertPara = conn.prepare(
      `INSERT INTO chapter_paragraphs (id, chapter_id, paragraph_id, sequence, source_text, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
    );
    const insertTr = conn.prepare(
      `INSERT INTO translations (id, paragraph_id, edition_id, translated_text, status, version_source, human_locked, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'translated', 'AI_INITIAL', 0, datetime('now'), datetime('now'))`,
    );
    const bulk = conn.transaction(() => {
      for (let i = 1; i <= 50_000; i += 1) {
        const pid = `[C000001:P${String(i).padStart(6, '0')}]`;
        const uuid = randomUUID();
        insertPara.run(uuid, chapter.id, pid, i, `源${i}`);
        insertTr.run(randomUUID(), uuid, edition.id, `vi ${i}`);
      }
    });
    bulk();

    const exportRows = translationsTabularHandler.exportRows({
      db,
      projectId: project.id,
      editionId: edition.id,
    });
    expect(exportRows).toHaveLength(50_000);

    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nts-trans-perf-csv-'));
    const csvPath = path.join(tempDir, 'bulk.csv');
    const lines = [TRANSLATION_SPREADSHEET_COLUMNS.join(',')];
    for (const row of exportRows) {
      const edited =
        row.paragraph_id === '[C000001:P000001]'
          ? { ...row, translated_text: 'edited vi 1', updated_at: '2020-01-01T00:00:00.000Z' }
          : row;
      lines.push(
        TRANSLATION_SPREADSHEET_COLUMNS.map((col) => edited[col] ?? '').join(','),
      );
    }
    fs.writeFileSync(csvPath, lines.join('\n'), 'utf8');

    const start = performance.now();
    const preview = await importPreviewService.preview({
      filePath: csvPath,
      projectId: project.id,
      editionId: edition.id,
      dataTypeHint: 'translations',
      conflictStrategy: 'USE_EXCEL',
    });
    const commit = importCommitService.commit({
      previewId: preview.previewId,
      mode: 'IMPORT_VALID_ONLY',
      projectId: project.id,
      editionId: edition.id,
      conflictStrategy: 'USE_EXCEL',
    });
    const elapsed = performance.now() - start;

    expect(commit.updated).toBeGreaterThanOrEqual(1);
    expect(db.paragraphs.getByStableId('[C000001:P000001]')?.paragraph_id).toBe(
      '[C000001:P000001]',
    );
    expect(db.paragraphs.getByStableId('[C000001:P050000]')?.paragraph_id).toBe(
      '[C000001:P050000]',
    );
    const firstPara = db.paragraphs.getByStableId('[C000001:P000001]');
    if (!firstPara) throw new Error('expected first paragraph');
    expect(db.translations.getByParagraphId(firstPara.id, edition.id)?.translated_text).toBe(
      'edited vi 1',
    );
    expect(elapsed).toBeLessThan(180_000);

    fs.rmSync(tempDir, { recursive: true, force: true });
  });
});
