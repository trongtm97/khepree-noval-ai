import {
  NOTEBOOK_USABLE_FOR_HYBRID_PACK,
  NOTEBOOK_USABLE_FOR_SLIM_PACK,
  type NotebookStatus,
} from '@shared/constants/notebook';
import type { PackMode } from '@shared/constants/pack-mode';
import type { DatabaseManager } from '../db/database-manager';
import { resolveTranslationNotebook } from '../notebook/notebook-resolver';

export interface PackModeDecision {
  packMode: PackMode;
  notebookId: string | null;
  localKnowledgeVersion: number;
  notebookVerifiedVersion: number;
  /** True when Drive LIVE / active bindings confirm Notebook sources. */
  sourceGroundingConfirmed: boolean;
  reason: string;
}

export interface ResolvePackModeInput {
  projectId: string;
  accountId?: string | null;
  /** Winning provider for this send. WebAPI always FAT. */
  providerType?: string | null;
  /** Force SQLite fat pack (tests / explicit fallback). */
  forceFatPack?: boolean;
}

/**
 * Source grounding = Notebook has verified Drive LIVE (or legacy active) bindings
 * and no binding stuck in needs_migration for this notebook.
 */
export function isSourceGroundingConfirmed(
  db: DatabaseManager,
  projectId: string,
  notebookId: string | null,
): boolean {
  const bindings = notebookId
    ? db.notebookSourceBindings.listByNotebook(projectId, notebookId)
    : db.notebookSourceBindings.listByProject(projectId);

  if (bindings.length === 0) {
    // Legacy projects without binding rows: treat last_verified_at as grounding proxy.
    return false;
  }

  const hasActive = bindings.some(
    (b) =>
      b.status === 'active' &&
      (b.binding_type === 'DRIVE_LIVE' ||
        b.binding_type === 'STATIC_UPLOAD' ||
        b.binding_type === 'COPIED_TEXT'),
  );
  const hasMigrationDebt = bindings.some((b) => b.status === 'needs_migration');
  return hasActive && !hasMigrationDebt;
}

/**
 * Resolve SLIM / HYBRID / FAT for a translation send.
 *
 * SLIM: READY + expected version + expected nonce (08_SYNC_STATE probe) + grounded.
 * HYBRID: SYNC_PENDING / STALE, or ready but version unverified/mismatch.
 * FAT: WebAPI, no Notebook mapping, grounding failed on ready, or notebook unavailable.
 */
