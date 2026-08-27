import type { TermRow } from '../../db/repositories/term-repository';
import type { LanguageTermAdapter } from '../term-language-adapter';

/**
 * Chinese script variants for matching — NOT core TermMatcher fields.
 * Future: japanese (kanji/kana/romaji), korean (hangul/romanization).
 */
export const chineseTermAdapter: LanguageTermAdapter = {
  id: 'zh',
  extraMatchKeys(term: TermRow): string[] {
    const keys: string[] = [];
    if (term.source_traditional?.trim()) {
      keys.push(term.source_traditional.trim());
    }
    // Pinyin stays metadata / filter — not substring-matched in prose.
    return keys;
  },
};
