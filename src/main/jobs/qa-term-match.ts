import { getLanguageProfile, type LanguageProfile } from '@shared/constants/language-profile';

export interface TermMatchOptions {
  /** NFC for most languages; NFKC when folding compatibility forms helps. */
  normalization?: 'NFC' | 'NFKC';
  caseInsensitive?: boolean;
  collapseWhitespace?: boolean;
}

const SMART_QUOTE_MAP: Record<string, string> = {
  '\u2018': "'",
  '\u2019': "'",
  '\u201A': "'",
  '\u201B': "'",
  '\u201C': '"',
  '\u201D': '"',
  '\u201E': '"',
  '\u2039': "'",
  '\u203A': "'",
};

export function normalizeForTermMatch(text: string, options?: TermMatchOptions): string {
  const norm = options?.normalization ?? 'NFC';
  let s = text.normalize(norm);
  for (const [from, to] of Object.entries(SMART_QUOTE_MAP)) {
    s = s.split(from).join(to);
  }
  if (options?.collapseWhitespace ?? true) {
    s = s.replace(/\s+/g, ' ').trim();
  }
  if (options?.caseInsensitive) {
    s = s.toLocaleLowerCase();
  }
  return s;
}

export function termAppearsInText(
  haystack: string,
  needle: string,
  options?: TermMatchOptions,
): boolean {
  if (!needle.trim()) return false;
  const h = normalizeForTermMatch(haystack, options);
  const n = normalizeForTermMatch(needle, options);
  return h.includes(n);
}

export function defaultTermMatchOptions(targetLanguage: string): TermMatchOptions {
  const profile = getLanguageProfile(targetLanguage);
  const caseInsensitive =
    profile.script === 'Latn' ||
    profile.script === 'Cyrl' ||
    profile.script === 'Arab' ||
    profile.script === 'Grek';
  return {
    normalization: 'NFC',
    caseInsensitive,
    collapseWhitespace: true,
  };
}

export function profilesShareLatinScript(
  sourceProfile: LanguageProfile,
  targetProfile: LanguageProfile,
): boolean {
  return sourceProfile.script === 'Latn' && targetProfile.script === 'Latn';
}
