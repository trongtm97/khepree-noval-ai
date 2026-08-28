import type { QaResult, ParsedBatchResult } from '@shared/schemas/output-protocol';
import type { RepairPromptPlan } from '@shared/schemas/job';
import type { RepairReason } from '@shared/constants/job';
import { CONTINUATION_REPAIR_THRESHOLD } from '@shared/constants/job';
import { formatLanguagePairPreamble } from '@shared/constants/translation-style-model';
import { buildRepairPack } from './repair-pack-builder';
import { TERM_DELTA_JSON_SCHEMA, MEMORY_DELTA_JSON_SCHEMA } from '@shared/schemas/term-delta';
import {
  buildContinuationPrompt,
  findLastCompleteParagraphId,
  nextParagraphAfter,
} from './continuation';
import type { RepairTranslationContext, RepairNeighborTranslation } from './repair-translation-context';
import { requireRepairLanguagePair } from './repair-language-pair';

export interface RepairParagraph {
  paragraphId: string;
  sourceText: string;
}

export interface RepairStrategyContext {
  reason: RepairReason;
  qa: QaResult;
  parsed: ParsedBatchResult;
  batchParagraphs: RepairParagraph[];
  /** Locked preferred terms for TERM_VIOLATION prompts. */
  lockedTermHints?: { source: string; preferred: string; paragraphIds: string[] }[];
  sourceLanguage: string;
  targetLanguage: string;
  editionId?: string | null;
  /** Neighbor target lines already accepted in this batch. */
  neighborTargetTranslations?: RepairNeighborTranslation[];
  /** Continuation continuity — last accepted target paragraphs. */
  continuationTargetContext?: RepairNeighborTranslation[];
  repairContext?: RepairTranslationContext;
}

function pairLangs(ctx: RepairStrategyContext): {
  sourceLanguage: string;
  targetLanguage: string;
} {
  return requireRepairLanguagePair({
    sourceLanguage: ctx.sourceLanguage,
    targetLanguage: ctx.targetLanguage,
  });
}

function buildPackInput(
  ctx: RepairStrategyContext,
  missingParagraphIds: string[],
) {
  return {
    missingParagraphIds,
    batchParagraphs: ctx.batchParagraphs,
    ...pairLangs(ctx),
    neighborTargetTranslations: ctx.neighborTargetTranslations,
  };
}

function extractInvalidDeltaPayload(parsed: ParsedBatchResult): string {
  const lines = parsed.warnings
    .filter(
      (w) =>
        w.section === 'TERM_DELTA' ||
        w.section === 'MEMORY_DELTA' ||
        /TERM_DELTA|MEMORY_DELTA/i.test(w.message),
    )
    .map((w) => w.message);
  return lines.length ? lines.join('\n') : '';
}

export interface RepairStrategy {
  readonly reason: RepairReason;
  builds(ctx: RepairStrategyContext): boolean;
  buildPlan(ctx: RepairStrategyContext): RepairPromptPlan;
}

/** Classify primary repair reason from QA + parse (priority order). */
export function classifyRepairReason(
  parsed: ParsedBatchResult,
  qa: QaResult,
): RepairReason | null {
  if (parsed.status === 'needs_repair') {
    const hasMemWarn = parsed.warnings.some(
      (w) => w.section === 'MEMORY_DELTA' || w.message.includes('MEMORY_DELTA'),
    );
    const hasTermWarn = parsed.warnings.some(
      (w) => w.section === 'TERM_DELTA' || w.message.includes('TERM_DELTA'),
    );
    if (
      (hasMemWarn || hasTermWarn) &&
      parsed.translations.length > 0 &&
      qa.missingParagraphIds.length === 0 &&
      qa.emptyParagraphIds.length === 0 &&
      qa.corruptParagraphIds.length === 0
    ) {
      return 'MEMORY_JSON_INVALID';
    }
    return 'MALFORMED_OUTPUT';
  }

  if (qa.errors.some((e) => e.code === 'invalid_memory_delta' || e.code === 'invalid_term_delta')) {
    return 'MEMORY_JSON_INVALID';
  }

  if (
    qa.errors.some(
      (e) =>
        e.code === 'locked_term_missing' ||
        e.code === 'locked_term_forbidden_variant' ||
        e.code === 'edition_term_leak',
    )
  ) {
    return 'TERM_VIOLATION';
  }

  if (qa.errors.some((e) => e.code === 'target_language_mismatch')) {
    return 'CORRUPT_PARAGRAPH';
  }

  if (qa.emptyParagraphIds.length > 0) {
    return 'EMPTY_PARAGRAPH';
  }

  if (qa.corruptParagraphIds.length > 0) {
    return 'CORRUPT_PARAGRAPH';
  }

  if (qa.missingParagraphIds.length > 0) {
    if (
      qa.missingParagraphIds.length > CONTINUATION_REPAIR_THRESHOLD &&
      parsed.translations.some((t) => t.text.trim())
    ) {
      return 'OUTPUT_INCOMPLETE';
    }
    return 'MISSING_PARAGRAPH';
  }

  return null;
}

