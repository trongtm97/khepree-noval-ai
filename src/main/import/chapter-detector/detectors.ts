import type { LineDetector } from './utils';
import type { ChapterBoundaryCandidate } from './types';
import {
  adaptersForHeadingScan,
  type TextLanguageAdapter,
} from '../../language/text-adapters';

function toLineDetector(adapter: TextLanguageAdapter): LineDetector {
  return {
    id: `adapter:${adapter.id}`,
    detectLine(line, lineIndex, offset) {
      const hit = adapter.detectChapterHeading(line);
      if (!hit) return null;
      return {
        offset,
        lineIndex,
        title: hit.title,
        confidence: hit.confidence,
        detectorId: hit.detectorId,
        ordinal: hit.ordinal,
        kind: hit.kind,
      } satisfies ChapterBoundaryCandidate;
    },
  };
}

/** Build line detectors from TextLanguageAdapter(s). */
export function lineDetectorsForLanguage(
  sourceLanguage?: string | null,
): LineDetector[] {
  return adaptersForHeadingScan(sourceLanguage).map(toLineDetector);
}

/** Backward-compatible default: all language adapters + generic (unknown language). */
export const DEFAULT_LINE_DETECTORS: LineDetector[] = lineDetectorsForLanguage(null);

// Re-export named detectors for tests / callers that import specifics.
export { chineseTextAdapter as _chineseAdapter } from '../../language/text-adapters';

export const chineseChapterDetector: LineDetector = {
  id: 'chinese-chapter',
  detectLine(line, lineIndex, offset) {
    const hit = adaptersForHeadingScan('zh-Hans')
      .find((a) => a.id === 'chinese')
      ?.detectChapterHeading(line);
    if (hit?.detectorId !== 'chinese-chapter') return null;
    return {
      offset,
      lineIndex,
      title: hit.title,
      confidence: hit.confidence,
      detectorId: hit.detectorId,
      ordinal: hit.ordinal,
      kind: hit.kind,
    };
  },
};

export const prefixedChapterDetector: LineDetector = {
  id: 'prefixed-zhengwen',
  detectLine(line, lineIndex, offset) {
    const hit = adaptersForHeadingScan('zh-Hans')
      .find((a) => a.id === 'chinese')
      ?.detectChapterHeading(line);
    if (hit?.detectorId !== 'chinese-zhengwen') return null;
    return {
      offset,
      lineIndex,
      title: hit.title,
      confidence: hit.confidence,
      detectorId: hit.detectorId,
      ordinal: hit.ordinal,
      kind: hit.kind,
    };
  },
};

export const volumeDetector: LineDetector = {
  id: 'volume',
  detectLine(line, lineIndex, offset) {
    const hit = adaptersForHeadingScan('zh-Hans')
      .find((a) => a.id === 'chinese')
      ?.detectChapterHeading(line);
    if (!hit || (hit.kind !== 'volume' && !hit.detectorId.includes('volume'))) {
      return null;
    }
    return {
      offset,
      lineIndex,
      title: hit.title,
      confidence: hit.confidence,
      detectorId: hit.detectorId,
      ordinal: hit.ordinal,
      kind: hit.kind,
    };
  },
};

export const englishChapterDetector: LineDetector = {
  id: 'english-chapter',
  detectLine(line, lineIndex, offset) {
    const hit = adaptersForHeadingScan('en')
      .find((a) => a.id === 'english')
      ?.detectChapterHeading(line);
    if (!hit) return null;
    return {
      offset,
      lineIndex,
      title: hit.title,
      confidence: hit.confidence,
      detectorId: hit.detectorId,
      ordinal: hit.ordinal,
      kind: hit.kind,
    };
  },
};
