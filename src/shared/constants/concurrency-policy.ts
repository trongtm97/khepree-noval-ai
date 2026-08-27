/** Multi-stream concurrency policy — safe defaults for production scheduler. */

import type { AiProviderType } from './ai-provider';

export const GLOBAL_MAX_MODE_AUTO = 'AUTO' as const;
export type GlobalMaxWorkersMode = typeof GLOBAL_MAX_MODE_AUTO | number;

/** Cap used when globalMaxWorkers === AUTO: min(READY workers, this). UI: "Tự động (3)". */
export const DEFAULT_AUTO_GLOBAL_CAP = 3;

/** Absolute hard ceiling regardless of settings / READY count. */
export const HARD_GLOBAL_WORKER_CEILING = 16;

export const DEFAULT_PER_PROJECT_MAX = 1;
export const DEFAULT_ALLOW_SAME_PROJECT_PARALLEL = false;

/** Playwright: never share one Google account across two jobs. */
export const DEFAULT_PER_ACCOUNT_PLAYWRIGHT_MAX = 1;

/** Web API: same default; raise only after proven safe. */
export const DEFAULT_PER_ACCOUNT_WEB_API_MAX = 1;

/** Soft default for any other / unknown provider kind. */
export const DEFAULT_PER_ACCOUNT_DEFAULT_MAX = 1;

/**
 * Per-provider stream cap (across accounts).
 * Default = auto cap so 3 accounts × Playwright can run together under AUTO(3).
 */
export const DEFAULT_PER_PROVIDER_MAX = DEFAULT_AUTO_GLOBAL_CAP;

export type ProviderConcurrencyKind = AiProviderType | 'OTHER';

export interface PerAccountMaxPolicy {
  playwright: number;
  webApi: number;
  default: number;
}

export interface ConcurrencyPolicy {
  /** AUTO = min(READY, autoCap); or fixed positive int. */
  globalMaxWorkers: GlobalMaxWorkersMode;
  /** Cap applied when globalMaxWorkers is AUTO. */
  autoCap: number;
  perProviderMax: number;
  perAccountMax: PerAccountMaxPolicy;
  perProjectMax: number;
  allowSameProjectParallel: boolean;
}

export const DEFAULT_CONCURRENCY_POLICY: ConcurrencyPolicy = {
  globalMaxWorkers: GLOBAL_MAX_MODE_AUTO,
  autoCap: DEFAULT_AUTO_GLOBAL_CAP,
  perProviderMax: DEFAULT_PER_PROVIDER_MAX,
  perAccountMax: {
    playwright: DEFAULT_PER_ACCOUNT_PLAYWRIGHT_MAX,
    webApi: DEFAULT_PER_ACCOUNT_WEB_API_MAX,
    default: DEFAULT_PER_ACCOUNT_DEFAULT_MAX,
  },
  perProjectMax: DEFAULT_PER_PROJECT_MAX,
  allowSameProjectParallel: DEFAULT_ALLOW_SAME_PROJECT_PARALLEL,
};

export const SCHEDULER_CONCURRENCY_KEYS = {
  globalMaxWorkers: 'scheduler.max_concurrent_workers',
  autoCap: 'scheduler.auto_global_cap',
  perProjectMax: 'scheduler.per_project_max',
  perProviderMax: 'scheduler.per_provider_max',
  perAccountPlaywrightMax: 'scheduler.per_account_playwright_max',
  perAccountWebApiMax: 'scheduler.per_account_webapi_max',
  allowSameProjectParallel: 'scheduler.allow_same_project_parallel',
} as const;

/** Merge legacy SCHEDULER_SETTING_KEYS.maxConcurrentWorkers with concurrency keys. */
export function effectivePerProjectMax(policy: ConcurrencyPolicy): number {
  if (!policy.allowSameProjectParallel) return 1;
  return Math.max(1, policy.perProjectMax);
}

export function perAccountLimitFor(
  policy: ConcurrencyPolicy,
  kind: ProviderConcurrencyKind,
): number {
  if (kind === 'PLAYWRIGHT_GEMINI') return Math.max(1, policy.perAccountMax.playwright);
  if (kind === 'GEMINI_WEB_API') return Math.max(1, policy.perAccountMax.webApi);
  return Math.max(1, policy.perAccountMax.default);
}

export function resolveGlobalMaxWorkers(
  policy: ConcurrencyPolicy,
  readyWorkerCount: number,
): number {
  const ready = Math.max(0, readyWorkerCount);
  const autoCap = Math.min(
    HARD_GLOBAL_WORKER_CEILING,
    Math.max(1, policy.autoCap),
  );
  if (policy.globalMaxWorkers === GLOBAL_MAX_MODE_AUTO) {
    return Math.max(1, Math.min(ready || 1, autoCap, HARD_GLOBAL_WORKER_CEILING));
  }
  return Math.max(
    1,
    Math.min(policy.globalMaxWorkers, HARD_GLOBAL_WORKER_CEILING),
  );
}

export function normalizeProviderConcurrencyKind(
  raw: string | null | undefined,
): ProviderConcurrencyKind {
  const n = (raw ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (n.includes('WEBAPI') || n === 'GEMINIWEBAPI') return 'GEMINI_WEB_API';
  if (
    n.includes('PLAYWRIGHT') ||
    n === 'GEMINI' ||
    n === 'PLAYWRIGHTGEMINI'
  ) {
    return 'PLAYWRIGHT_GEMINI';
  }
  if (n === 'GEMINIWEBAPI' || n === 'WEBAPI') return 'GEMINI_WEB_API';
  return 'OTHER';
}
