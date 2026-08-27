export type { ChapterBoundaryCandidate, ChapterDetectionResult, DetectedChapter } from './types';
export { detectChapters, applyManualSplits } from './pipeline';
export { DEFAULT_LINE_DETECTORS, lineDetectorsForLanguage } from './detectors';
export { parseChineseOrdinal, normalizeDigits } from './utils';
