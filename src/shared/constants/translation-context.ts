import type { PackMode } from './pack-mode';
import { isPackModeOrLegacy, normalizePackMode } from './pack-mode';

/** How Translation Notebook knowledge is grounded for this job. */
export const KNOWLEDGE_SOURCE_MODES = ['STATIC', 'LOCAL_ONLY'] as const;

export type KnowledgeSourceMode = (typeof KNOWLEDGE_SOURCE_MODES)[number];

export function isKnowledgeSourceMode(value: unknown): value is KnowledgeSourceMode {
  return value === 'STATIC' || value === 'LOCAL_ONLY';
}

/**
 * Per-job Translation Context Diagnostics — what AI channel + memory actually used.
 */
export interface TranslationContextDiagnostics {
  providerType: string | null;
  accountId: string | null;
  notebookRole: 'TRANSLATION' | 'RESEARCH' | 'SINGLE' | null;
  notebookId: string | null;
  notebookName: string | null;
  notebookGroundingVerified: boolean;
  localKnowledgeVersion: number | null;
  notebookKnowledgeVersion: number | null;
  packMode: PackMode | null;
  hotDeltaCount: number;
  threadRef: string | null;
  knowledgeSourceMode: KnowledgeSourceMode;
}

export interface JobTimelineEntry {
  at: string;
  event: string;
  message?: string;
}

/** Operator-facing AI channel short label. */
export function formatDiagnosticsAiChannel(
  providerType?: string | null,
): string | null {
  if (!providerType) return null;
  switch (providerType) {
    case 'PLAYWRIGHT_GEMINI':
      return 'Gemini Browser';
    case 'GEMINI_WEB_API':
      return 'Gemini Web API';
    case 'GEMINI_OFFICIAL':
      return 'Gemini Official API';
    default:
      return providerType;
  }
}

/** Memory surface: local-first pack. */
export function formatDiagnosticsMemorySurface(
  diagnostics: Pick<
    TranslationContextDiagnostics,
    'packMode' | 'notebookGroundingVerified' | 'providerType'
  >,
): string {
  if (diagnostics.packMode === 'notebook_assisted') {
    return 'Translation Notebook + ngữ cảnh cục bộ';
  }
  return 'SQLite local memory';
}

/** Context mode line — human label; technical pack mode for tooltips only. */
export function formatDiagnosticsContextMode(
  diagnostics: Pick<
    TranslationContextDiagnostics,
    | 'packMode'
    | 'notebookGroundingVerified'
    | 'localKnowledgeVersion'
    | 'notebookKnowledgeVersion'
  >,
): string {
  if (diagnostics.packMode === 'notebook_assisted') {
    return 'Notebook + ngữ cảnh cục bộ';
  }
  return 'Bộ nhớ cục bộ (Local Context)';
}

/** Technical pack-mode label for tooltips. */
export function formatDiagnosticsPackModeTooltip(
  diagnostics: Pick<
    TranslationContextDiagnostics,
    | 'packMode'
    | 'notebookGroundingVerified'
    | 'localKnowledgeVersion'
    | 'notebookKnowledgeVersion'
  >,
): string {
  const local = diagnostics.localKnowledgeVersion;
  if (diagnostics.packMode === 'notebook_assisted') {
    const notebook = diagnostics.notebookKnowledgeVersion;
    const nv = notebook != null ? `v${notebook}` : 'v?';
    const lv = local != null ? `v${local}` : 'v?';
    return `NOTEBOOK_ASSISTED — Notebook ${nv} + local ${lv}`;
  }
  const lv = local != null ? `v${local}` : 'v?';
  return `LOCAL_CONTEXT — SQLite ${lv}`;
}

/** Knowledge version pair: v48 / v48 ✓ or mismatch. */
export function formatDiagnosticsKnowledgeVersions(
  diagnostics: Pick<
    TranslationContextDiagnostics,
    'localKnowledgeVersion' | 'notebookKnowledgeVersion' | 'notebookGroundingVerified'
  >,
): string | null {
  const local = diagnostics.localKnowledgeVersion;
  const notebook = diagnostics.notebookKnowledgeVersion;
  if (local == null && notebook == null) return null;
  const left = notebook != null ? `v${notebook}` : 'v—';
  const right = local != null ? `v${local}` : 'v—';
  const ok =
    diagnostics.notebookGroundingVerified &&
    local != null &&
    notebook != null &&
    local === notebook;
  return ok ? `${left} / ${right} ✓` : `${left} / ${right}`;
}

/**
 * Warning when Browser path runs without verified Notebook grounding.
 * Phase 4: pack is local-first — no false "full Notebook" claim.
 */
export function formatDiagnosticsGroundingWarning(
  diagnostics: Pick<
    TranslationContextDiagnostics,
    'providerType' | 'notebookGroundingVerified' | 'packMode'
  >,
): string | null {
  if (diagnostics.packMode !== 'notebook_assisted') return null;
  if (diagnostics.notebookGroundingVerified) return null;
  return 'Notebook chưa xác minh — đang dùng ngữ cảnh cục bộ.';
}

export function readDiagnosticsFromProgress(
  progress: Record<string, unknown> | null | undefined,
): TranslationContextDiagnostics | null {
  if (!progress) return null;
  const packMode = isPackModeOrLegacy(progress.packMode)
    ? normalizePackMode(progress.packMode)
    : null;
  const hasAny =
    typeof progress.providerType === 'string' ||
    packMode != null ||
    progress.notebookId != null ||
    typeof progress.notebookName === 'string';
  if (!hasAny) return null;

  const role = progress.notebookRole;
  return {
    providerType: typeof progress.providerType === 'string' ? progress.providerType : null,
    accountId: typeof progress.accountId === 'string' ? progress.accountId : null,
    notebookRole:
      role === 'TRANSLATION' || role === 'RESEARCH' || role === 'SINGLE' ? role : null,
    notebookId:
      typeof progress.notebookId === 'string'
        ? progress.notebookId
        : progress.notebookId === null
          ? null
          : null,
    notebookName: typeof progress.notebookName === 'string' ? progress.notebookName : null,
    notebookGroundingVerified: progress.notebookGroundingVerified === true,
    localKnowledgeVersion:
      typeof progress.localKnowledgeVersion === 'number'
        ? progress.localKnowledgeVersion
        : null,
    notebookKnowledgeVersion:
      typeof progress.notebookKnowledgeVersion === 'number'
        ? progress.notebookKnowledgeVersion
        : typeof progress.notebookVerifiedVersion === 'number'
          ? progress.notebookVerifiedVersion
          : null,
    packMode,
    hotDeltaCount:
      typeof progress.hotDeltaCount === 'number' ? progress.hotDeltaCount : 0,
    threadRef: typeof progress.threadRef === 'string' ? progress.threadRef : null,
    knowledgeSourceMode: isKnowledgeSourceMode(progress.knowledgeSourceMode)
      ? progress.knowledgeSourceMode
      : packMode === 'local_context'
        ? 'LOCAL_ONLY'
        : 'STATIC',
  };
}
