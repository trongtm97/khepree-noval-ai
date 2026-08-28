/** Knowledge slice keys for ContextBudget allocation. */
export const CONTEXT_BUDGET_SLICES = [
  'translationRules',
  'lockedTerms',
  'otherTerms',
  'characters',
  'relationships',
  'storyState',
  'worldKnowledge',
  'recentContext',
] as const;

export type ContextBudgetSlice = (typeof CONTEXT_BUDGET_SLICES)[number];

/**
 * Default token-budget allocation for Local Knowledge Engine.
 * Percentages must sum to 100; unused slice capacity is redistributed.
 */
export const DEFAULT_CONTEXT_BUDGET_ALLOCATION: Record<ContextBudgetSlice, number> = {
  translationRules: 10,
  lockedTerms: 20,
  otherTerms: 15,
  characters: 15,
  relationships: 10,
  storyState: 10,
  worldKnowledge: 10,
  recentContext: 10,
};

/** Local Knowledge Engine version — bump when selection algorithm changes. */
export const LOCAL_KNOWLEDGE_ENGINE_VERSION = 1;
