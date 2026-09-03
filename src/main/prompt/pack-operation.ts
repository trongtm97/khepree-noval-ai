import type { TranslationPackOperation } from '@shared/constants/translation-pack';

/**
 * Assemble final provider prompt from separable pack halves.
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
    : '## Repair task';
}

export interface LocalContextSections {
  translationRules?: string;
  lockedTerms?: string;
  relevantTerms?: string;
  activeCharacters?: string;
  relationships?: string;
  storyState?: string;
  worldFacts?: string;
  recentContext?: string;
}

function formatLocalContextSections(sections: LocalContextSections | null | undefined): string {
  if (!sections) return '';
  const parts: string[] = ['## Local Context (snapshot)'];
  const append = (label: string, body?: string) => {
    if (body?.trim()) parts.push('', `### ${label}`, body.trim());
  };
  append('Translation Rules', sections.translationRules);
  append('Locked Terms', sections.lockedTerms);
  append('Relevant Terms', sections.relevantTerms);
  append('Active Characters', sections.activeCharacters);
  append('Relationships', sections.relationships);
  append('Story State', sections.storyState);
  append('World Facts', sections.worldFacts);
  append('Recent Context', sections.recentContext);
  return parts.join('\n');
}

/**
 * Provider-neutral repair/continuation split.
 * baseContext = frozen local context snapshot; operationPrompt = repair/continuation body only.
 */
export function splitRepairChannelPrompt(input: {
  repairBody: string;
  operationType?: TranslationPackOperation;
  /** Full local context snapshot from initial translate pack (provider-neutral). */
  localContextSnapshot?: string | null;
  /** Structured sections — used when snapshot string not available. */
  localContextSections?: LocalContextSections | null;
  /** @deprecated Legacy — use localContextSnapshot. */
  packMode?: string | null;
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

  let baseContext = input.localContextSnapshot?.trim() ?? '';
  if (!baseContext && input.localContextSections) {
    baseContext = formatLocalContextSections(input.localContextSections);
  }
  if (!baseContext && input.fatSections) {
    baseContext = [
      input.fatSections.criticalRules,
      input.fatSections.activeProjectTerms,
      input.fatSections.hotMemoryDelta,
    ]
      .filter((s) => s?.trim())
      .join('\n\n');
  }

  const operationPrompt = [
    formatOperationTaskHeader(operationType),
    input.repairBody.trim(),
  ].join('\n');

  return {
    baseContext: baseContext.trimEnd(),
    operationPrompt,
    prompt: assemblePackPrompt({ baseContext, operationPrompt }),
  };
}

/**
 * Extract immutable operation body from an existing pack.
 */
export function extractOperationPrompt(pack: {
  prompt: string;
  operationPrompt?: string;
}): string {
  if (pack.operationPrompt?.trim()) return pack.operationPrompt.trim();
  const marker = /^## (?:Repair task|Continuation task|Repair \/ continuation task)\s*/im;
  const match = marker.exec(pack.prompt);
  if (match?.index != null) {
    return pack.prompt.slice(match.index).trim();
  }
  return pack.prompt.trim();
}
