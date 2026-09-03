/**
 * Versioned selector catalogs with a hard fallback budget.
 * Prefer DOM evidence over blind sleeps; never invent stealth selectors.
 */

export interface VersionedSelectorCandidate {
  key: string;
  /** Semver-ish catalog version that introduced this candidate. */
  version: number;
  css?: string;
  testId?: string;
  role?: string;
  name?: string;
}

export interface VersionedSelectorCatalog {
  id: string;
  version: number;
  candidates: VersionedSelectorCandidate[];
}

export const DEFAULT_SELECTOR_FALLBACK_BUDGET = 4;

export function candidatesWithinBudget(
  catalog: VersionedSelectorCatalog,
  budget: number = DEFAULT_SELECTOR_FALLBACK_BUDGET,
): VersionedSelectorCandidate[] {
  const sorted = [...catalog.candidates].sort((a, b) => b.version - a.version);
  return sorted.slice(0, Math.max(1, budget));
}

export async function resolveFirstVisible(
  tryCandidate: (c: VersionedSelectorCandidate) => Promise<boolean>,
  catalog: VersionedSelectorCatalog,
  budget: number = DEFAULT_SELECTOR_FALLBACK_BUDGET,
): Promise<{ candidate: VersionedSelectorCandidate; attempts: number } | null> {
  const list = candidatesWithinBudget(catalog, budget);
  let attempts = 0;
  for (const candidate of list) {
    attempts += 1;
    if (await tryCandidate(candidate)) {
      return { candidate, attempts };
    }
  }
  return null;
}
