import type { TranslationPackOperation } from '@shared/constants/translation-pack';
import type { PackMode } from '@shared/constants/pack-mode';

/**
 * Assemble final provider prompt from separable pack halves.
 * Provider adaptation may swap baseContext; operationPrompt stays fixed.
 */
export function assemblePackPrompt(input: {
  baseContext?: string | null;
  operationPrompt?: string | null;
}): string {
  const base = (input.baseContext ?? '').trim();
  const op = (input.operationPrompt ?? '').trim();
  if (base && op) return `${base}\n\n${op}`;
  return base || op;
}

export function isRepairOrContinuationOp(
  operationType: TranslationPackOperation | null | undefined,
): boolean {
  return operationType === 'REPAIR' || operationType === 'CONTINUATION';
}

export function formatOperationTaskHeader(
  operationType: TranslationPackOperation,
): string {
  return operationType === 'CONTINUATION'
    ? '## Continuation task'
    : '## Repair / continuation task';
}

/**
 * Split channel framing (adaptable) from the immutable repair/continuation body.
 */
export function splitRepairChannelPrompt(input: {
  repairBody: string;
  operationType?: TranslationPackOperation;
  packMode: PackMode | null;
  lockedTerms?: { source: string; preferred: string }[];
  hotMemoryText?: string | null;
  notebookId?: string | null;
  fatSections?: {
    criticalRules?: string;
    hotMemoryDelta?: string;
    activeProjectTerms?: string;
  } | null;
  webApiFat?: boolean;
}): { baseContext: string; operationPrompt: string; prompt: string } {
  const operationType = input.operationType ?? 'REPAIR';
  const baseLines: string[] = [];

  if (input.webApiFat) {
    baseLines.push(
      '## Repair channel: GEMINI_WEB_API (FAT local SQLite)',
      'Notebook knowledge is NOT available on this channel.',
      'Use ONLY the local memory sections below + the repair task.',
      '',
    );
    if (input.fatSections?.criticalRules?.trim()) {
      baseLines.push(input.fatSections.criticalRules.trim(), '');
    }
    if (input.fatSections?.hotMemoryDelta?.trim()) {
      baseLines.push(input.fatSections.hotMemoryDelta.trim(), '');
    }
    if (input.fatSections?.activeProjectTerms?.trim()) {
      baseLines.push(input.fatSections.activeProjectTerms.trim(), '');
    }
  } else {
    const mode = input.packMode ?? 'slim';
    baseLines.push(
      `## Repair channel: Playwright Translation Notebook (${mode.toUpperCase()})`,
      'Keep using the SAME Translation Notebook thread/context as the initial send.',
      'Do NOT open a generic Gemini chat. Do NOT switch to Research Notebook.',
    );
    if (input.notebookId) {
      baseLines.push(`Notebook id: ${input.notebookId}`);
    }
    baseLines.push('');

    if (mode === 'slim' || mode === 'hybrid') {
      baseLines.push(
        'Notebook cold knowledge remains authoritative for characters/terms/world.',
        'This message only adds repair targets + locked overrides + hot deltas.',
        '',
      );
    }

    const locked = input.lockedTerms ?? [];
    if (locked.length > 0) {
      baseLines.push('## Locked terms (must keep exact)');
      for (const t of locked) {
        baseLines.push(`- ${t.source} → ${t.preferred}`);
      }
      baseLines.push('');
    }

    const hot = input.hotMemoryText?.trim();
    if (hot && hot !== '(none — Notebook cold knowledge is authoritative)') {
      baseLines.push(hot.startsWith('##') ? hot : `## Hot Memory\n${hot}`, '');
    } else if (mode === 'hybrid' && hot) {
      baseLines.push(hot.startsWith('##') ? hot : `## Hot Memory\n${hot}`, '');
    }
  }

  const operationPrompt = [
    formatOperationTaskHeader(operationType),
    input.repairBody.trim(),
  ].join('\n');

  const baseContext = baseLines.join('\n').trimEnd();
  return {
    baseContext,
    operationPrompt,
    prompt: assemblePackPrompt({ baseContext, operationPrompt }),
  };
}

/**
 * Extract immutable operation body from an existing pack.
 * Prefer operationPrompt; fall back to stripping a prior wrap of pack.prompt.
 */
export function extractOperationPrompt(pack: {
  operationPrompt?: string | null;
  prompt: string;
  operationType?: string | null;
}): string {
  const explicit = (pack.operationPrompt ?? '').trim();
  if (explicit) return explicit;

  const prompt = pack.prompt;
  const markers = [
    '## Continuation task\n',
    '## Repair / continuation task\n',
  ];
  for (const marker of markers) {
    const idx = prompt.lastIndexOf(marker);
    if (idx >= 0) {
      return prompt.slice(idx).trim();
    }
  }
  // Last resort: entire prompt is the operation (legacy repair packs).
  return prompt.trim();
}
