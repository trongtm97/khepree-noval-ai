import { describe, expect, it } from 'vitest';
import {
  extractTermCandidates,
  knownSourceSet,
  TERM_SUFFIX_HEURISTICS,
} from '@main/terms/candidate-extractor';
import type { TermRow } from '@main/db/repositories/term-repository';

describe('candidate extraction V1', () => {
  it('extracts n-grams with suffix heuristics', () => {
    const text = '他进入青云门修炼。青云门青云门是大宗门。';
    const candidates = extractTermCandidates(text, { minFrequency: 2 });
    const names = candidates.map((c) => c.sourceText);
    expect(names).toContain('青云门');
    const qingyun = candidates.find((c) => c.sourceText === '青云门');
    expect(qingyun?.suggestedType).toBe('SECT');
    expect(qingyun?.heuristicTags).toContain('sect');
  });

  it('skips known dictionary sources', () => {
    const known = knownSourceSet([
      {
        source_simplified: '青云门',
      } as TermRow,
    ]);
    const candidates = extractTermCandidates('青云门青云门', { knownSources: known, minFrequency: 2 });
    expect(candidates.some((c) => c.sourceText === '青云门')).toBe(false);
  });

  it('does not auto-promote — returns candidates only', () => {
    const candidates = extractTermCandidates('金丹期金丹期修士', { minFrequency: 2 });
    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates.every((c) => typeof c.confidence === 'number')).toBe(true);
  });

  it('covers suffix heuristic categories', () => {
    const suffixes = TERM_SUFFIX_HEURISTICS.flatMap((r) => r.suffixes);
    expect(suffixes).toContain('宗');
    expect(suffixes).toContain('诀');
    expect(suffixes).toContain('境');
    expect(suffixes).toContain('帝');
  });
});
