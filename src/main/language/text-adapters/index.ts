import { normalizeLanguageCode } from '@shared/constants/language-profile';
import { chineseTextAdapter } from './chinese-adapter';
import { englishTextAdapter } from './english-adapter';
import { genericUnicodeAdapter } from './generic-unicode-adapter';
import { japaneseTextAdapter } from './japanese-adapter';
import { koreanTextAdapter } from './korean-adapter';
import type {
  ChapterHeadingMatch,
  FilenameChapterMatch,
  TextLanguageAdapter,
} from './types';

const BUILTIN: TextLanguageAdapter[] = [
  chineseTextAdapter,
  englishTextAdapter,
  japaneseTextAdapter,
  koreanTextAdapter,
];

const byCode = new Map<string, TextLanguageAdapter>();
for (const adapter of BUILTIN) {
  for (const code of adapter.languageCodes) {
    byCode.set(normalizeLanguageCode(code), adapter);
    byCode.set(code.toLowerCase(), adapter);
  }
}

/** Extra registrations (future languages). */
export function registerTextLanguageAdapter(adapter: TextLanguageAdapter): void {
  for (const code of adapter.languageCodes) {
    byCode.set(normalizeLanguageCode(code), adapter);
    byCode.set(code.toLowerCase(), adapter);
  }
}

export function getTextLanguageAdapter(
  languageCode: string | null | undefined,
): TextLanguageAdapter {
  if (!languageCode) return genericUnicodeAdapter;
  const normalized = normalizeLanguageCode(languageCode);
  return (
    byCode.get(normalized) ??
    byCode.get(languageCode.toLowerCase()) ??
    genericUnicodeAdapter
  );
}

/** Default = GenericUnicodeAdapter. */
export function getGenericTextLanguageAdapter(): TextLanguageAdapter {
  return genericUnicodeAdapter;
}

export function listTextLanguageAdapters(): readonly TextLanguageAdapter[] {
  return [genericUnicodeAdapter, ...BUILTIN];
}

/**
 * Adapters to scan for headings when language is unknown.
 * Order: language-specific first, generic last (weak).
 */
export function adaptersForHeadingScan(
  sourceLanguage?: string | null,
): TextLanguageAdapter[] {
  if (sourceLanguage) {
    const primary = getTextLanguageAdapter(sourceLanguage);
    if (primary.id === genericUnicodeAdapter.id) {
      return [genericUnicodeAdapter];
    }
    return [primary, genericUnicodeAdapter];
  }
  return [...BUILTIN, genericUnicodeAdapter];
}

export function detectHeadingWithAdapters(
  line: string,
  sourceLanguage?: string | null,
): ChapterHeadingMatch | null {
  let best: ChapterHeadingMatch | null = null;
  for (const adapter of adaptersForHeadingScan(sourceLanguage)) {
    const hit = adapter.detectChapterHeading(line);
    if (!hit) continue;
    if (!best || hit.confidence > best.confidence) best = hit;
  }
  return best;
}

export function detectFilenameWithAdapters(
  fileBaseName: string,
  sourceLanguage?: string | null,
): FilenameChapterMatch | null {
  if (sourceLanguage) {
    const primary = getTextLanguageAdapter(sourceLanguage).detectChapterFromFilename(
      fileBaseName,
    );
    if (primary) return primary;
    return genericUnicodeAdapter.detectChapterFromFilename(fileBaseName);
  }
  // Unknown language: try all language adapters, then generic numeric.
  let best: FilenameChapterMatch | null = null;
  for (const adapter of BUILTIN) {
    const hit = adapter.detectChapterFromFilename(fileBaseName);
    if (!hit) continue;
    if (!best || hit.confidence > best.confidence) best = hit;
  }
  return best ?? genericUnicodeAdapter.detectChapterFromFilename(fileBaseName);
}

export {
  genericUnicodeAdapter,
  chineseTextAdapter,
  englishTextAdapter,
  japaneseTextAdapter,
  koreanTextAdapter,
};
export type { TextLanguageAdapter, ChapterHeadingMatch, FilenameChapterMatch };
