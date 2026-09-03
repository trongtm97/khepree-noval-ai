import {
  CONTEXT_BUDGET_SLICES,
  DEFAULT_CONTEXT_BUDGET_ALLOCATION,
  type ContextBudgetSlice,
} from '@shared/constants/context-budget';
import { estimateTokens } from '../memory/budget-estimator';

export interface ContextRecord<T> {
  id: string;
  item: T;
  /** Higher = more important when budget forces whole-record drops. */
  priority: number;
  serialize: () => string;
}

export interface SliceBudgetResult<T> {
  items: T[];
  usedTokens: number;
  dropped: number;
  slice: ContextBudgetSlice;
}

export interface ContextBudgetResult<T> {
  bySlice: Record<ContextBudgetSlice, SliceBudgetResult<T>>;
  totalUsed: number;
  totalDropped: number;
}

function allocateSliceBudgets(
  totalBudget: number,
  allocation: Record<ContextBudgetSlice, number> = DEFAULT_CONTEXT_BUDGET_ALLOCATION,
): Map<ContextBudgetSlice, number> {
  const budgets = new Map<ContextBudgetSlice, number>();
  for (const slice of CONTEXT_BUDGET_SLICES) {
    const pct = allocation[slice];
    budgets.set(slice, Math.floor((totalBudget * pct) / 100));
  }
  return budgets;
}

/**
 * Adds whole records until slice token budget is reached.
 * Never truncates inside a record.
 */
export function applySliceBudget<T>(
  records: ContextRecord<T>[],
  sliceBudget: number,
  slice: ContextBudgetSlice,
): SliceBudgetResult<T> {
  const sorted = records.slice().sort((a, b) => b.priority - a.priority);
  const kept: T[] = [];
  let used = 0;

  for (const record of sorted) {
    const cost = estimateTokens(record.serialize());
    if (used + cost > sliceBudget) continue;
    kept.push(record.item);
    used += cost;
  }

  return {
    items: kept,
    usedTokens: used,
    dropped: sorted.length - kept.length,
    slice,
  };
}

/**
 * Apply per-slice budgets then redistribute unused capacity to slices that dropped records.
 */
export function applyContextBudget<T>(
  recordsBySlice: Partial<Record<ContextBudgetSlice, ContextRecord<T>[]>>,
  totalBudget: number,
  allocation: Record<ContextBudgetSlice, number> = DEFAULT_CONTEXT_BUDGET_ALLOCATION,
): ContextBudgetResult<T> {
  const sliceBudgets = allocateSliceBudgets(totalBudget, allocation);
  const bySlice = {} as Record<ContextBudgetSlice, SliceBudgetResult<T>>;
  let unused = 0;

  for (const slice of CONTEXT_BUDGET_SLICES) {
    const sliceBudget = sliceBudgets.get(slice) ?? 0;
    const records = recordsBySlice[slice] ?? [];
    const result = applySliceBudget(records, sliceBudget, slice);
    bySlice[slice] = result;
    unused += Math.max(0, sliceBudget - result.usedTokens);
  }

  // Redistribute unused capacity to slices that still have dropped records.
  if (unused > 0) {
    const needy = CONTEXT_BUDGET_SLICES.filter((slice) => bySlice[slice].dropped > 0);
    if (needy.length > 0) {
      const extraPerSlice = Math.floor(unused / needy.length);
      for (const slice of needy) {
        const original = recordsBySlice[slice] ?? [];
        const alreadyKept = new Set(bySlice[slice].items);
        const remaining = original.filter((r) => !alreadyKept.has(r.item));
        if (remaining.length === 0 || extraPerSlice <= 0) continue;

        const expanded = applySliceBudget(
          remaining,
          bySlice[slice].usedTokens + extraPerSlice,
          slice,
        );
        bySlice[slice] = {
          items: [...bySlice[slice].items, ...expanded.items],
          usedTokens: bySlice[slice].usedTokens + expanded.usedTokens,
          dropped: bySlice[slice].dropped - expanded.items.length,
          slice,
        };
      }
    }
  }

  let totalUsed = 0;
  let totalDropped = 0;
  for (const slice of CONTEXT_BUDGET_SLICES) {
    totalUsed += bySlice[slice].usedTokens;
    totalDropped += bySlice[slice].dropped;
  }

  return { bySlice, totalUsed, totalDropped };
}
