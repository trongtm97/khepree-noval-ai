import type { PackMode } from '@shared/constants/pack-mode';
import { splitRepairChannelPrompt } from '../prompt/pack-operation';

/**
 * Channel context inherited from the initial translation send.
 * Repair / continuation must reuse this unless failover forces FAT WebAPI.
 */
export interface RepairChannelContext {
  providerType: string | null;
  accountId: string | null;
  notebookId: string | null;
  threadRef: string | null;
  packMode: PackMode | null;
  knowledgeVersion: number | null;
}

export const REPAIR_CHANNEL_EMPTY: RepairChannelContext = {
  providerType: null,
  accountId: null,
  notebookId: null,
  threadRef: null,
  packMode: null,
  knowledgeVersion: null,
};

export function isPackMode(value: unknown): value is PackMode {
  return value === 'slim' || value === 'hybrid' || value === 'fat';
}

/** Read channel fields from job.progress JSON. */
export function readRepairChannelFromProgress(
  progressRaw: string | null | undefined,
): RepairChannelContext {
  if (!progressRaw) return { ...REPAIR_CHANNEL_EMPTY };
  try {
    const p = JSON.parse(progressRaw) as Record<string, unknown>;
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
      packMode: isPackMode(p.packMode) ? p.packMode : null,
      knowledgeVersion:
        typeof p.localKnowledgeVersion === 'number'
          ? p.localKnowledgeVersion
          : typeof p.notebookVerifiedVersion === 'number'
            ? p.notebookVerifiedVersion
            : typeof p.knowledgeVersion === 'number'
              ? p.knowledgeVersion
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
  };
}

/**
 * Wrap a repair/continuation body so Notebook / locked / hot stay in scope
 * without re-sending the full chapter source.
 */
export function wrapRepairPromptWithChannelContext(input: {
  repairBody: string;
  packMode: PackMode | null;
  lockedTerms?: { source: string; preferred: string }[];
  hotMemoryText?: string | null;
  notebookId?: string | null;
  fatSections?: {
    criticalRules?: string;
    hotMemoryDelta?: string;
    activeProjectTerms?: string;
  } | null;
  /** WebAPI failover — do not claim Notebook knowledge. */
  webApiFat?: boolean;
}): string {
  return splitRepairChannelPrompt(input).prompt;
}
