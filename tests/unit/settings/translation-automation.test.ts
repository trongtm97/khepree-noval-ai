import { describe, expect, it } from 'vitest';
import {
  automationModeFromGlobalMax,
  customConcurrentValue,
  RECOMMENDED_TRANSLATION_SCHEDULER_PATCH,
} from '../../../src/renderer/components/settings/translation-automation';
import { resolveGlobalMaxWorkers, DEFAULT_CONCURRENCY_POLICY } from '@shared/constants/concurrency-policy';

describe('translation automation mode', () => {
  it('maps globalMaxMode to AUTO or CUSTOM', () => {
    expect(automationModeFromGlobalMax('AUTO')).toBe('AUTO');
    expect(automationModeFromGlobalMax(3)).toBe('CUSTOM');
  });

  it('recommended patch uses AUTO with safe defaults', () => {
    expect(RECOMMENDED_TRANSLATION_SCHEDULER_PATCH).toEqual({
      globalMaxWorkers: 'AUTO',
      perProjectMax: 1,
      parallelTranslationWaves: false,
    });
  });

  it('AUTO computes sensible concurrency for 1 ready worker', () => {
    const policy = { ...DEFAULT_CONCURRENCY_POLICY, globalMaxWorkers: 'AUTO' as const, autoCap: 3 };
    expect(resolveGlobalMaxWorkers(policy, 1)).toBe(1);
  });

  it('AUTO updates cap when 3 workers ready', () => {
    const policy = { ...DEFAULT_CONCURRENCY_POLICY, globalMaxWorkers: 'AUTO' as const, autoCap: 3 };
    expect(resolveGlobalMaxWorkers(policy, 3)).toBe(3);
  });

  it('custom concurrent value falls back to maxConcurrent when in AUTO display', () => {
    expect(customConcurrentValue('AUTO', 2)).toBe(2);
    expect(customConcurrentValue(4, 2)).toBe(4);
  });
});
