import iconv from 'iconv-lite';
import jschardet from 'jschardet';

export type DetectedEncoding = 'utf-8' | 'utf-8-bom' | 'gb18030' | 'gbk' | 'unknown';

export interface DecodeResult {
  text: string;
  encoding: DetectedEncoding;
  confidence: number;
}

function hasUtf8Bom(buf: Buffer): boolean {
  return buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf;
}

function looksLikeValidUtf8(buf: Buffer): boolean {
  try {
    const decoded = buf.toString('utf8');
    // Replacement char density heuristic for mis-decoded CJK
    const replacement = (decoded.match(/\uFFFD/g) ?? []).length;
    return replacement === 0 || replacement / Math.max(decoded.length, 1) < 0.001;
  } catch {
    return false;
  }
}

function mapDetected(name: string | undefined): DetectedEncoding | null {
  if (!name) return null;
  const n = name.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (n === 'utf8' || n === 'ascii') return 'utf-8';
  if (n === 'gb18030') return 'gb18030';
  if (n === 'gbk' || n === 'gb2312' || n === 'gb231280') return 'gbk';
  return null;
}

/**
 * Detect encoding from a sample buffer, then decode full buffer.
 * Prefer UTF-8 / UTF-8 BOM; fall back to GB18030/GBK for Chinese novels.
 */
export function detectAndDecode(buffer: Buffer): DecodeResult {
  if (buffer.length === 0) {
    return { text: '', encoding: 'utf-8', confidence: 1 };
  }

  if (hasUtf8Bom(buffer)) {
    const text = iconv.decode(buffer.subarray(3), 'utf-8');
    return { text, encoding: 'utf-8-bom', confidence: 1 };
  }

  if (looksLikeValidUtf8(buffer)) {
    // Extra check: if jschardet strongly says GB* and UTF-8 has weird control density, prefer GB
    const sample = buffer.subarray(0, Math.min(buffer.length, 64 * 1024));
    const detected = jschardet.detect(sample);
    const mapped = mapDetected(detected.encoding ?? undefined);
    const conf = detected.confidence;

    if (
      (mapped === 'gb18030' || mapped === 'gbk') &&
      conf >= 0.9 &&
      !isMostlyAscii(buffer)
    ) {
      // Ambiguous: try both and pick fewer replacement / more CJK
      const utf8 = buffer.toString('utf8');
      const gb = iconv.decode(buffer, mapped === 'gbk' ? 'gbk' : 'gb18030');
      if (cjkScore(gb) > cjkScore(utf8) * 1.2) {
        return { text: gb, encoding: mapped, confidence: conf };
      }
    }

    return { text: buffer.toString('utf8'), encoding: 'utf-8', confidence: 0.95 };
  }

  const sample = buffer.subarray(0, Math.min(buffer.length, 64 * 1024));
  const detected = jschardet.detect(sample);
  const mapped = mapDetected(detected.encoding ?? undefined);
  const conf = detected.confidence;

  if (mapped === 'gb18030' || mapped === 'gbk') {
    const encoding = mapped === 'gbk' ? 'gbk' : 'gb18030';
    return {
      text: iconv.decode(buffer, encoding),
      encoding: mapped,
      confidence: conf > 0 ? conf : 0.7,
    };
  }

  // Last resort: GB18030 (superset of GBK) for Chinese novel dumps
  try {
    const text = iconv.decode(buffer, 'gb18030');
    return { text, encoding: 'gb18030', confidence: 0.4 };
  } catch {
    return {
      text: buffer.toString('utf8'),
      encoding: 'unknown',
      confidence: 0.1,
    };
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
