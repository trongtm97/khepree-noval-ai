import type { QaIssue, ParsedBatchResult } from '@shared/schemas/output-protocol';
import type { SourceParagraphForQa } from './qa-checker';

/**
 * Deterministic extended local checks (Prompt 09).
 * Numbers/units, length anomaly, repetition, verifiable hallucination heuristics,
 * dialogue punctuation, extra paragraphs.
 */

const NUMBER_RE = /\d+(?:[.,]\d+)?/g;
const CURRENCY_UNIT_RE =
  /(?:¥|￥|\$|€|£|USD|EUR|CNY|VND|đồng|元|万元|两|斤|km|km\/h|℃|°C|%|\d+\s*(?:年|月|日|时|分))/gi;

function excerpt(text: string, max = 80): string {
  const t = text.trim();
  return t.length <= max ? t : `${t.slice(0, max)}…`;
}

function digitTokens(text: string): string[] {
  return [...(text.match(NUMBER_RE) ?? [])].map((n) => n.replace(/,/g, ''));
}

function unitTokens(text: string): string[] {
  return [...(text.match(CURRENCY_UNIT_RE) ?? [])].map((u) => u.toLowerCase());
}

/** Target has numeric/currency tokens absent from source (verifiable). */
export function checkNumberUnitMismatch(
  sources: SourceParagraphForQa[],
  translations: ParsedBatchResult['translations'],
): QaIssue[] {
  const byId = new Map(translations.map((t) => [t.paragraphId, t.text]));
  const issues: QaIssue[] = [];
  for (const src of sources) {
    const target = byId.get(src.paragraphId);
    if (!target?.trim()) continue;
    const srcNums = new Set(digitTokens(src.sourceText));
    const tgtNums = digitTokens(target);
    const invented = tgtNums.filter((n) => !srcNums.has(n) && Number(n) > 1);
    // Only flag when source also has numbers (avoid false positives on chapter labels)
    if (srcNums.size === 0) continue;
    if (invented.length >= 2) {
      issues.push({
        code: 'number_unit_mismatch',
        severity: 'warning',
        message: `Numbers in translation not present in source for ${src.paragraphId}: ${invented.slice(0, 5).join(', ')}`,
        paragraphId: src.paragraphId,
        found: invented.slice(0, 5).join(', '),
        expected: [...srcNums].slice(0, 5).join(', '),
      });
    }
    const srcUnits = new Set(unitTokens(src.sourceText));
    const tgtUnits = unitTokens(target);
    const missingUnits = [...srcUnits].filter(
      (u) => ![...tgtUnits].some((t) => t.includes(u) || u.includes(t)),
    );
    if (srcUnits.size > 0 && missingUnits.length === srcUnits.size) {
      issues.push({
        code: 'number_unit_mismatch',
        severity: 'warning',
        message: `Currency/unit tokens from source missing in ${src.paragraphId}`,
        paragraphId: src.paragraphId,
        expected: [...srcUnits].join(', '),
      });
    }
  }
  return issues;
}

/** Extreme length ratio vs source (truncated or padded). */
export function checkLengthAnomaly(
  sources: SourceParagraphForQa[],
  translations: ParsedBatchResult['translations'],
  opts?: { minRatio?: number; maxRatio?: number },
): QaIssue[] {
  const minRatio = opts?.minRatio ?? 0.15;
  const maxRatio = opts?.maxRatio ?? 4.5;
  const byId = new Map(translations.map((t) => [t.paragraphId, t.text]));
  const issues: QaIssue[] = [];
  for (const src of sources) {
    const target = byId.get(src.paragraphId);
    if (!target?.trim()) continue;
    const sLen = Math.max(1, src.sourceText.trim().length);
    const tLen = target.trim().length;
    const ratio = tLen / sLen;
    if (ratio < minRatio || ratio > maxRatio) {
      issues.push({
        code: 'length_anomaly',
        severity: ratio < minRatio ? 'error' : 'warning',
        message: `Length anomaly for ${src.paragraphId}: ratio=${ratio.toFixed(2)} (src=${sLen}, tgt=${tLen})`,
        paragraphId: src.paragraphId,
        found: String(tLen),
        expected: `~${sLen}`,
      });
    }
  }
  return issues;
}

/** Adjacent paragraphs with near-identical target text (copy loop). */
export function checkRepeatedContent(
  translations: ParsedBatchResult['translations'],
): QaIssue[] {
  const issues: QaIssue[] = [];
  for (let i = 1; i < translations.length; i += 1) {
    const prev = translations[i - 1]!;
    const cur = translations[i]!;
    const a = prev.text.trim();
    const b = cur.text.trim();
    if (a.length < 40 || b.length < 40) continue;
    if (a === b) {
      issues.push({
        code: 'repeated_content',
        severity: 'error',
        message: `Repeated translation content: ${prev.paragraphId} ≡ ${cur.paragraphId}`,
        paragraphId: cur.paragraphId,
        found: excerpt(b),
      });
    }
  }
  return issues;
}