export function resolveTranslationPackMode(
  db: DatabaseManager,
  input: ResolvePackModeInput,
): PackModeDecision {
  const localKnowledgeVersion = db.knowledgeFiles.maxLocalVersion(input.projectId);

  if (input.forceFatPack || input.providerType === 'GEMINI_WEB_API') {
    return {
      packMode: 'fat',
      notebookId: null,
      localKnowledgeVersion,
      notebookVerifiedVersion: 0,
      sourceGroundingConfirmed: false,
      reason:
        input.providerType === 'GEMINI_WEB_API'
          ? 'webapi_always_fat'
          : 'force_fat',
    };
  }

  if (input.providerType && input.providerType !== 'PLAYWRIGHT_GEMINI') {
    return {
      packMode: 'fat',
      notebookId: null,
      localKnowledgeVersion,
      notebookVerifiedVersion: 0,
      sourceGroundingConfirmed: false,
      reason: 'non_playwright_provider',
    };
  }

  if (!input.accountId) {
    // No account → cannot bind Translation Notebook; SQLite fat.
    const anyTranslation = db.notebooks
      .listByProject(input.projectId)
      .find((m) => m.notebook_role === 'TRANSLATION' || m.notebook_role === 'SINGLE');
    if (!anyTranslation) {
      return {
        packMode: 'fat',
        notebookId: null,
        localKnowledgeVersion,
        notebookVerifiedVersion: 0,
        sourceGroundingConfirmed: false,
        reason: 'mapping_missing',
      };
    }
    // Account missing but mapping exists elsewhere — still FAT (wrong/missing account).
    return {
      packMode: 'fat',
      notebookId: anyTranslation.notebook_id ?? anyTranslation.id,
      localKnowledgeVersion,
      notebookVerifiedVersion: anyTranslation.knowledge_version,
      sourceGroundingConfirmed: false,
      reason: 'account_missing',
    };
  }

  const mapping = resolveTranslationNotebook(db, input.projectId, input.accountId);

  if (!mapping) {
    return {
      packMode: 'fat',
      notebookId: null,
      localKnowledgeVersion,
      notebookVerifiedVersion: 0,
      sourceGroundingConfirmed: false,
      reason: 'mapping_missing',
    };
  }

  const notebookId = mapping.notebook_id ?? mapping.id;
  const driveState = db.driveSyncState.ensure(input.projectId);
  const notebookVerifiedVersion = driveState.verified_knowledge_version || mapping.knowledge_version || 0;
  const pendingVersion = driveState.pending_knowledge_version;
  const status = mapping.status as NotebookStatus;
  const grounding = isSourceGroundingConfirmed(db, input.projectId, mapping.notebook_id);
  // Legacy: no binding rows yet — accept last_verified_at as grounding proxy.
  const legacyGrounded =
    db.notebookSourceBindings.listByProject(input.projectId).length === 0 &&
    Boolean(mapping.last_verified_at);
  const sourceGroundingConfirmed = grounding || legacyGrounded;

  if (!NOTEBOOK_USABLE_FOR_HYBRID_PACK.has(status)) {
    return {
      packMode: 'fat',
      notebookId,
      localKnowledgeVersion: Math.max(localKnowledgeVersion, pendingVersion),
      notebookVerifiedVersion,
      sourceGroundingConfirmed,
      reason: `notebook_unavailable:${status}`,
    };
  }

  // SYNC_PENDING / STALE → HYBRID always (local delta fills gap). Grounding gates SLIM only.
  if (status === 'sync_pending' || status === 'stale') {
    return {
      packMode: 'hybrid',
      notebookId,
      localKnowledgeVersion: Math.max(localKnowledgeVersion, pendingVersion),
      notebookVerifiedVersion,
      sourceGroundingConfirmed,
      reason: status === 'sync_pending' ? 'sync_pending' : 'stale',
    };
  }

  // ready without source bindings / with migration debt → cannot trust Notebook cold → FAT.
  if (!sourceGroundingConfirmed) {
    return {
      packMode: 'fat',
      notebookId,
      localKnowledgeVersion: Math.max(localKnowledgeVersion, pendingVersion),
      notebookVerifiedVersion,
      sourceGroundingConfirmed: false,
      reason: 'grounding_failed',
    };
  }

  // CONTENT_CURRENT: version+nonce probe matched pending Drive sync-state (08_SYNC_STATE).
  // Never SLIM from source-name presence alone.
  const contentCurrent =
    driveState.version_probe_status === 'verified' &&
    driveState.verified_knowledge_version === driveState.pending_knowledge_version &&
    Boolean(driveState.verified_sync_nonce) &&
    driveState.verified_sync_nonce === driveState.pending_sync_nonce &&
    !db.knowledgeFiles.anyDirty(input.projectId);

  const slimEligible =
    NOTEBOOK_USABLE_FOR_SLIM_PACK.has(status) && contentCurrent && sourceGroundingConfirmed;

  if (slimEligible) {
    return {
      packMode: 'slim',
      notebookId,
      localKnowledgeVersion: Math.max(localKnowledgeVersion, pendingVersion),
      notebookVerifiedVersion,
      sourceGroundingConfirmed,
      reason: 'ready_verified',
    };
  }

  // ready + mismatch / unverified → HYBRID (Notebook cold + local delta).
  return {
    packMode: 'hybrid',
    notebookId,
    localKnowledgeVersion: Math.max(localKnowledgeVersion, pendingVersion),
    notebookVerifiedVersion,
    sourceGroundingConfirmed,
    reason:
      driveState.version_probe_status === 'mismatch'
        ? 'version_mismatch'
        : 'version_unverified',
  };
}
