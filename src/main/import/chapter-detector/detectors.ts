import type { LineDetector } from './utils';
import { parseChineseOrdinal } from './utils';
import type { ChapterBoundaryCandidate } from './types';

/** 第一章 / 第123章 / 第１２３章 / 第十二章 */
export const chineseChapterDetector: LineDetector = {
  id: 'chinese-chapter',
  detectLine(line, lineIndex, offset) {
    const trimmed = line.trim();
    const match = /^第([零〇○两一二三四五六七八九十百千0-9０-９]+)章([^\n]*)$/u.exec(trimmed);
    if (!match) return null;
    const ordinal = parseChineseOrdinal(match[1]);
    return candidate({
      offset,
      lineIndex,
      title: trimmed,
      confidence: 0.92,
      detectorId: this.id,
      ordinal,
      kind: 'chapter',
    });
  },
};

/** 正文 第一章 / 正文：第一章 */
export const prefixedChapterDetector: LineDetector = {
  id: 'prefixed-zhengwen',
  detectLine(line, lineIndex, offset) {
    const trimmed = line.trim();
    const match =
      /^正文[：:\s]+(第([零〇○两一二三四五六七八九十百千0-9０-９]+)章[^\n]*)$/u.exec(trimmed);
    if (!match) return null;
    const ordinal = parseChineseOrdinal(match[2]);
    return candidate({
      offset,
      lineIndex,
      title: match[1].trim(),
      confidence: 0.88,
      detectorId: this.id,
      ordinal,
      kind: 'prefixed',
    });
  },
};

/** 卷一 / 第一卷 / 第1卷 */
export const volumeDetector: LineDetector = {
  id: 'volume',
  detectLine(line, lineIndex, offset) {
    const trimmed = line.trim();
    let match = /^卷([零〇○两一二三四五六七八九十百千0-9０-９]+)([^\n]*)$/u.exec(trimmed);
    if (match) {
      return candidate({
        offset,
        lineIndex,
        title: trimmed,
        confidence: 0.7,
        detectorId: this.id,
        ordinal: parseChineseOrdinal(match[1]),
        kind: 'volume',
      });
    }
    match = /^第([零〇○两一二三四五六七八九十百千0-9０-９]+)卷([^\n]*)$/u.exec(trimmed);
    if (!match) return null;
    return candidate({
      offset,
      lineIndex,
      title: trimmed,
      confidence: 0.75,
      detectorId: this.id,
      ordinal: parseChineseOrdinal(match[1]),
      kind: 'volume',
    });
  },
};

/** Chapter 1 / CHAPTER 12 — Title */
export const englishChapterDetector: LineDetector = {
  id: 'english-chapter',
  detectLine(line, lineIndex, offset) {
    const trimmed = line.trim();
    const match = /^(?:Chapter|CHAPTER)\s+(\d+)\b([^\n]*)$/u.exec(trimmed);
    if (!match) return null;
    return candidate({
      offset,
      lineIndex,
      title: trimmed,
      confidence: 0.85,
      detectorId: this.id,
      ordinal: Number.parseInt(match[1], 10),
      kind: 'english',
    });
  },
};

function candidate(
  input: Omit<ChapterBoundaryCandidate, never>,
): ChapterBoundaryCandidate {
  return input;
}

export const DEFAULT_LINE_DETECTORS: LineDetector[] = [
  prefixedChapterDetector,
  chineseChapterDetector,
  volumeDetector,
  englishChapterDetector,
];
