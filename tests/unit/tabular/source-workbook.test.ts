import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import { SOURCE_WORKBOOK_WARNINGS } from '@shared/constants/source-workbook-tabular';
import { closeDatabase, getDatabase, initializeDatabase } from '@main/db/connection';
import { ensureDefaultEdition } from '@main/services/edition-service';
import { importPreviewService } from '@main/tabular/import-preview-service';
import { importCommitService } from '@main/tabular/import-commit-service';
import { tabularExportService } from '@main/tabular/tabular-export-service';
import { validateSourceWorkbookRow } from '@main/tabular/handlers/source-workbook-handler';

function excelCellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object' && 'result' in value) {
    const result = value.result;
    if (typeof result === 'string' || typeof result === 'number' || typeof result === 'boolean') {
      return String(result);
    }
  }
  if (typeof value === 'object' && 'richText' in value && Array.isArray(value.richText)) {
    return value.richText.map((part) => part.text).join('');
  }
  return '';
}

describe('source workbook', () => {
  let tempRoot: string;

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nts-src-wb-'));
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

  function seedChapterWithParagraph(source: string) {
    const db = getDatabase();
    const project = db.projects.create({
      title: 'Novel',
      source_language: 'zh-Hans',
      target_language: 'vi',
    });
    const edition = ensureDefaultEdition(db, project.id);
    const chapter = db.chapters.create({
      project_id: project.id,
      chapter_number: 1,
      sequence_order: 1,
      chapter_title: 'Ch1',
      display_title: 'Chapter One',
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
      translated_text: 'bản dịch',
      status: 'translated',
      version_source: 'AI_INITIAL',
    });
    return { project, edition, chapter, stableId, para };
  }

  it('exports CHAPTERS and PARAGRAPHS sheets with paragraph rows', async () => {
    const { project, stableId } = seedChapterWithParagraph('你好');
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nts-src-xlsx-'));
    const xlsxPath = path.join(tempDir, 'source.xlsx');
    await tabularExportService.export({
      dataType: 'source_workbook',
      format: 'xlsx',
      outputPath: xlsxPath,
      projectId: project.id,
    });

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(xlsxPath);
    const chapters = workbook.getWorksheet('CHAPTERS');
    const paragraphs = workbook.getWorksheet('PARAGRAPHS');
    if (!chapters || !paragraphs) throw new Error('expected CHAPTERS and PARAGRAPHS worksheets');
    expect(paragraphs.rowCount).toBeGreaterThan(1);
    const paraRow = paragraphs.getRow(2);
    expect(excelCellText(paraRow.getCell(2).value)).toBe(stableId);
    expect(excelCellText(paraRow.getCell(4).value)).toBe('你好');

    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('blocks source overwrite when linked folder without UPDATE_SOURCE_CONTENT', () => {
    const db = getDatabase();
    const { project, chapter, stableId } = seedChapterWithParagraph('old');
    db.getConnection()
      .prepare(`UPDATE projects SET source_mode = 'FOLDER' WHERE id = ?`)
      .run(project.id);
    db.chapters.updateSourceMetadata(chapter.id, {
      source_file_path: 'chapters/001.txt',
    });

    const result = validateSourceWorkbookRow(
      'PARAGRAPHS',
      { paragraph_id: stableId, source_text: 'new text' },
      2,
      { db, projectId: project.id, sourceImport: { mode: 'METADATA_ONLY' } },
    );
    expect(result.messages).toContain(SOURCE_WORKBOOK_WARNINGS.SOURCE_OVERWRITE_BLOCKED);
    expect(result.status).toBe('error');
  });

  it('updates paragraph source and marks needs_retranslation when translations exist', async () => {
    const { project, chapter, stableId, edition } = seedChapterWithParagraph('old source');
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nts-src-csv-'));
    const csvPath = path.join(tempDir, 'paragraphs.csv');
    fs.writeFileSync(
      csvPath,
      [
        'chapter_id,paragraph_id,sequence,source_text',
        `${chapter.id},${stableId},1,new source text`,
      ].join('\n'),
      'utf8',
    );

    const preview = await importPreviewService.preview({
      filePath: csvPath,
      projectId: project.id,
      dataTypeHint: 'source_workbook',
      sourceImportMode: 'UPDATE_SOURCE_CONTENT',
    });
    expect(preview.errorCount).toBe(0);
    expect(
      preview.rows.some((r) => r.messages.some((m) => m.includes(SOURCE_WORKBOOK_WARNINGS.NEEDS_RETRANSLATION))),
    ).toBe(true);

    const commit = importCommitService.commit({
      previewId: preview.previewId,
      mode: 'IMPORT_VALID_ONLY',
      projectId: project.id,
      sourceImportMode: 'UPDATE_SOURCE_CONTENT',
    });
    expect(commit.updated).toBe(1);

    const db = getDatabase();
    const para = db.paragraphs.getByStableId(stableId);
    expect(para?.source_text).toBe('new source text');
    const updatedChapter = db.chapters.getById(chapter.id);
    expect(updatedChapter?.status).toBe('needs_retranslation');
    expect(updatedChapter?.source_status).toBe('SOURCE_MODIFIED');
    if (!para) throw new Error('expected paragraph');
    expect(db.translations.getByParagraphId(para.id, edition.id)?.translated_text).toBe('bản dịch');

    fs.rmSync(tempDir, { recursive: true, force: true });
  });
});
