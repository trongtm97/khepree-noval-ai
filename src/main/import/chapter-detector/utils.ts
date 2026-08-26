import type { ChapterBoundaryCandidate } from './types';

/** Fullwidth → halfwidth digits. */
export function normalizeDigits(input: string): string {
  return input.replace(/[０-９]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) - 0xff10 + 0x30),
  );
}

const CN_NUM = new Map<string, number>([
  ['零', 0],
  ['〇', 0],
  ['○', 0],
  ['两', 2],
  ['一', 1],
  ['二', 2],
  ['三', 3],
  ['四', 4],
  ['五', 5],
  ['六', 6],
  ['七', 7],
  ['八', 8],
  ['九', 9],
  ['十', 10],
  ['百', 100],
  ['千', 1000],
]);

/** Parse Chinese / Arabic / fullwidth chapter ordinals. Best-effort. */
export function parseChineseOrdinal(raw: string): number | undefined {
  const s = normalizeDigits(raw.trim());
  if (/^\d+$/.test(s)) {
    return Number.parseInt(s, 10);
  }

  let total = 0;
  let current = 0;
  let seen = false;
  for (const ch of s) {
    const val = CN_NUM.get(ch);
    if (val === undefined) {
      return undefined;
    }
    seen = true;
    if (val === 10 || val === 100 || val === 1000) {
      if (current === 0) current = 1;
      total += current * val;
      current = 0;
    } else {
      current = val;
    }
  }
  total += current;
  return seen ? total : undefined;
}

export interface LineDetector {
  readonly id: string;
  detectLine(line: string, lineIndex: number, offset: number): ChapterBoundaryCandidate | null;
}
