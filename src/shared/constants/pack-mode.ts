/** Translation Pack modes — how much local SQLite context rides with the prompt. */
export const PACK_MODES = ['slim', 'hybrid', 'fat'] as const;

export type PackMode = (typeof PACK_MODES)[number];

export function isPackMode(value: unknown): value is PackMode {
  return value === 'slim' || value === 'hybrid' || value === 'fat';
}

/**
 * Operator-facing memory usage label (VI product copy).
 * Shown on job detail / translate path alongside the AI channel.
 */
export function formatMemoryUsage(packMode?: string | null): string | null {
  if (packMode === 'slim') return 'Bộ nhớ sử dụng: Notebook';
  if (packMode === 'hybrid') return 'Bộ nhớ sử dụng: Notebook + cập nhật cục bộ';
  if (packMode === 'fat') return 'Bộ nhớ sử dụng: bộ nhớ cục bộ';
  return null;
}
