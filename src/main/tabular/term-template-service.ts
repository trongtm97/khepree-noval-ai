import ExcelJS from 'exceljs';
import { APP_NAME } from '@shared/constants/app';
import fs from 'node:fs';
import path from 'node:path';
import {
  NTS_TABULAR_FORMAT,
  TABULAR_META_SHEET,
  TABULAR_SCHEMA_VERSION,
} from '@shared/constants/tabular';
import { TERM_TABULAR_COLUMNS } from '@shared/constants/term-tabular';
import { buildMetaSheetRows } from './tabular-file-parser';

const SAMPLE_ROWS: Record<string, string>[] = [
  {
    term_id: '',
    source_language: 'zh-Hans',
    target_language: 'vi',
    source_text: '灵石',
    target_text: 'linh thạch',
    source_variants: '靈石',
    target_variants: '',
    transliteration: 'líng shí',
    transliteration_system: 'pinyin',
    term_type: 'ITEM',
    scope: 'PROJECT',
    scope_ref: '',
    status: 'CANDIDATE',
    locked: '0',
    confidence: '0.9',
    occurrence_count: '0',
    notes: 'Ví dụ thuật ngữ',
    simplified: '灵石',
    traditional: '靈石',
    pinyin: 'líng shí',
  },
  {
    term_id: '',
    source_language: 'zh-Hans',
    target_language: 'en',
    source_text: '王林',
    target_text: 'Wang Lin',
    source_variants: '',
    target_variants: 'Wang Ling',
    transliteration: 'Wáng Lín',
    transliteration_system: 'pinyin',
    term_type: 'PERSON',
    scope: 'PROJECT',
    scope_ref: '',
    status: 'CANDIDATE',
    locked: '0',
    confidence: '',
    occurrence_count: '0',
    notes: 'Different target language — separate row',
    simplified: '王林',
    traditional: '',
    pinyin: 'Wáng Lín',
  },
];

export async function writeTermVaultTemplate(outputPath: string): Promise<string> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = APP_NAME;
  workbook.created = new Date();

  const meta = {
    khepree_format: NTS_TABULAR_FORMAT,
    schema_version: TABULAR_SCHEMA_VERSION,
    exported_at: new Date().toISOString(),
    data_type: 'terms' as const,
  };

  const metaSheet = workbook.addWorksheet(TABULAR_META_SHEET);
  for (const [key, value] of buildMetaSheetRows(meta)) {
    metaSheet.addRow([key, value]);
  }

  const headers = [...TERM_TABULAR_COLUMNS];
  const dataSheet = workbook.addWorksheet('terms');
  dataSheet.addRow(headers);
  for (const row of SAMPLE_ROWS) {
    dataSheet.addRow(headers.map((h) => row[h] ?? ''));
  }

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  await workbook.xlsx.writeFile(outputPath);
  return outputPath;
}
