import type { DatabaseManager } from '../db/database-manager';
import {
  DEFAULT_CONCURRENCY_POLICY,
  GLOBAL_MAX_MODE_AUTO,
  HARD_GLOBAL_WORKER_CEILING,
  SCHEDULER_CONCURRENCY_KEYS,
  type ConcurrencyPolicy,
  type GlobalMaxWorkersMode,
  type ProviderConcurrencyKind,
  effectivePerProjectMax,
  normalizeProviderConcurrencyKind,
  perAccountLimitFor,
  resolveGlobalMaxWorkers,
} from '@shared/constants/concurrency-policy';
import { SCHEDULER_SETTING_KEYS } from '@shared/constants/job';

export interface InFlightSlot {
  jobId: string;
  projectId: string;
  accountId: string;
  providerKind: ProviderConcurrencyKind;
}

export interface ConcurrencySnapshot {
  slots: readonly InFlightSlot[];
  byProject: Map<string, number>;
  byAccount: Map<string, number>;
  byProvider: Map<string, number>;
}

export function emptyConcurrencySnapshot(): ConcurrencySnapshot {
  return {
    slots: [],
    byProject: new Map(),
    byAccount: new Map(),
    byProvider: new Map(),
  };
}

export function buildConcurrencySnapshot(
  slots: Iterable<InFlightSlot>,
): ConcurrencySnapshot {
  const list = [...slots];
  const byProject = new Map<string, number>();
  const byAccount = new Map<string, number>();
  const byProvider = new Map<string, number>();
  for (const s of list) {
    byProject.set(s.projectId, (byProject.get(s.projectId) ?? 0) + 1);
    byAccount.set(s.accountId, (byAccount.get(s.accountId) ?? 0) + 1);
    byProvider.set(s.providerKind, (byProvider.get(s.providerKind) ?? 0) + 1);
  }
  return { slots: list, byProject, byAccount, byProvider };
}

function readInt(
  db: DatabaseManager,
  key: string,
  fallback: number,
  min = 1,
  max = HARD_GLOBAL_WORKER_CEILING,
): number {
  try {
    const raw = db.appMeta.get(key);
    if (raw == null || raw === '') return fallback;
    const n = Number.parseInt(raw, 10);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, n));
  } catch {
    return fallback;
  }
}

function readBool(db: DatabaseManager, key: string, fallback: boolean): boolean {
  try {
    const raw = db.appMeta.get(key);
    if (raw == null || raw === '') return fallback;
    return raw === '1' || raw.toLowerCase() === 'true';
  } catch {
    return fallback;
  }
}

function parseGlobalMax(raw: string | null): GlobalMaxWorkersMode {
  if (raw == null || raw === '' || raw.toUpperCase() === GLOBAL_MAX_MODE_AUTO) {
    return GLOBAL_MAX_MODE_AUTO;
  }
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) return GLOBAL_MAX_MODE_AUTO;
  return Math.min(HARD_GLOBAL_WORKER_CEILING, n);
}

function normalizeSerialPolicy(policy: ConcurrencyPolicy): ConcurrencyPolicy {
  return {
    ...policy,
    perProjectMax: 1,
    allowSameProjectParallel: false,
    perAccountMax: {
      playwright: 1,
      webApi: 1,
      default: 1,
    },
  };
}

/** Load durable policy from app_meta (legacy max_concurrent_workers still honored). */
export function loadConcurrencyPolicy(db: DatabaseManager): ConcurrencyPolicy {
  const base = DEFAULT_CONCURRENCY_POLICY;
  const globalRaw =
    db.appMeta.get(SCHEDULER_CONCURRENCY_KEYS.globalMaxWorkers) ??
    db.appMeta.get(SCHEDULER_SETTING_KEYS.maxConcurrentWorkers);

  return normalizeSerialPolicy({
    globalMaxWorkers: parseGlobalMax(globalRaw),
    autoCap: readInt(db, SCHEDULER_CONCURRENCY_KEYS.autoCap, base.autoCap),
    perProviderMax: readInt(
      db,
      SCHEDULER_CONCURRENCY_KEYS.perProviderMax,
      base.perProviderMax,
    ),
    perAccountMax: {
      playwright: readInt(
        db,
        SCHEDULER_CONCURRENCY_KEYS.perAccountPlaywrightMax,
        base.perAccountMax.playwright,
      ),
      webApi: readInt(
        db,
        SCHEDULER_CONCURRENCY_KEYS.perAccountWebApiMax,
        base.perAccountMax.webApi,
      ),
      default: base.perAccountMax.default,
    },
    perProjectMax: readInt(
      db,
      SCHEDULER_CONCURRENCY_KEYS.perProjectMax,
      base.perProjectMax,
    ),
    allowSameProjectParallel: readBool(
      db,
      SCHEDULER_CONCURRENCY_KEYS.allowSameProjectParallel,
      base.allowSameProjectParallel,
    ),
  });
}

