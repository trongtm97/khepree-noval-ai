/** Normalize and dedupe rule lines while preserving first-seen order. */
export function dedupePolicyRules(layers: string[][]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const group of layers) {
    for (const raw of group) {
      const trimmed = raw.trim();
      if (!trimmed) continue;
      const key = trimmed.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(trimmed);
    }
  }
  return out;
}
