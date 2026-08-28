import type { ParsedBatchResult } from '@shared/schemas/output-protocol';
import type { TermDeltaItem } from '@shared/schemas/term-delta';
import type { MemoryDeltaItem } from '@shared/schemas/memory-delta';
import type {
  WaveConflictKind,
  WaveConflictSeverity,
} from '@shared/constants/parallel-waves';

export interface WaveConflict {
  kind: WaveConflictKind;
  severity: WaveConflictSeverity;
  key: string;
  message: string;
  priorValue?: string;
  nextValue?: string;
}

export interface ConsistencyCheckResult {
  severity: WaveConflictSeverity;
  conflicts: WaveConflict[];
  /** Soft → repair/filter; hard → retranslate job with latest context. */
  action: 'commit' | 'repair' | 'retranslate';
}

function maxSeverity(
  a: WaveConflictSeverity,
  b: WaveConflictSeverity,
): WaveConflictSeverity {
  const rank = { none: 0, soft: 1, hard: 2 } as const;
  return rank[a] >= rank[b] ? a : b;
}

function termKey(item: TermDeltaItem): string {
  return `term:${item.source}`.toLowerCase();
}

function termTarget(item: TermDeltaItem): string {
  return item.target;
}

function memoryKey(item: MemoryDeltaItem): string | null {
  if (item.action === 'upsert' || item.action === 'delete') {
    return `mem:${item.category}.${item.key}`;
  }
  if (item.action === 'relationship') {
    return `rel:${item.from}->${item.to}:${item.type}`;
  }
  return 'story:state';
}

function memoryValue(item: MemoryDeltaItem): string | null {
  if (item.action === 'upsert') {
    return typeof item.value === 'string' ? item.value : JSON.stringify(item.value);
  }
  if (item.action === 'relationship') {
    return `${item.type}|${item.aCallsB ?? ''}|${item.bCallsA ?? ''}|${item.description ?? ''}`;
  }
  if (item.action === 'story_state') {
    return JSON.stringify({
      summaryText: item.summaryText ?? null,
      cultivationState: item.cultivationState ?? null,
      locationState: item.locationState ?? null,
      importantItems: item.importantItems ?? null,
      unresolvedPlotPoints: item.unresolvedPlotPoints ?? null,
      currentChapterNumber: item.currentChapterNumber ?? null,
    });
  }
  return '__delete__';
}

function isIdentityUpsert(item: MemoryDeltaItem): boolean {
  if (item.action !== 'upsert') return false;
  const cat = item.category.toLowerCase();
  const key = item.key.toLowerCase();
  return (
    cat.includes('character') ||
    cat.includes('identity') ||
    key.includes('name') ||
    key.includes('identity') ||
    key.includes('true_name')
  );
}

function isAddressMemory(item: MemoryDeltaItem): boolean {
  if (item.action === 'relationship') return true;
  if (item.action !== 'upsert') return false;
  const blob = `${item.category}.${item.key}`.toLowerCase();
  return (
    blob.includes('address') ||
    blob.includes('honorific') ||
    blob.includes('称呼') ||
    blob.includes('form_of_address')
  );
}

/**
 * Compare candidate job deltas against already-committed wave deltas
 * (and optional locked term targets) before commit barrier advances.
 */
export function validateWaveConsistency(input: {
  committed: ParsedBatchResult[];
  candidate: ParsedBatchResult;
  /** source → locked preferred target */
  lockedTermTargets?: Record<string, string>;
}): ConsistencyCheckResult {
  const conflicts: WaveConflict[] = [];
  const priorTerms = new Map<string, string>();
  const priorMemory = new Map<string, string>();

  for (const batch of input.committed) {
    for (const t of batch.termDeltas) {
      priorTerms.set(termKey(t), termTarget(t));
    }
    for (const m of batch.memoryDeltas) {
      const k = memoryKey(m);
      const v = memoryValue(m);
      if (k && v != null) priorMemory.set(k, v);
    }
  }

  const locked = input.lockedTermTargets ?? {};

  for (const t of input.candidate.termDeltas) {
    const k = termKey(t);
    const v = termTarget(t);
    const source = t.source.toLowerCase();

    if (locked[source] && locked[source] !== v) {
      conflicts.push({
        kind: 'locked_term',
        severity: 'hard',
        key: k,
        message: 'Conflicts with locked term',
        priorValue: locked[source],
        nextValue: v,
      });
      continue;
    }

    const prior = priorTerms.get(k);
    if (prior && prior !== v) {
      const nameLike =
        t.action === 'update' || (t.action === 'discover' && t.category === 'name');
      conflicts.push({
        kind: nameLike ? 'name_correction' : 'locked_term',
        severity: nameLike ? 'soft' : 'hard',
        key: k,
        message: 'Term target differs from earlier wave job',
        priorValue: prior,
        nextValue: v,
      });
    }
  }

  for (const m of input.candidate.memoryDeltas) {
    const k = memoryKey(m);
    const v = memoryValue(m);
    if (!k || v == null) continue;
    const prior = priorMemory.get(k);
    if (!prior || prior === v) continue;

    if (m.action === 'story_state') {
      conflicts.push({
        kind: 'story_state',
        severity: 'hard',
        key: k,
        message: 'Story-state contradiction with earlier wave job',
        priorValue: prior,
        nextValue: v,
      });
      continue;
    }
    if (isIdentityUpsert(m)) {
      conflicts.push({
        kind: 'character_identity',
        severity: 'hard',
        key: k,
        message: 'Character identity reveal conflicts with earlier wave job',
        priorValue: prior,
        nextValue: v,
      });
      continue;
    }
    if (isAddressMemory(m)) {
      conflicts.push({
        kind: 'relationship_address',
        severity: 'soft',
        key: k,
        message: 'Form of address / relationship differs from earlier wave job',
        priorValue: prior,
        nextValue: v,
      });
      continue;
    }
    conflicts.push({
      kind: 'story_state',
      severity: 'soft',
      key: k,
      message: 'Memory delta differs from earlier wave job',
      priorValue: prior,
      nextValue: v,
    });
  }

  let severity: WaveConflictSeverity = 'none';
  for (const c of conflicts) {
    severity = maxSeverity(severity, c.severity);
  }

  return {
    severity,
    conflicts,
    action:
      severity === 'hard' ? 'retranslate' : severity === 'soft' ? 'repair' : 'commit',
  };
}

/** Drop deltas that conflict with committed prior (soft repair). Translations kept. */
export function stripConflictingDeltas(
  candidate: ParsedBatchResult,
  conflicts: WaveConflict[],
): ParsedBatchResult {
  const dropKeys = new Set(conflicts.map((c) => c.key));
  return {
    ...candidate,
    termDeltas: candidate.termDeltas.filter((t) => !dropKeys.has(termKey(t))),
    memoryDeltas: candidate.memoryDeltas.filter((m) => {
      const k = memoryKey(m);
      return !k || !dropKeys.has(k);
    }),
  };
}

/** Deterministic order_index by chapter_from ASC, then jobId. */
export function assignWaveOrderIndices(
  ranges: { jobId: string; chapterFrom: number }[],
): { jobId: string; orderIndex: number }[] {
  const sorted = [...ranges].sort((a, b) => {
    if (a.chapterFrom !== b.chapterFrom) return a.chapterFrom - b.chapterFrom;
    return a.jobId.localeCompare(b.jobId);
  });
  return sorted.map((r, i) => ({ jobId: r.jobId, orderIndex: i }));
}
