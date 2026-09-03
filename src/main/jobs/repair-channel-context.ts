import type { PackMode } from '@shared/constants/pack-mode';
import { isPackModeOrLegacy, normalizePackMode } from '@shared/constants/pack-mode';
import { splitRepairChannelPrompt } from '../prompt/pack-operation';

/**
 * Channel context inherited from the initial translation send.
 * Repair / continuation reuse local context snapshot — provider-neutral.
 */
export interface RepairChannelContext {
  providerType: string | null;
  accountId: string | null;
  notebookId: string | null;
  threadRef: string | null;
  packMode: PackMode | null;
  knowledgeVersion: number | null;
  /** Frozen local context from initial translate send. */
  localContextSnapshot?: string | null;
  sourceLanguage?: string | null;
  targetLanguage?: string | null;
  editionId?: string | null;
  stylePolicyHash?: string | null;
}

export const REPAIR_CHANNEL_EMPTY: RepairChannelContext = {
  providerType: null,
  accountId: null,
  notebookId: null,
  threadRef: null,
  packMode: null,
  knowledgeVersion: null,
  localContextSnapshot: null,
  sourceLanguage: null,
  targetLanguage: null,
  editionId: null,
  stylePolicyHash: null,
};

/** Read channel fields from job.progress JSON. */
export function readRepairChannelFromProgress(
  progressRaw: string | null | undefined,
): RepairChannelContext {
  if (!progressRaw) return { ...REPAIR_CHANNEL_EMPTY };
  try {
    const p = JSON.parse(progressRaw) as Record<string, unknown>;
    const rawMode = p.packMode;
    return {
      providerType: typeof p.providerType === 'string' ? p.providerType : null,
      accountId: typeof p.accountId === 'string' ? p.accountId : null,
      notebookId:
        typeof p.notebookId === 'string'
          ? p.notebookId
          : p.notebookId === null
            ? null
            : null,
      threadRef: typeof p.threadRef === 'string' ? p.threadRef : null,
      packMode: isPackModeOrLegacy(rawMode) ? normalizePackMode(rawMode) : null,
      knowledgeVersion:
        typeof p.localKnowledgeVersion === 'number'
          ? p.localKnowledgeVersion
          : typeof p.notebookVerifiedVersion === 'number'
            ? p.notebookVerifiedVersion
            : typeof p.knowledgeVersion === 'number'
              ? p.knowledgeVersion
              : null,
      localContextSnapshot:
        typeof p.localContextSnapshot === 'string' ? p.localContextSnapshot : null,
      sourceLanguage:
        typeof p.repairSourceLanguage === 'string'
          ? p.repairSourceLanguage
          : typeof p.sourceLanguage === 'string'
            ? p.sourceLanguage
            : null,
      targetLanguage:
        typeof p.repairTargetLanguage === 'string'
          ? p.repairTargetLanguage
          : typeof p.targetLanguage === 'string'
            ? p.targetLanguage
            : null,
      editionId:
        typeof p.repairEditionId === 'string'
          ? p.repairEditionId
          : p.repairEditionId === null
            ? null
            : typeof p.editionId === 'string'
              ? p.editionId
              : null,
      stylePolicyHash:
        typeof p.stylePolicyHash === 'string'
          ? p.stylePolicyHash
          : typeof p.promptHash === 'string'
            ? p.promptHash
            : null,
    };
  } catch {
    return { ...REPAIR_CHANNEL_EMPTY };
  }
}

export function channelSnapshotForAttempt(
  channel: RepairChannelContext,
): Record<string, unknown> {
  return {
    providerType: channel.providerType,
    accountId: channel.accountId,
    notebookId: channel.notebookId,
    threadRef: channel.threadRef,
    packMode: channel.packMode,
    knowledgeVersion: channel.knowledgeVersion,
    localContextSnapshot: channel.localContextSnapshot ?? null,
    repairSourceLanguage: channel.sourceLanguage ?? null,
    repairTargetLanguage: channel.targetLanguage ?? null,
    sourceLanguage: channel.sourceLanguage ?? null,
    targetLanguage: channel.targetLanguage ?? null,
    repairEditionId: channel.editionId ?? null,
    stylePolicyHash: channel.stylePolicyHash ?? null,
    promptHash: channel.stylePolicyHash ?? null,
  };
}

/**
 * Wrap repair/continuation with the same local context snapshot as initial send.
 */
export function wrapRepairPromptWithChannelContext(input: {
  repairBody: string;
  packMode?: PackMode | null;
  localContextSnapshot?: string | null;
  lockedTerms?: { source: string; preferred: string }[];
  hotMemoryText?: string | null;
  notebookId?: string | null;
  fatSections?: {
    criticalRules?: string;
    hotMemoryDelta?: string;
    activeProjectTerms?: string;
  } | null;
  /** @deprecated — provider-neutral local context only. */
  webApiFat?: boolean;
  operationType?: 'REPAIR' | 'CONTINUATION';
}): string {
  return splitRepairChannelPrompt({
    repairBody: input.repairBody,
    operationType: input.operationType ?? 'REPAIR',
    localContextSnapshot: input.localContextSnapshot,
    fatSections: input.fatSections,
  }).prompt;
}
