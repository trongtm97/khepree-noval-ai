/** Translation scheduler automation mode (Settings → Dịch thuật). */

export type TranslationAutomationMode = 'AUTO' | 'CUSTOM';

export function automationModeFromGlobalMax(
  globalMaxMode: 'AUTO' | number,
): TranslationAutomationMode {
  return globalMaxMode === 'AUTO' ? 'AUTO' : 'CUSTOM';
}

export const RECOMMENDED_TRANSLATION_SCHEDULER_PATCH = {
  globalMaxWorkers: 'AUTO' as const,
  perProjectMax: 1,
  parallelTranslationWaves: false,
};

export const CUSTOM_CONCURRENT_JOB_OPTIONS = [1, 2, 3, 4, 5, 6, 8] as const;

export function customConcurrentValue(globalMaxMode: 'AUTO' | number, maxConcurrent: number): number {
  if (globalMaxMode !== 'AUTO') return globalMaxMode;
  return Math.min(8, Math.max(1, maxConcurrent));
}