function canProtocolRecover(ctx: RepairStrategyContext): boolean {
  return (
    ctx.parsed.translations.some((t) => t.text.trim()) &&
    ctx.qa.missingParagraphIds.length === 0 &&
    ctx.qa.emptyParagraphIds.length === 0 &&
    ctx.qa.corruptParagraphIds.length === 0
  );
}

function buildProtocolRecoveryPlan(ctx: RepairStrategyContext): RepairPromptPlan {
  const langs = pairLangs(ctx);
  const existingBlock = ctx.parsed.translations
    .filter((t) => t.text.trim())
    .map((t) => `${t.paragraphId} ${t.text}`)
    .join('\n');

  return {
    mode: 'protocol_recovery',
    reason: 'MALFORMED_OUTPUT',
    prompt: [
      formatLanguagePairPreamble(langs.sourceLanguage, langs.targetLanguage),
      '',
      'Previous output contained valid translations but malformed protocol structure.',
      'Do NOT change translation prose. Re-wrap the SAME text in the required protocol sections.',
      '',
      'Existing translations (preserve text exactly):',
      existingBlock,
      '',
      'Return EXACTLY these sections with proper closing tags. No markdown fences.',
      '',
      '<TRANSLATION>',
      '[C000001:P000001] ...',
      '</TRANSLATION>',
      '<TERM_DELTA>',
      '[]',
      '</TERM_DELTA>',
      '<MEMORY_DELTA>',
      '[]',
      '</MEMORY_DELTA>',
      '',
      'Use [] for deltas unless this batch has new supported evidence — do not invent from schema alone.',
    ].join('\n'),
    targetParagraphIds: ctx.parsed.translations
      .filter((t) => t.text.trim())
      .map((t) => t.paragraphId),
    retranslate: false,
  };
}

export const missingParagraphStrategy: RepairStrategy = {
  reason: 'MISSING_PARAGRAPH',
  builds(ctx) {
    return ctx.qa.missingParagraphIds.length > 0;
  },
  buildPlan(ctx) {
    const pack = buildRepairPack(buildPackInput(ctx, ctx.qa.missingParagraphIds));
    return {
      mode: 'translation_missing',
      reason: 'MISSING_PARAGRAPH',
      prompt: pack.prompt,
      targetParagraphIds: [...ctx.qa.missingParagraphIds],
      retranslate: true,
    };
  },
};

export const emptyParagraphStrategy: RepairStrategy = {
  reason: 'EMPTY_PARAGRAPH',
  builds(ctx) {
    return ctx.qa.emptyParagraphIds.length > 0;
  },
  buildPlan(ctx) {
    const pack = buildRepairPack(buildPackInput(ctx, ctx.qa.emptyParagraphIds));
    return {
      mode: 'translation_empty',
      reason: 'EMPTY_PARAGRAPH',
      prompt: [
        'Previous response had EMPTY translations for these IDs.',
        'Re-translate ONLY these paragraphs. Text must be non-empty.',
        '',
        pack.prompt,
      ].join('\n'),
      targetParagraphIds: [...ctx.qa.emptyParagraphIds],
      retranslate: true,
    };
  },
};

export const corruptParagraphStrategy: RepairStrategy = {
  reason: 'CORRUPT_PARAGRAPH',
  builds(ctx) {
    return ctx.qa.corruptParagraphIds.length > 0;
  },
  buildPlan(ctx) {
    const pack = buildRepairPack(buildPackInput(ctx, ctx.qa.corruptParagraphIds));
    return {
      mode: 'translation_corrupt',
      reason: 'CORRUPT_PARAGRAPH',
      prompt: [
        'Previous response had CORRUPT / truncated translations for these IDs.',
        'Protocol tags (e.g. <TRANSLATION>) leaked into the body, or the line was cut short.',
        'Re-translate ONLY these paragraphs. Text must be complete in the target language.',
        'Do NOT put protocol tags inside translation lines. One line per ID.',
        '',
        pack.prompt,
      ].join('\n'),
      targetParagraphIds: [...ctx.qa.corruptParagraphIds],
      retranslate: true,
    };
  },
};