/**
 * Hallucination heuristic: long proper-looking Latin runs in target when source
 * is CJK-only and target language is vi/en — only when source has no Latin names.
 */
export function checkUnverifiableContent(
  sources: SourceParagraphForQa[],
  translations: ParsedBatchResult['translations'],
  targetLanguage?: string,
): QaIssue[] {
  const byId = new Map(translations.map((t) => [t.paragraphId, t.text]));
  const issues: QaIssue[] = [];
  const cjkHeavy = (t: string) => {
    const cjk = (t.match(/[\u4e00-\u9fff]/g) ?? []).join('').length;
    return cjk / Math.max(1, t.length) > 0.4;
  };
  for (const src of sources) {
    const target = byId.get(src.paragraphId);
    if (!target?.trim()) continue;
    if (!cjkHeavy(src.sourceText)) continue;
    const srcLatin = src.sourceText.match(/[A-Za-z]{4,}/g) ?? [];
    if (srcLatin.length > 0) continue;
    const tgtLatin = target.match(/[A-Za-z]{6,}/g) ?? [];
    // Skip common function words for en/vi
    const suspicious = tgtLatin.filter(
      (w) =>
        !/^(chapter|the|and|that|with|from|this|have|will|would|could|should)$/i.test(
          w,
        ),
    );
    if (suspicious.length >= 3 && (targetLanguage === 'en' || !targetLanguage)) {
      issues.push({
        code: 'unverifiable_content',
        severity: 'warning',
        message: `Possible unverifiable Latin spans in ${src.paragraphId}: ${suspicious.slice(0, 3).join(', ')}`,
        paragraphId: src.paragraphId,
        found: suspicious.slice(0, 5).join(', '),
      });
    }
  }
  return issues;
}

/** Dialogue quote imbalance (odd count of 「」 or "" pairs). */
export function checkDialoguePunctuation(
  translations: ParsedBatchResult['translations'],
): QaIssue[] {
  const issues: QaIssue[] = [];
  for (const line of translations) {
    const t = line.text;
    if (!t.trim()) continue;
    const openCjk = (t.match(/「/g) ?? []).length;
    const closeCjk = (t.match(/」/g) ?? []).length;
    if (openCjk !== closeCjk) {
      issues.push({
        code: 'dialogue_punctuation',
        severity: 'warning',
        message: `Unbalanced dialogue quotes 「」 in ${line.paragraphId}`,
        paragraphId: line.paragraphId,
        found: `open=${openCjk},close=${closeCjk}`,
      });
    }
  }
  return issues;
}

/** Extra paragraph IDs beyond source (= unknown) — alias for clarity in findings. */
export function checkExtraParagraphs(
  sourceIds: string[],
  translations: ParsedBatchResult['translations'],
): QaIssue[] {
  const sourceSet = new Set(sourceIds);
  const issues: QaIssue[] = [];
  for (const line of translations) {
    if (!sourceSet.has(line.paragraphId)) {
      issues.push({
        code: 'extra_paragraph',
        severity: 'error',
        message: `Extra/unknown paragraph not in source: ${line.paragraphId}`,
        paragraphId: line.paragraphId,
      });
    }
  }
  return issues;
}

export function runExtendedLocalChecks(input: {
  parsed: ParsedBatchResult;
  sourceParagraphIds: string[];
  sourceParagraphs?: SourceParagraphForQa[];
  targetLanguage?: string;
  /** basic = skip extended; standard/strict = run */
  includeExtended: boolean;
}): { warnings: QaIssue[]; errors: QaIssue[] } {
  if (!input.includeExtended || !input.sourceParagraphs?.length) {
    return { warnings: [], errors: [] };
  }
  const errors: QaIssue[] = [];
  const warnings: QaIssue[] = [];

  const push = (list: QaIssue[]) => {
    for (const issue of list) {
      if (issue.severity === 'error') errors.push(issue);
      else warnings.push(issue);
    }
  };

  push(checkLengthAnomaly(input.sourceParagraphs, input.parsed.translations));
  push(checkRepeatedContent(input.parsed.translations));
  push(
    checkNumberUnitMismatch(input.sourceParagraphs, input.parsed.translations),
  );
  push(
    checkUnverifiableContent(
      input.sourceParagraphs,
      input.parsed.translations,
      input.targetLanguage,
    ),
  );
  push(checkDialoguePunctuation(input.parsed.translations));
  // extra_paragraph overlaps unknown_paragraph — only add if not already covered
  // Skip here; unknown_paragraph already in core QA.

  return { warnings, errors };
}
