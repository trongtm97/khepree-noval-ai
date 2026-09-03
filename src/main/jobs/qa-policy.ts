import type { QaIssue, QaResult } from '@shared/schemas/output-protocol';
import type { RepairReason } from '@shared/constants/job';
import type {
  TranslationRecipeQaLevel,
  TranslationRecipeRepairScope,
} from '@shared/constants/translation-recipes';
import {
  isRepairReasonAllowed,
  QA_SCORE_COMPONENTS,
  scoreComponentForCode,
  type QaScoreComponentKey,
} from '@shared/constants/translation-qa-findings';
import type { QaScoreBreakdown } from '@shared/schemas/translation-qa-findings';
import { runExtendedLocalChecks } from './extended-local-checks';
import {
  runLocalQa,
  type QaCheckerInput,
} from './qa-checker';

/** Codes promoted from warning → error under strict qaLevel. */
const STRICT_PROMOTE = new Set([
  'source_leakage',
  'address_inconsistency',
  'length_anomaly',
  'number_unit_mismatch',
  'unverifiable_content',
  'dialogue_punctuation',
  'out_of_order',
]);

/**
 * Local QA with recipe qaLevel:
 * - basic: structural only (no language-aware, no extended)
 * - standard: current + extended checks
 * - strict: standard + promote selected warnings to errors
 */
export function runLocalQaWithPolicy(
  input: QaCheckerInput & { qaLevel?: TranslationRecipeQaLevel },
): QaResult {
  const level = input.qaLevel ?? 'standard';
  const baseInput: QaCheckerInput = {
    ...input,
    sourceLanguage: level === 'basic' ? undefined : input.sourceLanguage,
    targetLanguage: level === 'basic' ? undefined : input.targetLanguage,
  };
  let qa = runLocalQa(baseInput);

  if (level !== 'basic') {
    const ext = runExtendedLocalChecks({
      parsed: input.parsed,
      sourceParagraphIds: input.sourceParagraphIds,
      sourceParagraphs: input.sourceParagraphs,
      targetLanguage: input.targetLanguage,
      includeExtended: true,
    });
    qa = {
      ...qa,
      errors: [...qa.errors, ...ext.errors],
      warnings: [...qa.warnings, ...ext.warnings],
      passed: false, // recompute below
      verdict: qa.verdict,
    };
  }

  if (level === 'strict') {
    const promoted: QaIssue[] = [];
    const remainWarn: QaIssue[] = [];
    for (const w of qa.warnings) {
      if (STRICT_PROMOTE.has(w.code)) {
        promoted.push({ ...w, severity: 'error' });
      } else {
        remainWarn.push(w);
      }
    }
    qa = {
      ...qa,
      errors: [...qa.errors, ...promoted],
      warnings: remainWarn,
    };
  }

  // Recompute verdict lightly from error presence
  const hasBlocking = qa.errors.some((e) =>
    [
      'missing_paragraph',
      'empty_translation',
      'corrupt_translation',
      'target_language_mismatch',
      'length_anomaly',
    ].includes(e.code),
  );
  const hasManual = qa.errors.length > 0 && !hasBlocking;
  let verdict = qa.verdict;
  if (hasBlocking) verdict = 'REPAIR_REQUIRED';
  else if (hasManual) verdict = 'MANUAL_REVIEW';
  else if (qa.warnings.length > 0) verdict = 'PASS_WITH_WARNINGS';
  else verdict = 'PASS';

  return {
    ...qa,
    verdict,
    passed: verdict === 'PASS' || verdict === 'PASS_WITH_WARNINGS',
  };
}

export function filterQaByRepairScope(
  reason: RepairReason | null,
  scope: TranslationRecipeRepairScope,
): { allowed: boolean; blockedReason: RepairReason | null } {
  if (!reason) return { allowed: false, blockedReason: null };
  if (!isRepairReasonAllowed(scope, reason)) {
    return { allowed: false, blockedReason: reason };
  }
  return { allowed: true, blockedReason: null };
}

/** Strip issues matching dismissed fingerprints (code+paragraphId+termSource). */
export function filterDismissedIssues(
  qa: QaResult,
  dismissedKeys: Set<string>,
): QaResult {
  const keep = (issue: QaIssue) => {
    const key = findingDismissKey(
      issue.code,
      issue.paragraphId,
      issue.termSource,
    );
    return !dismissedKeys.has(key);
  };
  const errors = qa.errors.filter(keep);
  const warnings = qa.warnings.filter(keep);
  const infos = (qa.infos ?? []).filter(keep);
  const missingParagraphIds = qa.missingParagraphIds.filter(
    (id) => !dismissedKeys.has(findingDismissKey('missing_paragraph', id)),
  );
  const emptyParagraphIds = qa.emptyParagraphIds.filter(
    (id) => !dismissedKeys.has(findingDismissKey('empty_translation', id)),
  );
  const corruptParagraphIds = qa.corruptParagraphIds.filter(
    (id) => !dismissedKeys.has(findingDismissKey('corrupt_translation', id)),
  );

  const hasBlocking =
    missingParagraphIds.length > 0 ||
    emptyParagraphIds.length > 0 ||
    corruptParagraphIds.length > 0 ||
    errors.some((e) => e.code === 'target_language_mismatch');

  let verdict = qa.verdict;
  if (errors.length === 0 && warnings.length === 0) {
    verdict = 'PASS';
  } else if (errors.length === 0 && warnings.length > 0) {
    verdict = 'PASS_WITH_WARNINGS';
  } else if (hasBlocking) {
    verdict = 'REPAIR_REQUIRED';
  } else {
    verdict = 'MANUAL_REVIEW';
  }

  return {
    ...qa,
    errors,
    warnings,
    infos,
    missingParagraphIds,
    emptyParagraphIds,
    corruptParagraphIds,
    verdict,
    passed: verdict === 'PASS' || verdict === 'PASS_WITH_WARNINGS',
  };
}

export function findingDismissKey(
  code: string,
  paragraphId?: string | null,
  termSource?: string | null,
): string {
  return `${code}|${paragraphId ?? ''}|${termSource ?? ''}`;
}

/** Transparent composite score from findings. */
export function computeQaScoreBreakdown(qa: QaResult): QaScoreBreakdown {
  const all = [...qa.errors, ...qa.warnings];
  const counts: Record<QaScoreComponentKey, number> = {
    structure: 0,
    glossary: 0,
    language: 0,
    fidelity: 0,
  };
  for (const issue of all) {
    const c = scoreComponentForCode(issue.code);
    if (c) counts[c] += 1;
  }

  const components: QaScoreBreakdown['components'] = {};
  let composite = 0;
  const weights: Record<string, number> = {};
  for (const [key, meta] of Object.entries(QA_SCORE_COMPONENTS) as [
    QaScoreComponentKey,
    (typeof QA_SCORE_COMPONENTS)[QaScoreComponentKey],
  ][]) {
    const issueCount = counts[key];
    // passRatio: 1 if no issues, else decays with issue count (public formula)
    const passRatio = issueCount === 0 ? 1 : Math.max(0, 1 - issueCount * 0.25);
    components[key] = {
      weight: meta.weight,
      label: meta.label,
      passRatio,
      issueCount,
    };
    weights[key] = meta.weight;
    composite += meta.weight * passRatio;
  }

  return {
    components,
    composite: Math.round(composite * 1000) / 1000,
    formula: 'sum(weight_i * passRatio_i)',
    weights,
  };
}