export const malformedOutputStrategy: RepairStrategy = {
  reason: 'MALFORMED_OUTPUT',
  builds(ctx) {
    return (
      ctx.parsed.status === 'needs_repair' ||
      ctx.qa.errors.some((e) => e.code === 'parse_uncertain')
    );
  },
  buildPlan(ctx) {
    if (canProtocolRecover(ctx)) {
      return buildProtocolRecoveryPlan(ctx);
    }

    if (ctx.qa.missingParagraphIds.length > 0 && ctx.parsed.translations.length > 0) {
      const pack = buildRepairPack(buildPackInput(ctx, ctx.qa.missingParagraphIds));
      return {
        mode: 'malformed_full',
        reason: 'MALFORMED_OUTPUT',
        prompt: pack.prompt,
        targetParagraphIds: [...ctx.qa.missingParagraphIds],
        retranslate: true,
      };
    }

    const langs = pairLangs(ctx);
    const sourceBlock = ctx.batchParagraphs
      .map((p) => `${p.paragraphId} ${p.sourceText}`)
      .join('\n');

    return {
      mode: 'malformed_full',
      reason: 'MALFORMED_OUTPUT',
      prompt: [
        formatLanguagePairPreamble(langs.sourceLanguage, langs.targetLanguage),
        '',
        'Previous output was malformed and could not be parsed confidently.',
        'Return EXACTLY the three sections with proper closing tags. No markdown fences. No intro prose.',
        '',
        '<TRANSLATION>',
        '[C000001:P000001] TARGET_LANGUAGE_TRANSLATION...',
        '</TRANSLATION>',
        '<TERM_DELTA>',
        '[]',
        '</TERM_DELTA>',
        '<MEMORY_DELTA>',
        '[]',
        '</MEMORY_DELTA>',
        '',
        'Source paragraphs:',
        sourceBlock,
      ].join('\n'),
      targetParagraphIds: ctx.batchParagraphs.map((p) => p.paragraphId),
      retranslate: true,
    };
  },
};

export const termViolationStrategy: RepairStrategy = {
  reason: 'TERM_VIOLATION',
  builds(ctx) {
    return ctx.qa.errors.some(
      (e) =>
        e.code === 'locked_term_missing' || e.code === 'locked_term_forbidden_variant',
    );
  },
  buildPlan(ctx) {
    const termErrors = ctx.qa.errors.filter(
      (e) =>
        e.code === 'locked_term_missing' || e.code === 'locked_term_forbidden_variant',
    );
    const paraIds = [
      ...new Set(
        termErrors
          .map((e) => e.paragraphId)
          .filter((id): id is string => Boolean(id)),
      ),
    ];

    const pack = buildRepairPack(
      buildPackInput(
        ctx,
        paraIds.length > 0 ? paraIds : ctx.qa.missingParagraphIds,
      ),
    );

    const termLines =
      ctx.lockedTermHints?.map((t) => {
        const ids =
          t.paragraphIds.length > 0
            ? t.paragraphIds.join(', ')
            : termErrors
                .filter((e) => e.termSource === t.source)
                .map((e) => e.paragraphId)
                .filter(Boolean)
                .join(', ');
        return `- source: ${t.source} → required target: "${t.preferred}" (affected IDs: ${ids || 'see QA'})`;
      }) ??
      termErrors.map((e) =>
        `- source: ${e.termSource ?? '?'} → required target: "${e.expected ?? '?'}" (affected ID: ${e.paragraphId ?? '?'})${e.found ? `; found: "${e.found}"` : ''}`,
      );

    return {
      mode: 'term_violation',
      reason: 'TERM_VIOLATION',
      prompt: [
        'Locked-term QA failed. Re-translate ONLY the affected paragraphs.',
        'Use the required target form exactly (language-aware — do not force English casing rules on non-English targets).',
        '',
        'Locked terms:',
        termLines.join('\n'),
        '',
        pack.prompt,
      ].join('\n'),
      targetParagraphIds: paraIds,
      retranslate: true,
    };
  },
};

