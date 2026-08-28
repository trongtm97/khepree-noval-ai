/**
 * Translation Pack modes — Phase 4 local-first.
 *
 * - local_context: default — SQLite ContextSelector only, provider-neutral
 * - notebook_assisted: optional future — explicit opt-in only
 */
export const PACK_MODES = ['local_context', 'notebook_assisted'] as const;

export type PackMode = (typeof PACK_MODES)[number];

/** Legacy modes removed in Phase 4 — normalized on read. */
export const LEGACY_PACK_MODES = ['slim', 'hybrid', 'fat'] as const;

export type LegacyPackMode = (typeof LEGACY_PACK_MODES)[number];

export type PackModeInput = PackMode | LegacyPackMode;

export function normalizePackMode(value: unknown): PackMode {
  if (value === 'notebook_assisted') return 'notebook_assisted';
  if (value === 'local_context') return 'local_context';
  // Legacy slim/hybrid/fat → local_context (Notebook no longer drives pack shape).
  if (value === 'slim' || value === 'hybrid' || value === 'fat') return 'local_context';
  return 'local_context';
}

export function isPackMode(value: unknown): value is PackMode {
  return value === 'local_context' || value === 'notebook_assisted';
}

export function isPackModeOrLegacy(value: unknown): value is PackModeInput {
  return (
    isPackMode(value) ||
    value === 'slim' ||
    value === 'hybrid' ||
    value === 'fat'
  );
}

/** Operator-facing memory usage label (VI product copy). */
export function formatMemoryUsage(packMode?: string | null): string | null {
  const mode = normalizePackMode(packMode);
  if (mode === 'notebook_assisted') {
    return 'Bộ nhớ sử dụng: Notebook + ngữ cảnh cục bộ';
  }
  return 'Bộ nhớ sử dụng: ngữ cảnh cục bộ (Local Context)';
}

/** True when pack content is fully local — not notebook_assisted. */
export function isLocalContextPack(packMode?: string | null): boolean {
  return normalizePackMode(packMode) === 'local_context';
}
