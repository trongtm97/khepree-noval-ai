import type { MetadataSource } from '@shared/constants/book-metadata';

export interface ParsedBookMetadata {
  titleCn?: string;
  titleVi?: string;
  titleOriginal?: string;
  alternativeTitles?: string[];
  authorName?: string;
  authorNameCn?: string;
  genre?: string;
  subgenres?: string[];
  publicationStatus?: string;
  expectedChapterCount?: number;
  description?: string;
  introduction?: string;
  officialSummary?: string;
  notes?: string;
  unclassifiedNotes?: string;
}

interface FieldMapping {
  field: keyof ParsedBookMetadata;
  keys: string[];
}

const FIELD_MAPPINGS: FieldMapping[] = [
  {
    field: 'titleCn',
    keys: ['tên truyện', 'tên gốc', 'title', '作品名', '书名', '小说名', '原名'],
  },
  {
    field: 'titleVi',
    keys: ['tên tiếng việt', 'tên việt', 'vietnamese title', '越南语名'],
  },
  {
    field: 'titleOriginal',
    keys: ['tên khác', 'alternative title', 'english title', '英文名', '别名'],
  },
  {
    field: 'authorName',
    keys: ['tác giả', 'author', '作者', '作家'],
  },
  {
    field: 'authorNameCn',
    keys: ['tác giả gốc', 'author cn', '作者原名'],
  },
  {
    field: 'genre',
    keys: ['thể loại', 'genre', '类型', '分类', '类别'],
  },
  {
    field: 'publicationStatus',
    keys: ['trạng thái', 'status', '状态', '连载状态'],
  },
  {
    field: 'expectedChapterCount',
    keys: ['tổng số chương', 'tổng chương', 'total chapters', 'chapter count', '总章节', '章节数'],
  },
  {
    field: 'description',
    keys: ['mô tả', 'description', '简介', '作品简介', '介绍'],
  },
  {
    field: 'introduction',
    keys: ['giới thiệu', 'introduction', '前言介绍'],
  },
  {
    field: 'officialSummary',
    keys: ['tóm tắt', 'summary', '内容简介', '内容概要', '故事简介'],
  },
  {
    field: 'notes',
    keys: ['ghi chú', 'notes', '备注', '说明'],
  },
];

function normalizeKey(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[:：]\s*$/, '')
    .replace(/\s+/g, ' ');
}

function findFieldForKey(key: string): keyof ParsedBookMetadata | null {
  const normalized = normalizeKey(key);
  for (const mapping of FIELD_MAPPINGS) {
    if (mapping.keys.some((k) => normalized === k || normalized.includes(k))) {
      return mapping.field;
    }
  }
  return null;
}

function parseListValue(value: string): string[] {
  return value
    .split(/[,，、|/;；\n]+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function assignField(
  result: ParsedBookMetadata,
  field: keyof ParsedBookMetadata,
  value: string,
): void {
  const trimmed = value.trim();
  if (!trimmed) return;

  if (field === 'alternativeTitles' || field === 'subgenres') {
    const items = parseListValue(trimmed);
    const existing =
      field === 'alternativeTitles'
        ? (result.alternativeTitles ?? [])
        : (result.subgenres ?? []);
    if (field === 'alternativeTitles') {
      result.alternativeTitles = [...existing, ...items];
    } else {
      result.subgenres = [...existing, ...items];
    }
    return;
  }

  if (field === 'expectedChapterCount') {
    const digits = trimmed.replace(/[^\d]/g, '');
    const num = Number.parseInt(digits, 10);
    if (Number.isFinite(num) && num > 0) {
      result.expectedChapterCount = num;
    }
    return;
  }

  if (field === 'titleOriginal') {
    result.alternativeTitles = parseListValue(trimmed);
    result.titleOriginal = trimmed;
    return;
  }

  if (field === 'genre') {
    const parts = parseListValue(trimmed);
    result.genre = parts[0];
    if (parts.length > 1) {
      result.subgenres = parts.slice(1);
    }
    return;
  }

  (result as Record<string, unknown>)[field] = trimmed;
}

/** Parse _BOOK_INFO.txt content with VI/ZH/EN key support. */
export function parseBookInfoText(text: string): ParsedBookMetadata {
  const result: ParsedBookMetadata = {};
  const unclassified: string[] = [];

  const lines = text.replace(/\r\n/g, '\n').split('\n');
  let currentField: keyof ParsedBookMetadata | 'unclassified' | null = null;
  let buffer: string[] = [];

  const flush = (): void => {
    if (!currentField || buffer.length === 0) {
      buffer = [];
      return;
    }
    const value = buffer.join('\n').trim();
    if (currentField === 'unclassified') {
      if (value) unclassified.push(value);
    } else {
      assignField(result, currentField, value);
    }
    buffer = [];
    currentField = null;
  };

  for (const line of lines) {
    const colonMatch = /^([^:：]{1,40})[:：]\s*(.*)$/u.exec(line);
    if (colonMatch) {
      flush();
      const key = colonMatch[1];
      const inlineValue = colonMatch[2];
      const field = findFieldForKey(key);
      if (field) {
        currentField = field;
        if (inlineValue.trim()) {
          buffer = [inlineValue];
          flush();
        }
      } else {
        currentField = 'unclassified';
        buffer = [`${key}: ${inlineValue}`.trim()];
        flush();
      }
      continue;
    }

    if (currentField) {
      buffer.push(line);
    } else if (line.trim()) {
      unclassified.push(line.trim());
    }
  }

  flush();

  if (unclassified.length > 0) {
    result.unclassifiedNotes = unclassified.join('\n');
    const existingNotes = result.notes?.trim();
    result.notes = [existingNotes, result.unclassifiedNotes].filter(Boolean).join('\n\n');
  }

  return result;
}

export interface MetadataFieldState {
  source: MetadataSource;
  confidence: number;
  locked: boolean;
}

export type MetadataFieldsMap = Partial<Record<keyof ParsedBookMetadata, MetadataFieldState>>;

export function buildMetadataFieldsFromSource(
  source: MetadataSource,
  confidence = 0.9,
): MetadataFieldsMap {
  const fields: MetadataFieldsMap = {};
  for (const mapping of FIELD_MAPPINGS) {
    fields[mapping.field] = { source, confidence, locked: false };
  }
  return fields;
}
