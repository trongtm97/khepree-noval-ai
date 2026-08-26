import path from 'node:path';
import { parseTxtFile, parseTxtBuffer } from './txt-parser';
import { parseDocxFile, parseDocxBuffer } from './docx-parser';
import { parseEpubFile, parseEpubBuffer } from './epub-parser';

export type ImportFormat = 'txt' | 'epub' | 'docx';

export interface ParsedSource {
  text: string;
  format: ImportFormat;
  encoding?: string;
  encodingConfidence?: number;
  byteLength?: number;
}

export function detectFormat(filePath: string): ImportFormat {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.txt' || ext === '.text') return 'txt';
  if (ext === '.epub') return 'epub';
  if (ext === '.docx') return 'docx';
  throw new Error(`Unsupported import format: ${ext || '(none)'}`);
}

export async function parseImportFile(filePath: string): Promise<ParsedSource> {
  const format = detectFormat(filePath);
  if (format === 'txt') {
    const result = await parseTxtFile(filePath);
    return {
      text: result.text,
      format,
      encoding: result.encoding,
      encodingConfidence: result.confidence,
      byteLength: result.byteLength,
    };
  }
  if (format === 'epub') {
    const result = await parseEpubFile(filePath);
    return { text: result.text, format };
  }
  const result = await parseDocxFile(filePath);
  return { text: result.text, format };
}

export async function parseImportBuffer(
  buffer: Buffer,
  format: ImportFormat,
): Promise<ParsedSource> {
  if (format === 'txt') {
    const result = parseTxtBuffer(buffer);
    return {
      text: result.text,
      format,
      encoding: result.encoding,
      encodingConfidence: result.confidence,
      byteLength: buffer.length,
    };
  }
  if (format === 'epub') {
    const result = await parseEpubBuffer(buffer);
    return { text: result.text, format };
  }
  const result = await parseDocxBuffer(buffer);
  return { text: result.text, format };
}
