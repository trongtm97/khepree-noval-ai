import type { TermRow } from '../db/repositories/term-repository';
import { chineseTermAdapter } from './adapters/chinese-term-adapter';
import {
  parseJsonStringArray,
  stringifyJsonStringArray,
} from './term-variant-json';

export { parseJsonStringArray, stringifyJsonStringArray };

/** Core match keys — language-agnostic. Adapters add script-specific forms. */
export interface LanguageTermAdapter {
  readonly id: string;
  /** Extra source strings to scan for (aliases / script variants). */
  extraMatchKeys(term: TermRow): string[];
}

/** Canonical source surface for matching / display. */
export function termSourceText(term: TermRow): string {
  return (term.source_text ?? term.source_simplified).trim();
}

/** Core keys: source_text + source_variants (+ legacy simplified if different). */
export function coreMatchKeys(term: TermRow): string[] {
  const keys = new Set<string>();
  const primary = termSourceText(term);
  if (primary) keys.add(primary);
  if (term.source_simplified.trim()) keys.add(term.source_simplified.trim());
  for (const v of parseJsonStringArray(term.source_variants)) {
    keys.add(v);
  }
  return [...keys];
}

export function collectMatchKeys(
  term: TermRow,
  adapters: readonly LanguageTermAdapter[] = [],
): string[] {
  const keys = new Set(coreMatchKeys(term));
  for (const adapter of adapters) {
    for (const k of adapter.extraMatchKeys(term)) {
      if (k.trim()) keys.add(k.trim());
    }
  }
  return [...keys];
}

export function adaptersForSourceLanguage(
  sourceLanguage: string | null | undefined,
): LanguageTermAdapter[] {
  const code = (sourceLanguage ?? '').toLowerCase();
  if (code.startsWith('zh')) {
    return [chineseTermAdapter];
  }
  return [];
}