export interface ConcurrencyPolicyPatch {
  globalMaxWorkers?: GlobalMaxWorkersMode;
  autoCap?: number;
  perProviderMax?: number;
  perProjectMax?: number;
  perAccountPlaywrightMax?: number;
  perAccountWebApiMax?: number;
  allowSameProjectParallel?: boolean;
}

export function saveConcurrencyPolicy(
  db: DatabaseManager,
  patch: ConcurrencyPolicyPatch,
): ConcurrencyPolicy {
  const serialPatch: ConcurrencyPolicyPatch = {
    ...patch,
    perProjectMax: 1,
    allowSameProjectParallel: false,
    perAccountPlaywrightMax: 1,
    perAccountWebApiMax: 1,
  };
  if (serialPatch.globalMaxWorkers !== undefined) {
    const v =
      serialPatch.globalMaxWorkers === GLOBAL_MAX_MODE_AUTO
        ? GLOBAL_MAX_MODE_AUTO
        : String(Math.min(HARD_GLOBAL_WORKER_CEILING, Math.max(1, serialPatch.globalMaxWorkers)));
    db.appMeta.set(SCHEDULER_CONCURRENCY_KEYS.globalMaxWorkers, v);
    // Keep legacy key in sync for older readers.
    db.appMeta.set(SCHEDULER_SETTING_KEYS.maxConcurrentWorkers, v);
  }
  if (serialPatch.autoCap !== undefined) {
    db.appMeta.set(
      SCHEDULER_CONCURRENCY_KEYS.autoCap,
      String(Math.min(HARD_GLOBAL_WORKER_CEILING, Math.max(1, serialPatch.autoCap))),
    );
  }
  if (serialPatch.perProviderMax !== undefined) {
    db.appMeta.set(
      SCHEDULER_CONCURRENCY_KEYS.perProviderMax,
      String(Math.min(HARD_GLOBAL_WORKER_CEILING, Math.max(1, serialPatch.perProviderMax))),
    );
  }
  db.appMeta.set(SCHEDULER_CONCURRENCY_KEYS.perProjectMax, '1');
  db.appMeta.set(SCHEDULER_CONCURRENCY_KEYS.allowSameProjectParallel, '0');
  db.appMeta.set(SCHEDULER_CONCURRENCY_KEYS.perAccountPlaywrightMax, '1');
  db.appMeta.set(SCHEDULER_CONCURRENCY_KEYS.perAccountWebApiMax, '1');
  return loadConcurrencyPolicy(db);
}

export function providerKindForWorker(
  db: DatabaseManager,
  accountId: string,
): ProviderConcurrencyKind {
  const worker = db.workerStates.getByAccountId(accountId);
  return normalizeProviderConcurrencyKind(worker?.provider_type);
}

export interface AdmitCandidate {
  projectId: string;
  accountId: string;
  providerKind: ProviderConcurrencyKind;
}

export function canAdmitJob(
  policy: ConcurrencyPolicy,
  snap: ConcurrencySnapshot,
  candidate: AdmitCandidate,
): boolean {
  const projectMax = effectivePerProjectMax(policy);
  const projectCount = snap.byProject.get(candidate.projectId) ?? 0;
  if (projectCount >= projectMax) return false;

  const accountLimit = perAccountLimitFor(policy, candidate.providerKind);
  const accountCount = snap.byAccount.get(candidate.accountId) ?? 0;
  if (accountCount >= accountLimit) return false;

  const providerCount = snap.byProvider.get(candidate.providerKind) ?? 0;
  if (providerCount >= Math.max(1, policy.perProviderMax)) return false;

  return true;
}

export {
  resolveGlobalMaxWorkers,
  effectivePerProjectMax,
  loadConcurrencyPolicy as loadPolicy,
};
