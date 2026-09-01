import { describe, expect, it } from 'vitest';
import {
  resolveAutoChunkBudget,
  resolveAutoConcurrencyCaps,
  resolveAutoMaxChaptersPerJob,
  resolveInterChunkDelayMs,
  pickWebApiModelForChunk,
  WEB_API_THINKING_MODEL,
} from '@main/jobs/auto-throughput-policy';
import { DEFAULT_THROUGHPUT_HISTORY } from '@main/jobs/auto-throughput-policy';

describe('auto-throughput-policy', () => {
  it('boosts Web API chunk budget when project history is stable', () => {
    const stable = resolveAutoChunkBudget('GEMINI_WEB_API', {
      avgOutputRatio: 1.2,
      recentIncompleteRate: 0.05,
      recentSuccessRate: 0.95,
    });
    expect(stable.maxParagraphs).toBeGreaterThanOrEqual(18);
    expect(stable.maxSourceChars).toBeGreaterThanOrEqual(12_000);
  });

  it('shrinks Web API chunk budget when incomplete rate is high', () => {
    const risky = resolveAutoChunkBudget('GEMINI_WEB_API', {
      avgOutputRatio: 1.4,
      recentIncompleteRate: 0.35,
      recentSuccessRate: 0.5,
    });
    expect(risky.maxParagraphs).toBeLessThanOrEqual(10);
    expect(risky.maxSourceChars).toBeLessThanOrEqual(6_500);
  });

  it('uses shorter inter-chunk delay for stable Web API history', () => {
    const fast = resolveInterChunkDelayMs('GEMINI_WEB_API', {
      avgOutputRatio: 1.1,
      recentIncompleteRate: 0,
      recentSuccessRate: 1,
    });
    const safe = resolveInterChunkDelayMs('GEMINI_WEB_API', {
      avgOutputRatio: 1.4,
      recentIncompleteRate: 0.4,
      recentSuccessRate: 0.5,
    });
    expect(fast).toBeLessThan(safe);
  });

  it('scales concurrency caps to READY worker count', () => {
    expect(resolveAutoConcurrencyCaps(1)).toEqual({ autoCap: 1, perProviderMax: 1 });
    expect(resolveAutoConcurrencyCaps(5)).toEqual({ autoCap: 5, perProviderMax: 5 });
    expect(resolveAutoConcurrencyCaps(20).autoCap).toBe(16);
  });

  it('raises max chapters per job when Web API history is stable', () => {
    const stable = resolveAutoMaxChaptersPerJob('GEMINI_WEB_API', {
      avgOutputRatio: 1.2,
      recentIncompleteRate: 0,
      recentSuccessRate: 1,
    });
    expect(stable).toBeGreaterThanOrEqual(5);
    const baseline = resolveAutoMaxChaptersPerJob('GEMINI_WEB_API', DEFAULT_THROUGHPUT_HISTORY);
    expect(baseline).toBeGreaterThanOrEqual(4);
  });

  it('picks thinking model for large Web API chunks on default flash', () => {
    expect(pickWebApiModelForChunk('gemini-flash', 9_000)).toBe(WEB_API_THINKING_MODEL);
    expect(pickWebApiModelForChunk('gemini-flash', 2_000)).toBe('gemini-flash');
    expect(pickWebApiModelForChunk('custom-model-x', 9_000)).toBe('custom-model-x');
  });
});
