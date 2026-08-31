import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import {
  NTS_TABULAR_FORMAT,
  TABULAR_META_SHEET,
  TABULAR_SCHEMA_VERSION,
} from '@shared/constants/tabular';
import { detectCsvDelimiter, parseCsvRows } from '@main/tabular/csv-utils';
import { parseTabularFile } from '@main/tabular/tabular-file-parser';
import { tabularSchemaRegistry } from '@main/tabular/tabular-schema-registry';
import { closeDatabase, initializeDatabase } from '@main/db/connection';
import { importPreviewService } from '@main/tabular/import-preview-service';
import { importCommitService } from '@main/tabular/import-commit-service';

describe('tabular csv utils', () => {
  it('detects semicolon delimiter for EU Excel CSV', () => {
    const sample = 'source_text;preferred_translation\n你好;xin chào';
    expect(detectCsvDelimiter(sample)).toBe(';');
  });

  it('parses UTF-8 BOM CSV with comma delimiter', () => {
    const text = '\uFEFFsource_text,preferred_translation\n你好,hello';
    const rows = parseCsvRows(text, ',');
    expect(rows).toHaveLength(1);
    expect(rows[0].source_text).toBe('你好');
    expect(rows[0].preferred_translation).toBe('hello');
  });
});

describe('tabular xlsx parser', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nts-tabular-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('reads _META sheet and data sheet without evaluating formulas', async () => {
    const filePath = path.join(tempDir, 'terms.xlsx');
    const workbook = new ExcelJS.Workbook();
    const meta = workbook.addWorksheet(TABULAR_META_SHEET);
    meta.addRow(['khepree_format', NTS_TABULAR_FORMAT]);
    meta.addRow(['schema_version', String(TABULAR_SCHEMA_VERSION)]);
    meta.addRow(['data_type', 'terms']);

    const data = workbook.addWorksheet('terms');
    data.addRow(['source_text', 'target_text', 'source_language', 'target_language']);
    data.addRow(['测试', 'test', 'zh-Hans', 'vi']);

    await workbook.xlsx.writeFile(filePath);

    const parsed = await parseTabularFile(filePath);
    expect(parsed.meta?.khepree_format).toBe(NTS_TABULAR_FORMAT);
    expect(parsed.meta?.data_type).toBe('terms');
    const sheet = parsed.sheets.get('terms');
    expect(sheet?.rows).toHaveLength(1);
    expect(sheet?.rows[0].source_text).toBe('测试');
  });
});

describe('tabular import commit', () => {
  let tempRoot: string;

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nts-tabular-db-'));
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

  it('imports terms idempotently by natural key', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nts-tabular-csv-'));
    const csvPath = path.join(tempDir, 'terms.csv');
    fs.writeFileSync(
      csvPath,
      'source_text,target_text,source_language,target_language,scope\n灵石,linh thạch,zh-Hans,vi,GLOBAL\n',
      'utf8',
    );

    const preview = await importPreviewService.preview({
      filePath: csvPath,
      dataTypeHint: 'terms',
    });
    expect(preview.validCount).toBe(1);

    const first = importCommitService.commit({
      previewId: preview.previewId,
      mode: 'IMPORT_VALID_ONLY',
      duplicateStrategy: 'MERGE',
    });
    expect(first.inserted).toBe(1);

    const preview2 = await importPreviewService.preview({
      filePath: csvPath,
      dataTypeHint: 'terms',
      duplicateStrategy: 'MERGE',
    });
    const second = importCommitService.commit({
      previewId: preview2.previewId,
      mode: 'IMPORT_VALID_ONLY',
      duplicateStrategy: 'MERGE',
    });
    expect(second.updated).toBe(1);
    expect(second.inserted).toBe(0);

    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('keeps zh→vi and zh→en as separate natural keys', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nts-tabular-pair-'));
    const csvPath = path.join(tempDir, 'pairs.csv');
    fs.writeFileSync(
      csvPath,
      'source_text,target_text,source_language,target_language,scope\n灵石,linh thạch,zh-Hans,vi,GLOBAL\n灵石,spirit stone,zh-Hans,en,GLOBAL\n',
      'utf8',
    );

    const preview = await importPreviewService.preview({
      filePath: csvPath,
      dataTypeHint: 'terms',
      duplicateStrategy: 'MERGE',
    });
    expect(preview.validCount).toBe(2);

    const result = importCommitService.commit({
      previewId: preview.previewId,
      mode: 'IMPORT_VALID_ONLY',
      duplicateStrategy: 'MERGE',
    });
    expect(result.inserted).toBe(2);

    fs.rmSync(tempDir, { recursive: true, force: true });
  });
});

describe('tabular schema registry', () => {
  it('detects terms handler from headers', () => {
    const type = tabularSchemaRegistry.detectDataType([
      'source_text',
      'preferred_translation',
    ]);
    expect(type).toBe('terms');
  });
});
