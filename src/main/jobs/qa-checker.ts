import type { QaIssue, QaResult, ParsedBatchResult } from '@shared/schemas/output-protocol';
import type { QaVerdict } from '@shared/constants/output-protocol';
import { isCorruptTranslationText } from './corrupt-translation';
import {
  runLanguageAwareQa,
  type LockedAddressTermForQa,
} from './qa-language-aware';

export interface LockedTermForQa {
  /** Source term present in batch paragraph source text. */
  source: string;
  /** Preferred target-language form (must appear if source appears). */
  preferred: string;
  /**
   * Variants that must NOT be used instead of preferred when term is locked.
   * Typically known wrong spellings / old alternatives that were rejected.
   * Do not auto-replace — only flag.
   */
  forbiddenVariants?: string[];
  /** Wrong-edition target forms (e.g. Vietnamese name in English edition). */
  crossEditionForbidden?: string[];
}

export interface SourceParagraphForQa {
  paragraphId: string;
  sourceText: string;
}

export interface QaCheckerInput {
  parsed: ParsedBatchResult;
  /** Expected paragraph IDs in batch order. */
  sourceParagraphIds: string[];
  sourceParagraphs?: SourceParagraphForQa[];
  lockedTerms?: LockedTermForQa[];
  lockedAddressTerms?: LockedAddressTermForQa[];
  /** When set, enables language-aware local QA (script, leakage, normalized terms). */
  sourceLanguage?: string;
  targetLanguage?: string;
}

/**
 * Local QA — no AI.
 * Compares SOURCE_IDS vs TRANSLATED_IDS; locked-term checks; never mutates text.
 */
export function runLocalQa(input: QaCheckerInput): QaResult {
  const errors: QaIssue[] = [];
  const warnings: QaIssue[] = [];
  const infos: QaIssue[] = [];

  if (input.parsed.status === 'needs_repair') {
    errors.push({
      code: 'parse_uncertain',
      severity: 'error',
      message: 'Parser returned NEEDS_REPAIR — output uncertain',
    });
  }

  const sourceIds = input.sourceParagraphIds;
  const sourceSet = new Set(sourceIds);
  const sourceById = new Map(
    (input.sourceParagraphs ?? []).map((p) => [p.paragraphId, p.sourceText]),
  );
  const seen = new Map<string, number>();
  const translatedOrder: string[] = [];
  const corruptParagraphIds: string[] = [];

  for (const line of input.parsed.translations) {
    const id = line.paragraphId;
    translatedOrder.push(id);
    seen.set(id, (seen.get(id) ?? 0) + 1);

    if (!sourceSet.has(id)) {
      errors.push({
        code: 'unknown_paragraph',
        severity: 'error',
        message: `Unknown paragraph ID not in source batch: ${id}`,
        paragraphId: id,
      });
    }

    if (!line.text.trim()) {
      errors.push({
        code: 'empty_translation',
        severity: 'error',
        message: `Empty translation for ${id}`,
        paragraphId: id,
      });
    } else if (isCorruptTranslationText(line.text, sourceById.get(id))) {
      corruptParagraphIds.push(id);
      errors.push({
        code: 'corrupt_translation',
        severity: 'error',
        message: `Corrupt / truncated translation for ${id}`,
        paragraphId: id,
      });
    }
  }

  const duplicateParagraphIds: string[] = [];
  for (const [id, count] of seen) {
    if (count > 1) {
      duplicateParagraphIds.push(id);
      errors.push({
        code: 'duplicate_paragraph',
        severity: 'error',
        message: `Duplicate paragraph ID (${count}×): ${id}`,
        paragraphId: id,
      });
    }
  }

  const translatedSet = new Set(translatedOrder);
  const missingParagraphIds = sourceIds.filter((id) => !translatedSet.has(id));
  for (const id of missingParagraphIds) {
    errors.push({
      code: 'missing_paragraph',
      severity: 'error',
      message: `Missing translation for ${id}`,
      paragraphId: id,
    });
  }

  const unknownParagraphIds = [...translatedSet].filter((id) => !sourceSet.has(id));

  const emptyParagraphIds = input.parsed.translations
    .filter((line) => !line.text.trim())
    .map((line) => line.paragraphId);

  // Out-of-order: among IDs that exist in both, relative order must match source
  let outOfOrder = false;
  const expectedOrder = sourceIds.filter((id) => translatedSet.has(id));
  const actualOrder = translatedOrder.filter((id) => sourceSet.has(id));
  const actualFirst: string[] = [];
  const seenOrder = new Set<string>();
  for (const id of actualOrder) {
    if (seenOrder.has(id)) continue;
    seenOrder.add(id);
    actualFirst.push(id);
  }
  if (
    expectedOrder.length === actualFirst.length &&
    expectedOrder.some((id, i) => id !== actualFirst[i])
  ) {
    outOfOrder = true;
    warnings.push({
      code: 'out_of_order',
      severity: 'warning',
      message: 'Translated paragraph IDs are out of source order',
    });
  }

  const languageAwareEnabled =
    input.sourceLanguage &&
    input.targetLanguage &&
    (input.sourceParagraphs?.length ?? 0) > 0;

  if (languageAwareEnabled) {
    const langQa = runLanguageAwareQa({
      parsed: input.parsed,
      sourceParagraphs: input.sourceParagraphs!,
      sourceLanguage: input.sourceLanguage!,
      targetLanguage: input.targetLanguage!,
      lockedTerms: input.lockedTerms,
      lockedAddressTerms: input.lockedAddressTerms,
    });
    errors.push(...langQa.errors);
    warnings.push(...langQa.warnings);
    infos.push(...langQa.infos);
  } else if (input.lockedTerms?.length && input.sourceParagraphs?.length) {
    checkLockedTermsLegacy(
      input.sourceParagraphs,
      input.parsed.translations,
      input.lockedTerms,
      errors,
    );
  }

  const verdict = resolveVerdict({
    errors,
    warnings,
    missingParagraphIds,
    parseNeedsRepair: input.parsed.status === 'needs_repair',
  });

  return {
    verdict,
    passed: verdict === 'PASS' || verdict === 'PASS_WITH_WARNINGS',
    errors,
    warnings,
    infos,
    missingParagraphIds,
    duplicateParagraphIds,
    unknownParagraphIds,
    emptyParagraphIds,
    corruptParagraphIds,
    outOfOrder,
  };
}

