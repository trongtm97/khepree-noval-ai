import type { PackMode } from '@shared/constants/pack-mode';
import type { DatabaseManager } from '../db/database-manager';

export interface PackModeDecision {
  packMode: PackMode;
  notebookId: string | null;
  localKnowledgeVersion: number;
  notebookVerifiedVersion: number;
  sourceGroundingConfirmed: boolean;
  reason: string;
}

export interface ResolvePackModeInput {
  projectId: string;
  accountId?: string | null;
  /** Ignored for pack content in Phase 4 — provider-neutral. Kept for telemetry only. */
  providerType?: string | null;
  /** Explicit NOTEBOOK_ASSISTED — default is LOCAL_CONTEXT. */
  preferNotebookPack?: boolean;
  /** @deprecated Use preferNotebookPack. */
  forceFatPack?: boolean;
}

/**
 * Phase 4: pack mode is NOT derived from Notebook health, provider type, or sync state.
 * Default LOCAL_CONTEXT for every send.
 */
export function resolveTranslationPackMode(
  db: DatabaseManager,
  input: ResolvePackModeInput,
): PackModeDecision {
  const localKnowledgeVersion = db.knowledgeFiles.maxLocalVersion(input.projectId);

  if (input.preferNotebookPack) {
    return {
      packMode: 'notebook_assisted',
      notebookId: input.accountId ?? null,
      localKnowledgeVersion,
      notebookVerifiedVersion: 0,
      sourceGroundingConfirmed: false,
      reason: 'notebook_assisted_explicit',
    };
  }

  return {
    packMode: 'local_context',
    notebookId: null,
    localKnowledgeVersion,
    notebookVerifiedVersion: 0,
    sourceGroundingConfirmed: false,
    reason: 'local_context_default',
  };
}

/** @deprecated Notebook grounding no longer gates pack mode — kept for binding telemetry. */
export function isSourceGroundingConfirmed(
  _db: DatabaseManager,
  _projectId: string,
  _notebookId: string | null,
): boolean {
  return false;
}
