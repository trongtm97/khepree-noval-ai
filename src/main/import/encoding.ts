import iconv from 'iconv-lite';
import jschardet from 'jschardet';
import {
  getTextLanguageAdapter,
  chineseTextAdapter,
} from '../language/text-adapters';
import { normalizeLanguageCode } from '@shared/constants/language-profile';

export type DetectedEncoding =
  | 'utf-8'
  | 'utf-8-bom'
  | 'gb18030'
  | 'gbk'
  | 'shift_jis'
  | 'euc-kr'
  | 'unknown';

export interface DecodeResult {
  text: string;
  encoding: DetectedEncoding;
  confidence: number;
}

export interface DecodeOptions {
  /** Project / detected source language — selects TextLanguageAdapter encoding path. */
  sourceLanguage?: string | null;
}

function hasUtf8Bom(buf: Buffer): boolean {
  return buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf;
}

function looksLikeValidUtf8(buf: Buffer): boolean {
  try {
    const decoded = buf.toString('utf8');
    const replacement = (decoded.match(/\uFFFD/g) ?? []).length;
    return replacement === 0 || replacement / Math.max(decoded.length, 1) < 0.001;
  } catch {
    return false;
  }
}

function isMostlyAscii(buf: Buffer): boolean {
  let ascii = 0;
  const n = Math.min(buf.length, 4096);
  for (let i = 0; i < n; i += 1) {
    if (buf[i] < 0x80) ascii += 1;
  }
  return ascii / n > 0.95;
}

function cjkScore(text: string): number {
  const sample = text.slice(0, 8000);
  const cjk = sample.match(/[\u4e00-\u9fff]/g)?.length ?? 0;
  const bad = sample.match(/\uFFFD/g)?.length ?? 0;
  return cjk - bad * 10;
}

function mapToDetectedEncoding(name: string): DetectedEncoding {
  const n = name.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (n === 'utf8' || n === 'utf8bom' || n === 'ascii') return 'utf-8';
  if (n === 'gb18030') return 'gb18030';
  if (n === 'gbk' || n === 'gb2312') return 'gbk';
  if (n.includes('shiftjis') || n === 'sjis' || n === 'cp932') return 'shift_jis';
  if (n.includes('euckr') || n === 'cp949') return 'euc-kr';
  return 'unknown';
}

/**
 * Core decode: UTF-8 / UTF-8 BOM first.
 * Legacy encodings (GBK/GB18030, future Shift-JIS / EUC-KR) only via language adapters —
 * never forced on the generic path.
 */
export function detectAndDecode(
  buffer: Buffer,
  options: DecodeOptions = {},
): DecodeResult {
  if (buffer.length === 0) {
    return { text: '', encoding: 'utf-8', confidence: 1 };
  }

  if (hasUtf8Bom(buffer)) {
    const text = iconv.decode(buffer.subarray(3), 'utf-8');
    return { text, encoding: 'utf-8-bom', confidence: 1 };
  }

  const sample = buffer.subarray(0, Math.min(buffer.length, 64 * 1024));
  const detected = jschardet.detect(sample);
  const detectedName = detected.encoding ?? null;
  const detectedConf = detected.confidence ?? 0;

  if (looksLikeValidUtf8(buffer)) {
    const adapter = options.sourceLanguage
      ? getTextLanguageAdapter(options.sourceLanguage)
      : null;

    // Ambiguous UTF-8 vs Chinese legacy when language is Chinese (or adapter is Chinese).
    if (
      adapter?.id === 'chinese' &&
      !isMostlyAscii(buffer) &&
      adapter.tryDecodeLegacy
    ) {
      const legacy = adapter.tryDecodeLegacy(buffer, detectedName, detectedConf);
      if (legacy) {
        const utf8 = buffer.toString('utf8');
        if (cjkScore(legacy.text) > cjkScore(utf8) * 1.2) {
          return {
            text: legacy.text,
            encoding: mapToDetectedEncoding(legacy.encoding),
            confidence: legacy.confidence,
          };
        }
      }
    }

    return { text: buffer.toString('utf8'), encoding: 'utf-8', confidence: 0.95 };
  }

  // UTF-8 invalid — ask language adapter (or Chinese if jschardet strongly says GB*).
  const sourceLanguage = options.sourceLanguage
    ? normalizeLanguageCode(options.sourceLanguage)
    : null;
  let adapter = sourceLanguage ? getTextLanguageAdapter(sourceLanguage) : null;

  if (!adapter || adapter.id === 'generic-unicode') {
    const n = (detectedName ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
    if (
      (n === 'gb18030' || n === 'gbk' || n === 'gb2312' || n === 'gb231280') &&
      detectedConf >= 0.85
    ) {
      adapter = chineseTextAdapter;
    }
  }

  if (adapter?.tryDecodeLegacy) {
    const legacy = adapter.tryDecodeLegacy(buffer, detectedName, detectedConf);
    if (legacy) {
      return {
        text: legacy.text,
        encoding: mapToDetectedEncoding(legacy.encoding),
        confidence: legacy.confidence > 0 ? legacy.confidence : 0.7,
      };
    }
  }

  // Generic path: never force GB18030. Return best-effort UTF-8 as unknown.
  return {
    text: buffer.toString('utf8'),
    encoding: 'unknown',
    confidence: 0.1,
  };
}