export const memoryJsonInvalidStrategy: RepairStrategy = {
  reason: 'MEMORY_JSON_INVALID',
  builds(ctx) {
    return (
      ctx.reason === 'MEMORY_JSON_INVALID' ||
      ctx.qa.errors.some(
        (e) => e.code === 'invalid_memory_delta' || e.code === 'invalid_term_delta',
      )
    );
  },
  buildPlan(ctx) {
    const langs = pairLangs(ctx);
    const invalidPayload = extractInvalidDeltaPayload(ctx.parsed);
    const editionLine =
      ctx.editionId != null ? `Edition ID: ${ctx.editionId}` : 'Edition ID: (from job)';

    return {
      mode: 'deltas_only',
      reason: 'MEMORY_JSON_INVALID',
      prompt: [
        formatLanguagePairPreamble(langs.sourceLanguage, langs.targetLanguage),
        editionLine,
        '',
        'Previous TERM_DELTA / MEMORY_DELTA JSON was invalid.',
        'Do NOT re-translate paragraphs — valid translations must not be regenerated.',
        'Return ONLY these two sections with valid JSON arrays matching the schema.',
        'Use [] when no new evidence — do not manufacture entries from schema alone.',
        '',
        'Invalid or discarded delta evidence:',
        invalidPayload || '(payload not recoverable — return empty arrays unless evidence exists)',
        '',
        '<TERM_DELTA>',
        '[]',
        '</TERM_DELTA>',
        '',
        '<MEMORY_DELTA>',
        '[]',
        '</MEMORY_DELTA>',
        '',
        'TERM_DELTA item shapes: discover | update | confirm',
        JSON.stringify(TERM_DELTA_JSON_SCHEMA, null, 2),
        '',
        'MEMORY_DELTA item shapes: upsert | delete | relationship | story_state',
        JSON.stringify(MEMORY_DELTA_JSON_SCHEMA, null, 2),
      ].join('\n'),
      targetParagraphIds: [],
      retranslate: false,
    };
  },
};

export const outputIncompleteStrategy: RepairStrategy = {
  reason: 'OUTPUT_INCOMPLETE',
  builds(ctx) {
    return (
      ctx.qa.missingParagraphIds.length > CONTINUATION_REPAIR_THRESHOLD &&
      ctx.parsed.translations.some((t) => t.text.trim())
    );
  },
  buildPlan(ctx) {
    const langs = pairLangs(ctx);
    const lastComplete = findLastCompleteParagraphId(
      ctx.batchParagraphs.map((p) => p.paragraphId),
      ctx.parsed.translations,
    );
    const fromId =
      nextParagraphAfter(
        ctx.batchParagraphs.map((p) => p.paragraphId),
        lastComplete,
      ) ?? ctx.qa.missingParagraphIds[0];
    const prompt = buildContinuationPrompt({
      fromParagraphId: fromId,
      batchParagraphs: ctx.batchParagraphs,
      remainingParagraphIds: ctx.qa.missingParagraphIds,
      sourceLanguage: langs.sourceLanguage,
      targetLanguage: langs.targetLanguage,
      continuationTargetContext: ctx.continuationTargetContext,
    });
    return {
      mode: 'continuation',
      reason: 'OUTPUT_INCOMPLETE',
      prompt,
      targetParagraphIds: [...ctx.qa.missingParagraphIds],
      retranslate: true,
    };
  },
};

export const REPAIR_STRATEGIES: RepairStrategy[] = [
  memoryJsonInvalidStrategy,
  termViolationStrategy,
  emptyParagraphStrategy,
  corruptParagraphStrategy,
  outputIncompleteStrategy,
  missingParagraphStrategy,
  malformedOutputStrategy,
];

export function selectRepairStrategy(
  ctx: Omit<RepairStrategyContext, 'reason'> & { reason: RepairReason },
): RepairStrategy {
  const byReason = REPAIR_STRATEGIES.find((s) => s.reason === ctx.reason);
  if (byReason?.builds(ctx)) return byReason;
  for (const strategy of REPAIR_STRATEGIES) {
    if (strategy.builds(ctx)) return strategy;
  }
  return malformedOutputStrategy;
}

export function buildRepairPlan(ctx: RepairStrategyContext): RepairPromptPlan {
  return selectRepairStrategy(ctx).buildPlan(ctx);
}
