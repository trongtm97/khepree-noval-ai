/**
 * Weighted fair project ordering for the automation scheduler.
 * Higher weight (from lower job priority numbers) gets more turns;
 * every project keeps weight ≥ 1 so low-priority novels never starve.
 */

export interface QueuedProjectWeight {
  projectId: string;
  /** Lowest priority among runnable jobs (ASC = higher urgency). */
  minPriority: number;
  waitSince: string;
}

export interface WeightedFairState {
  /** Virtual finish time / served quanta per project. */
  served: Map<string, number>;
}

export const WEIGHTED_FAIR_DEFAULTS = {
  /** priority 1 → weight maxWeight; priority ≥ maxWeight → weight 1 */
  maxWeight: 8,
  minWeight: 1,
} as const;

export function priorityToWeight(
  minPriority: number,
  opts: { maxWeight?: number; minWeight?: number } = {},
): number {
  const maxW = opts.maxWeight ?? WEIGHTED_FAIR_DEFAULTS.maxWeight;
  const minW = opts.minWeight ?? WEIGHTED_FAIR_DEFAULTS.minWeight;
  const p = Number.isFinite(minPriority) ? Math.max(1, Math.floor(minPriority)) : maxW;
  return Math.max(minW, Math.min(maxW, maxW - Math.min(p, maxW) + 1));
}

/**
 * Order projects by virtual finish time (WFQ): served/weight ascending.
 * Tie-break: older waitSince, then projectId.
 */
export function orderProjectsWeightedFair(
  projects: QueuedProjectWeight[],
  state: WeightedFairState,
): string[] {
  if (projects.length === 0) return [];
  const scored = projects.map((p) => {
    const weight = priorityToWeight(p.minPriority);
    const served = state.served.get(p.projectId) ?? 0;
    return {
      projectId: p.projectId,
      virtualFinish: served / weight,
      waitSince: p.waitSince,
      weight,
    };
  });
  scored.sort((a, b) => {
    if (a.virtualFinish !== b.virtualFinish) return a.virtualFinish - b.virtualFinish;
    const w = a.waitSince.localeCompare(b.waitSince);
    if (w !== 0) return w;
    return a.projectId.localeCompare(b.projectId);
  });
  return scored.map((s) => s.projectId);
}

export function recordProjectServed(state: WeightedFairState, projectId: string): void {
  state.served.set(projectId, (state.served.get(projectId) ?? 0) + 1);
}

/** Drop served entries for projects no longer queued (bound memory). */
export function pruneWeightedFairState(
  state: WeightedFairState,
  activeProjectIds: readonly string[],
): void {
  const active = new Set(activeProjectIds);
  for (const id of state.served.keys()) {
    if (!active.has(id)) state.served.delete(id);
  }
}
