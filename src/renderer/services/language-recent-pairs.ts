const STORAGE_KEY = 'noveltrans.recentLanguagePairs';
const MAX_RECENT = 8;

export interface RecentLanguagePair {
  sourceCode: string;
  targetCode: string;
  usedAt: string;
}

export function loadRecentLanguagePairs(): RecentLanguagePair[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as RecentLanguagePair[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (p) =>
          typeof p.sourceCode === 'string' &&
          typeof p.targetCode === 'string' &&
          p.sourceCode !== p.targetCode,
      )
      .slice(0, MAX_RECENT);
  } catch {
    return [];
  }
}

export function saveRecentLanguagePair(sourceCode: string, targetCode: string): void {
  if (!sourceCode || !targetCode || sourceCode === targetCode) return;
  const now = new Date().toISOString();
  const existing = loadRecentLanguagePairs().filter(
    (p) => !(p.sourceCode === sourceCode && p.targetCode === targetCode),
  );
  const next: RecentLanguagePair[] = [
    { sourceCode, targetCode, usedAt: now },
    ...existing,
  ].slice(0, MAX_RECENT);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // quota / private mode — ignore
  }
}

export function recentSourceCodes(pairs: RecentLanguagePair[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of pairs) {
    if (!seen.has(p.sourceCode)) {
      seen.add(p.sourceCode);
      out.push(p.sourceCode);
    }
  }
  return out;
}

export function recentTargetCodes(pairs: RecentLanguagePair[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of pairs) {
    if (!seen.has(p.targetCode)) {
      seen.add(p.targetCode);
      out.push(p.targetCode);
    }
  }
  return out;
}
