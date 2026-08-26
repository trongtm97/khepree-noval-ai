/** Offline token estimate — no external tokenizer. */
export function estimateTokens(text: string): number {
  let tokens = 0;
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0;
    if (code >= 0x4e00 && code <= 0x9fff) {
      tokens += 1;
    } else if (/\s/u.test(ch)) {
      tokens += 0.1;
    } else {
      tokens += 0.28;
    }
  }
  return Math.max(1, Math.ceil(tokens));
}

export function estimateObjectTokens(value: unknown): number {
  return estimateTokens(JSON.stringify(value));
}

export interface BudgetTrimResult<T> {
  items: T[];
  estimatedTokens: number;
  dropped: number;
}

export function trimToTokenBudget<T>(
  items: T[],
  serialize: (item: T) => string,
  budget: number,
): BudgetTrimResult<T> {
  const kept: T[] = [];
  let used = 0;
  for (const item of items) {
    const cost = estimateTokens(serialize(item));
    if (used + cost > budget) break;
    kept.push(item);
    used += cost;
  }
  return {
    items: kept,
    estimatedTokens: used,
    dropped: items.length - kept.length,
  };
}
