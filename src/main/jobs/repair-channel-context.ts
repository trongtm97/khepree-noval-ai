import type { PackMode } from '@shared/constants/pack-mode';

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
  const lines: string[] = [];

  if (input.webApiFat) {
    lines.push(
      '## Repair channel: GEMINI_WEB_API (FAT local SQLite)',
      'Notebook knowledge is NOT available on this channel.',
      'Use ONLY the local memory sections below + the repair task.',
      '',
    );
    if (input.fatSections?.criticalRules?.trim()) {
      lines.push(input.fatSections.criticalRules.trim(), '');
    }
    if (input.fatSections?.hotMemoryDelta?.trim()) {
      lines.push(input.fatSections.hotMemoryDelta.trim(), '');
    }
    if (input.fatSections?.activeProjectTerms?.trim()) {
      lines.push(input.fatSections.activeProjectTerms.trim(), '');
    }
  } else {
    const mode = input.packMode ?? 'slim';
    lines.push(
      `## Repair channel: Playwright Translation Notebook (${mode.toUpperCase()})`,
      'Keep using the SAME Translation Notebook thread/context as the initial send.',
      'Do NOT open a generic Gemini chat. Do NOT switch to Research Notebook.',
    );
    if (input.notebookId) {
      lines.push(`Notebook id: ${input.notebookId}`);
    }
    lines.push('');

    if (mode === 'slim' || mode === 'hybrid') {
      lines.push(
        'Notebook cold knowledge remains authoritative for characters/terms/world.',
        'This message only adds repair targets + locked overrides + hot deltas.',
        '',
      );
    }

    const locked = input.lockedTerms ?? [];
    if (locked.length > 0) {
      lines.push('## Locked terms (must keep exact)');
      for (const t of locked) {
        lines.push(`- ${t.source} → ${t.preferred}`);
      }
      lines.push('');
    }

    const hot = input.hotMemoryText?.trim();
    if (hot && hot !== '(none — Notebook cold knowledge is authoritative)') {
      lines.push(
        hot.startsWith('##') ? hot : `## Hot Memory\n${hot}`,
        '',
      );
    } else if (mode === 'hybrid' && hot) {
      lines.push(hot.startsWith('##') ? hot : `## Hot Memory\n${hot}`, '');
    }
  }

  lines.push('## Repair / continuation task', input.repairBody.trim());
  return lines.join('\n');
}
