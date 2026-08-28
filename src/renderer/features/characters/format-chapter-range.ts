export function formatCharacterChapterRange(
  first: number | null | undefined,
  last: number | null | undefined,
): { compact: string; isSingle: boolean } {
  const lo = first ?? null;
  const hi = last ?? null;
  if (lo == null && hi == null) return { compact: '—', isSingle: false };
  if (lo != null && hi != null && lo === hi) return { compact: String(lo), isSingle: true };
  if (lo != null && hi != null) return { compact: `${lo}–${hi}`, isSingle: false };
  return { compact: String(lo ?? hi ?? '—'), isSingle: true };
}
