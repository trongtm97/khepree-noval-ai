import type { DatabaseManager } from '../db/database-manager';
import { KNOWLEDGE_TYPES } from '@shared/constants/knowledge';
import {
  evaluateVersionProbeResponse,
  VERSION_PROBE_PROMPT,
  type VersionProbeEvaluation,
} from '@shared/constants/notebook-version-probe';
import { resolveTranslationNotebook } from './notebook-resolver';
import { logger } from '../logging/logger';

export type VersionProbeCapture = (prompt: string) => Promise<string>;

export interface ApplyVersionProbeInput {
  projectId: string;
  accountId: string;
  rawResponse: string;
}

/**
 * Apply a captured probe response: VERIFIED clears hot memory;
 * mismatch/unverified keep sync_pending (HYBRID). Never marks ready from names alone.
 */
export function applyVersionProbeResult(
  db: DatabaseManager,
  input: ApplyVersionProbeInput,
): VersionProbeEvaluation & {
  packHint: 'slim' | 'hybrid';
} {
  const state = db.driveSyncState.ensure(input.projectId);
  const expectedVersion = state.pending_knowledge_version;
  const expectedNonce = state.pending_sync_nonce ?? '';

  const evaluation = evaluateVersionProbeResponse(input.rawResponse, {
    knowledgeVersion: expectedVersion,
    syncNonce: expectedNonce,
  });

  const mapping = resolveTranslationNotebook(db, input.projectId, input.accountId);

  if (evaluation.status === 'verified') {
    db.driveSyncState.patch(input.projectId, {
      verifiedKnowledgeVersion: expectedVersion,
      verifiedSyncNonce: expectedNonce,
      versionProbeStatus: 'verified',
    });
    db.knowledgeSyncEvents.insert({
      projectId: input.projectId,
      eventType: 'NOTEBOOK_VERSION_VERIFIED',
      message: `Notebook version ${expectedVersion} + nonce verified.`,
    });
    db.knowledgeSyncEvents.insert({
      projectId: input.projectId,
      eventType: 'NOTEBOOK_GROUNDING_VERIFIED',
      message: `Notebook grounding verified (v${expectedVersion}).`,
    });

    if (mapping) {
      for (const type of KNOWLEDGE_TYPES) {
        db.knowledgeFiles.markVerified(input.projectId, type);
      }
      db.notebooks.bumpLocalKnowledgeVersion(mapping.id, expectedVersion);
      db.notebooks.markVerified(mapping.id);
      db.notebooks.setStatus(mapping.id, 'ready', null);
      db.notebookHotDeltas.clearActive(input.projectId);
      db.knowledgeSyncEvents.insert({
        projectId: input.projectId,
        eventType: 'NOTEBOOK_SYNC_VERIFIED',
        message: 'Notebook đã cập nhật bộ nhớ.',
      });
    }

    return { ...evaluation, packHint: 'slim' };
  }

  if (evaluation.status === 'mismatch') {
    db.driveSyncState.patch(input.projectId, {
      versionProbeStatus: 'mismatch',
    });
    db.knowledgeSyncEvents.insert({
      projectId: input.projectId,
      eventType: 'NOTEBOOK_VERSION_MISMATCH',
      message: `Notebook còn version cũ (got ${evaluation.parsedVersion ?? '?'}; expect ${expectedVersion}).`,
    });
    if (mapping) {
      db.notebooks.setStatus(mapping.id, 'sync_pending', 'NOTEBOOK_VERSION_MISMATCH');
    }
    return { ...evaluation, packHint: 'hybrid' };
  }

  db.driveSyncState.patch(input.projectId, {
    versionProbeStatus: 'unverified',
  });
  db.knowledgeSyncEvents.insert({
    projectId: input.projectId,
    eventType: 'NOTEBOOK_GROUNDING_UNVERIFIED',
    message: 'Notebook không trả được version/nonce từ sync-state.',
  });
  if (mapping) {
    db.notebooks.setStatus(
      mapping.id,
      'sync_pending',
      'NOTEBOOK_GROUNDING_UNVERIFIED',
    );
  }
  return { ...evaluation, packHint: 'hybrid' };
}

/**
 * Run version probe via injectable capture (browser or test fake).
 */
export async function runKnowledgeVersionProbe(
  db: DatabaseManager,
  input: {
    projectId: string;
    accountId: string;
    capture: VersionProbeCapture;
  },
): Promise<VersionProbeEvaluation & { packHint: 'slim' | 'hybrid' }> {
  const state = db.driveSyncState.ensure(input.projectId);
  if (!state.pending_sync_nonce || state.pending_knowledge_version <= 0) {
    logger.warn('Version probe skipped — no pending sync manifest', {
      projectId: input.projectId,
    });
    return {
      status: 'unverified',
      parsedVersion: null,
      parsedNonce: null,
      reason: 'NOTEBOOK_GROUNDING_UNVERIFIED',
      packHint: 'hybrid',
    };
  }

  db.knowledgeSyncEvents.insert({
    projectId: input.projectId,
    eventType: 'NOTEBOOK_VERSION_PROBE_STARTED',
    message: `Probing Notebook for version ${state.pending_knowledge_version}.`,
  });

  try {
    const raw = await input.capture(VERSION_PROBE_PROMPT);
    return applyVersionProbeResult(db, {
      projectId: input.projectId,
      accountId: input.accountId,
      rawResponse: raw,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn('Version probe capture failed', {
      projectId: input.projectId,
      message,
    });
    db.driveSyncState.patch(input.projectId, { versionProbeStatus: 'unverified' });
    db.knowledgeSyncEvents.insert({
      projectId: input.projectId,
      eventType: 'NOTEBOOK_GROUNDING_UNVERIFIED',
      message: `Probe failed: ${message}`,
    });
    const mapping = resolveTranslationNotebook(db, input.projectId, input.accountId);
    if (mapping) {
      db.notebooks.setStatus(mapping.id, 'sync_pending', 'NOTEBOOK_GROUNDING_UNVERIFIED');
    }
    return {
      status: 'unverified',
      parsedVersion: null,
      parsedNonce: null,
      reason: 'NOTEBOOK_GROUNDING_UNVERIFIED',
      packHint: 'hybrid',
    };
  }
}