/** Legacy plain substring locked-term check when language pair unavailable. */
function checkLockedTermsLegacy(
  sources: SourceParagraphForQa[],
  translations: ParsedBatchResult['translations'],
  lockedTerms: LockedTermForQa[],
  errors: QaIssue[],
): void {
  const byId = new Map(translations.map((t) => [t.paragraphId, t.text]));

  for (const para of sources) {
    const translated = byId.get(para.paragraphId);
    if (translated === undefined) continue;

    for (const term of lockedTerms) {
      if (!para.sourceText.includes(term.source)) continue;

      if (!translated.includes(term.preferred)) {
        errors.push({
          code: 'locked_term_missing',
          severity: 'error',
          message: `Locked term "${term.source}" → expected "${term.preferred}" missing in ${para.paragraphId}`,
          paragraphId: para.paragraphId,
          termSource: term.source,
          expected: term.preferred,
        });
      }

      for (const forbidden of term.forbiddenVariants ?? []) {
        if (!forbidden || forbidden === term.preferred) continue;
        if (translated.includes(forbidden)) {
          errors.push({
            code: 'locked_term_forbidden_variant',
            severity: 'error',
            message: `Locked term "${term.source}": forbidden variant "${forbidden}" used in ${para.paragraphId}`,
            paragraphId: para.paragraphId,
            termSource: term.source,
            expected: term.preferred,
            found: forbidden,
          });
        }
      }
    }
  }
}

function resolveVerdict(input: {
  errors: QaIssue[];
  warnings: QaIssue[];
  missingParagraphIds: string[];
  parseNeedsRepair: boolean;
}): QaVerdict {
  if (input.parseNeedsRepair) {
    if (
      input.missingParagraphIds.length === 0 &&
      input.errors.some((e) => e.code === 'parse_uncertain')
    ) {
      return 'MANUAL_REVIEW';
    }
    return 'REPAIR_REQUIRED';
  }

  const hasMissing = input.missingParagraphIds.length > 0;
  const hasEmpty = input.errors.some((e) => e.code === 'empty_translation');
  const hasCorrupt = input.errors.some((e) => e.code === 'corrupt_translation');
  const hasDup = input.errors.some((e) => e.code === 'duplicate_paragraph');
  const hasUnknown = input.errors.some((e) => e.code === 'unknown_paragraph');
  const hasLocked = input.errors.some(
    (e) =>
      e.code === 'locked_term_missing' ||
      e.code === 'locked_term_forbidden_variant' ||
      e.code === 'edition_term_leak',
  );
  const hasWrongLanguage = input.errors.some((e) => e.code === 'target_language_mismatch');

  if (hasMissing || hasEmpty || hasCorrupt || hasWrongLanguage) {
    return 'REPAIR_REQUIRED';
  }

  if (hasDup || hasUnknown || hasLocked) {
    return 'MANUAL_REVIEW';
  }

  if (input.errors.length > 0) {
    return 'MANUAL_REVIEW';
  }

  if (input.warnings.length > 0) {
    return 'PASS_WITH_WARNINGS';
  }

  return 'PASS';
}

export type { LockedAddressTermForQa } from './qa-language-aware';
