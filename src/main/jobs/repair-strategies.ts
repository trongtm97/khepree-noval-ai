import type { QaResult, ParsedBatchResult } from '@shared/schemas/output-protocol';
import type { RepairPromptPlan } from '@shared/schemas/job';
import type { RepairReason } from '@shared/constants/job';
import { buildRepairPack } from './repair-pack-builder';
import { TERM_DELTA_JSON_SCHEMA, MEMORY_DELTA_JSON_SCHEMA } from '@shared/schemas/term-delta';

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
      qa.emptyParagraphIds.length === 0
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
        e.code === 'locked_term_missing' || e.code === 'locked_term_forbidden_variant',
    )
  ) {
    return 'TERM_VIOLATION';
  }

  if (qa.emptyParagraphIds.length > 0) {
    return 'EMPTY_PARAGRAPH';
  }

  if (qa.missingParagraphIds.length > 0) {
    return 'MISSING_PARAGRAPH';
  }

  // duplicate/unknown: handled by normalizeParsedTranslations in repair-loop — not AI repair.

  return null;
}

export const missingParagraphStrategy: RepairStrategy = {
  reason: 'MISSING_PARAGRAPH',
  builds(ctx) {
    return ctx.qa.missingParagraphIds.length > 0;
  },
  buildPlan(ctx) {
    const pack = buildRepairPack({
      missingParagraphIds: ctx.qa.missingParagraphIds,
      batchParagraphs: ctx.batchParagraphs,
    });
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
    const pack = buildRepairPack({
      missingParagraphIds: ctx.qa.emptyParagraphIds,
      batchParagraphs: ctx.batchParagraphs,
    });
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

export const malformedOutputStrategy: RepairStrategy = {
  reason: 'MALFORMED_OUTPUT',
  builds(ctx) {
    return (
      ctx.parsed.status === 'needs_repair' ||
      ctx.qa.errors.some((e) => e.code === 'parse_uncertain')
    );
  },
  buildPlan(ctx) {
    // If we already have some good lines, only ask for missing; else full protocol re-request
    if (ctx.qa.missingParagraphIds.length > 0 && ctx.parsed.translations.length > 0) {
      const pack = buildRepairPack({
        missingParagraphIds: ctx.qa.missingParagraphIds,
        batchParagraphs: ctx.batchParagraphs,
      });
      return {
        mode: 'malformed_full',
        reason: 'MALFORMED_OUTPUT',
        prompt: pack.prompt,
        targetParagraphIds: [...ctx.qa.missingParagraphIds],
        retranslate: true,
      };
    }

    const sourceBlock = ctx.batchParagraphs
      .map((p) => `${p.paragraphId} ${p.sourceText}`)
      .join('\n');

    return {
      mode: 'malformed_full',
      reason: 'MALFORMED_OUTPUT',
      prompt: [
        'Previous output was malformed and could not be parsed confidently.',
        'Return EXACTLY the three sections with proper closing tags. No markdown fences. No intro prose.',
        '',
        '<TRANSLATION>',
        '[C000001:P000001] Vietnamese…',
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
    const paraIds = [
      ...new Set(
        ctx.qa.errors
          .filter(
            (e) =>
              e.code === 'locked_term_missing' ||
              e.code === 'locked_term_forbidden_variant',
          )
          .map((e) => e.paragraphId)
          .filter((id): id is string => Boolean(id)),
      ),
    ];

    const pack = buildRepairPack({
      missingParagraphIds: paraIds.length > 0 ? paraIds : ctx.qa.missingParagraphIds,
      batchParagraphs: ctx.batchParagraphs,
    });

    const termLines =
      ctx.lockedTermHints
        ?.map((t) => `- ${t.source} → MUST use exactly: "${t.preferred}"`)
        .join('\n') ?? '(see project locked terms)';

    return {
      mode: 'term_violation',
      reason: 'TERM_VIOLATION',
      prompt: [
        'Locked-term QA failed. Re-translate ONLY the affected paragraphs.',
        'Use locked preferred translations EXACTLY. Do not use forbidden variants.',
        '',
        'Locked terms:',
        termLines,
        '',
        pack.prompt,
      ].join('\n'),
      targetParagraphIds: paraIds,
      retranslate: true,
    };
  },
};

/**
 * JSON invalid for deltas — do NOT re-translate.
 * Ask only for TERM_DELTA / MEMORY_DELTA with correct schema.
 */
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
  buildPlan(_ctx) {
    return {
      mode: 'deltas_only',
      reason: 'MEMORY_JSON_INVALID',
      prompt: [
        'Previous TERM_DELTA / MEMORY_DELTA JSON was invalid.',
        'Do NOT re-translate paragraphs.',
        'Return ONLY these two sections with valid JSON arrays matching the schema.',
        'Empty arrays are allowed: []',
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

export const REPAIR_STRATEGIES: RepairStrategy[] = [
  memoryJsonInvalidStrategy,
  termViolationStrategy,
  emptyParagraphStrategy,
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
