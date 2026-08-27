import { describe, expect, it } from 'vitest';
import {
  shouldMergePartialRepair,
} from '../../../src/main/jobs/repair-loop';
import type { RepairPromptPlan } from '@shared/schemas/job';

describe('shouldMergePartialRepair', () => {
  const base: Omit<RepairPromptPlan, 'mode' | 'reason' | 'targetParagraphIds'> = {
    prompt: 'x',
    retranslate: true,
  };

  it('merges partial empty/missing repairs', () => {
    expect(
      shouldMergePartialRepair(
        { ...base, mode: 'translation_empty', reason: 'EMPTY_PARAGRAPH', targetParagraphIds: ['a'] },
        96,
      ),
    ).toBe(true);
    expect(
      shouldMergePartialRepair(
        { ...base, mode: 'translation_missing', reason: 'MISSING_PARAGRAPH', targetParagraphIds: ['a'] },
        96,
      ),
    ).toBe(true);
    expect(
      shouldMergePartialRepair(
        {
          ...base,
          mode: 'translation_corrupt',
          reason: 'CORRUPT_PARAGRAPH',
          targetParagraphIds: ['a'],
        },
        96,
      ),
    ).toBe(true);
  });

  it('does not merge full-batch malformed retranslate', () => {
    expect(
      shouldMergePartialRepair(
        {
          ...base,
          mode: 'malformed_full',
          reason: 'MALFORMED_OUTPUT',
          targetParagraphIds: Array.from({ length: 10 }, (_, i) => `p${i}`),
        },
        10,
      ),
    ).toBe(false);
  });

  it('merges malformed repair when only a subset is targeted', () => {
    expect(
      shouldMergePartialRepair(
        {
          ...base,
          mode: 'malformed_full',
          reason: 'MALFORMED_OUTPUT',
          targetParagraphIds: ['p1', 'p2'],
        },
        96,
      ),
    ).toBe(true);
  });

  it('skips deltas-only', () => {
    expect(
      shouldMergePartialRepair(
        {
          prompt: 'd',
          retranslate: false,
          mode: 'deltas_only',
          reason: 'MEMORY_JSON_INVALID',
          targetParagraphIds: [],
        },
        10,
      ),
    ).toBe(false);
  });
});
