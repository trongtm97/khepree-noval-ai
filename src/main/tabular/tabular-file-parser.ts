import fs from 'node:fs';
import path from 'node:path';
import ExcelJS from 'exceljs';
import {
  NTS_TABULAR_FORMAT,
  TABULAR_META_SHEET,
  TABULAR_SCHEMA_VERSION,
  type TabularFormat,
} from '@shared/constants/tabular';
import { TabularMetaSchema, type TabularMeta } from '@shared/schemas/tabular';
import { detectAndDecode } from '../import/encoding';
import {
  detectCsvDelimiter,
  normalizeHeader,
  parseCsvRows,
} from './csv-utils';
import type { ParsedTabularFile } from './types';

export function detectFormat(filePath: string): TabularFormat | null {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.csv') return 'csv';
  if (ext === '.xlsx') return 'xlsx';
  return null;
}

export async function parseTabularFile(filePath: string): Promise<ParsedTabularFile> {
  const format = detectFormat(filePath);
  if (!format) throw new Error(`Unsupported tabular format: ${filePath}`);
  const fileName = path.basename(filePath);
  if (format === 'csv') return parseCsvFile(filePath, fileName);
  return parseXlsxFile(filePath, fileName);
}

function parseCsvFile(filePath: string, fileName: string): ParsedTabularFile {
  const buffer = fs.readFileSync(filePath);
  const decoded = detectAndDecode(buffer);
  const delimiter = detectCsvDelimiter(decoded.text.slice(0, 8192));
  const rows = parseCsvRows(decoded.text, delimiter);
  const headers = rows.length > 0 ? Object.keys(rows[0]) : [];
  const sheets = new Map<string, { headers: string[]; rows: Record<string, string>[] }>();
  sheets.set('data', { headers, rows });

  const meta = readCsvMetaSidecar(filePath) ?? parseCsvHeaderComments(decoded.text);
  return { format: 'csv', fileName, meta, sheets };
}

function readCsvMetaSidecar(filePath: string): TabularMeta | undefined {
  const sidecar = `${filePath}.meta.json`;
  if (!fs.existsSync(sidecar)) return undefined;
  try {
    const raw = JSON.parse(fs.readFileSync(sidecar, 'utf8')) as unknown;
    return TabularMetaSchema.parse(raw);
  } catch {
    return undefined;
  }
}

function parseCsvHeaderComments(text: string): TabularMeta | undefined {
  const lines = text.split(/\r?\n/).slice(0, 20);
  const meta: Record<string, string> = {};
  for (const line of lines) {
    const m = line.match(/^#\s*([a-z_]+)\s*[:=]\s*(.+)$/i);
    if (!m) continue;
    meta[normalizeHeader(m[1])] = m[2].trim();
  }
  if (Object.keys(meta).length === 0) return undefined;
  return TabularMetaSchema.parse(meta);
}

async function parseXlsxFile(filePath: string, fileName: string): Promise<ParsedTabularFile> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  const sheets = new Map<string, { headers: string[]; rows: Record<string, string>[] }>();
  let meta: TabularMeta | undefined;

  for (const sheet of workbook.worksheets) {
    const name = sheet.name;
    if (name === TABULAR_META_SHEET) {
      meta = parseMetaSheet(sheet);
      continue;
    }
    const parsed = parseDataSheet(sheet);
    if (parsed.headers.length > 0) {
      sheets.set(name, parsed);
    }
  }

  if (sheets.size === 0 && workbook.worksheets[0]) {
    const parsed = parseDataSheet(workbook.worksheets[0]);
    sheets.set(workbook.worksheets[0].name || 'data', parsed);
  }

  return { format: 'xlsx', fileName, meta, sheets };
}

function parseMetaSheet(sheet: ExcelJS.Worksheet): TabularMeta | undefined {
  const meta: Record<string, string> = {};
  sheet.eachRow((row) => {
    const key = cellToString(row.getCell(1)).trim();
    const value = cellToString(row.getCell(2)).trim();
    if (key) meta[normalizeHeader(key)] = value;
  });
  if (Object.keys(meta).length === 0) return undefined;
  return TabularMetaSchema.parse(meta);
}

function parseDataSheet(sheet: ExcelJS.Worksheet): {
  headers: string[];
  rows: Record<string, string>[];
} {
  const headerRow = sheet.getRow(1);
  const rawHeaders: string[] = [];
  headerRow.eachCell({ includeEmpty: true }, (cell, col) => {
    rawHeaders[col - 1] = cellToString(cell).trim();
  });
  const headers = rawHeaders.map(normalizeHeader).filter(Boolean);
  const rows: Record<string, string>[] = [];

  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const data: Record<string, string> = {};
    let hasValue = false;
    headers.forEach((h, idx) => {
      const value = cellToString(row.getCell(idx + 1)).trim();
      if (value) hasValue = true;
      data[h] = value;
    });
    if (hasValue) rows.push(data);
  });

  return { headers, rows };
}

/** Never evaluate formulas — use cached result / text only. */
export function cellToString(cell: ExcelJS.Cell): string {
  const value = cell.value;
  if (value == null) return '';
  if (typeof value === 'object') {
    if ('result' in value && value.result != null) {
      return stringifyPrimitive(value.result);
    }
    if ('text' in value && typeof value.text === 'string') return value.text;
    if ('richText' in value && Array.isArray(value.richText)) {
      return value.richText.map((p) => p.text ?? '').join('');
    }
    if (value instanceof Date) return value.toISOString();
    return '';
  }
  return stringifyPrimitive(value);
}

function stringifyPrimitive(value: unknown): string {
  if (value == null) return '';
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object') return '';
  return String(value);
}

export function buildMetaSheetRows(meta: TabularMeta): [string, string][] {
  return Object.entries(meta).map(([k, v]) => [k, v == null ? '' : String(v)]);
}

export function assertNovelTransMeta(meta: TabularMeta | undefined): void {
  if (!meta) return;
  if (meta.noveltrans_format && meta.noveltrans_format !== NTS_TABULAR_FORMAT) {
    throw new Error(`Unsupported noveltrans_format: ${meta.noveltrans_format}`);
  }
  if (meta.schema_version != null && Number(meta.schema_version) > TABULAR_SCHEMA_VERSION) {
    throw new Error(
      `Unsupported schema_version ${meta.schema_version} (max ${TABULAR_SCHEMA_VERSION})`,
    );
  }
}
