import { getLanguageProfile } from '@shared/constants/language-profile';
import type { QaIssue } from '@shared/schemas/output-protocol';
import type { LanguageProfile } from '@shared/constants/language-profile';
import {
  computeScriptHistogram,
  foreignScriptRatio,
  scriptTagToBuckets,
  CJK_SOURCE_RUN_RE,
  URL_RE,
  type ScriptBucket,
} from '@shared/utils/unicode-script';
import {
  defaultTermMatchOptions,
  normalizeForTermMatch,
  profilesShareLatinScript,
  termAppearsInText,
} from './qa-term-match';
import type { LockedTermForQa, SourceParagraphForQa } from './qa-checker';
import type { ParsedBatchResult } from '@shared/schemas/output-protocol';

export interface LockedAddressTermForQa {
  speakerSourceName: string;
  addresseeSourceName: string;
  expectedForm: string;
  locked: boolean;
}

export interface LanguageAwareQaInput {
  parsed: ParsedBatchResult;
  sourceParagraphs: SourceParagraphForQa[];
  sourceLanguage: string;
  targetLanguage: string;
  lockedTerms?: LockedTermForQa[];
  lockedAddressTerms?: LockedAddressTermForQa[];
}

const FOREIGN_ERROR_THRESHOLD_LATN = 0.42;
const FOREIGN_WARNING_THRESHOLD_LATN = 0.22;
const FOREIGN_ERROR_THRESHOLD_SCRIPT = 0.48;
const FOREIGN_WARNING_THRESHOLD_SCRIPT = 0.26;

const CJK_LEAK_MIN_RUN = 4;
const LATIN_LEAK_OVERLAP = 0.82;
const LATIN_LEAK_MIN_WORDS = 6;

export function runLanguageAwareQa(input: LanguageAwareQaInput): {
  errors: QaIssue[];
  warnings: QaIssue[];
  infos: QaIssue[];
} {
  const errors: QaIssue[] = [];
  const warnings: QaIssue[] = [];
  const infos: QaIssue[] = [];

  const sourceProfile = getLanguageProfile(input.sourceLanguage);
  const targetProfile = getLanguageProfile(input.targetLanguage);
  const expectedBuckets = scriptTagToBuckets(targetProfile.script);
  const termMatchOpts = defaultTermMatchOptions(input.targetLanguage);

  const byId = new Map(input.parsed.translations.map((t) => [t.paragraphId, t.text]));
  const sampleText = input.parsed.translations.map((t) => t.text).join('\n');
  const batchHist = computeScriptHistogram(sampleText);
  const foreignRatio = foreignScriptRatio(batchHist, expectedBuckets);

  const errorThreshold = targetProfile.script === 'Latn'
    ? FOREIGN_ERROR_THRESHOLD_LATN
    : FOREIGN_ERROR_THRESHOLD_SCRIPT;
  const warnThreshold = targetProfile.script === 'Latn'
    ? FOREIGN_WARNING_THRESHOLD_LATN
    : FOREIGN_WARNING_THRESHOLD_SCRIPT;

  if (foreignRatio >= errorThreshold) {
    errors.push({
      code: 'target_language_mismatch',
      severity: 'error',
      message: `Output script mix unlikely for target ${input.targetLanguage} (foreign script ~${Math.round(foreignRatio * 100)}%)`,
      found: formatDominantForeign(batchHist, expectedBuckets),
    });
  } else if (foreignRatio >= warnThreshold) {
    warnings.push({
      code: 'target_language_mismatch',
      severity: 'warning',
      message: `Possible wrong-script output for target ${input.targetLanguage} (foreign script ~${Math.round(foreignRatio * 100)}%)`,
      found: formatDominantForeign(batchHist, expectedBuckets),
    });
  }

  const skipLeakSources = buildLeakSkipTerms(input.lockedTerms);

  for (const para of input.sourceParagraphs) {
    const translated = byId.get(para.paragraphId);
    if (!translated?.trim()) continue;

    const paraHist = computeScriptHistogram(translated);
    const paraForeign = foreignScriptRatio(paraHist, expectedBuckets);
    if (paraForeign >= errorThreshold + 0.05) {
      errors.push({
        code: 'target_language_mismatch',
        severity: 'error',
        message: `Paragraph ${para.paragraphId}: script unlikely for target ${input.targetLanguage}`,
        paragraphId: para.paragraphId,
        found: formatDominantForeign(paraHist, expectedBuckets),
      });
    }

    if (detectSourceLeakage(para.sourceText, translated, sourceProfile, targetProfile, skipLeakSources)) {
      warnings.push({
        code: 'source_leakage',
        severity: 'warning',
        message: `Possible untranslated source carry-over in ${para.paragraphId}`,
        paragraphId: para.paragraphId,
      });
    }

    if (detectPunctuationMismatch(translated, targetProfile)) {
      warnings.push({
        code: 'punctuation_style',
        severity: 'warning',
        message: `Punctuation style may not match target profile in ${para.paragraphId}`,
        paragraphId: para.paragraphId,
      });
    }
  }

  if (input.lockedTerms?.length) {
    checkNormalizedLockedTerms(
      input.sourceParagraphs,
      input.parsed.translations,
      input.lockedTerms,
      termMatchOpts,
      errors,
    );
  }

  if (input.lockedAddressTerms?.length) {
    checkLockedAddressTerms(
      input.sourceParagraphs,
      input.parsed.translations,
      input.lockedAddressTerms,
      termMatchOpts,
      warnings,
    );
  }

  return { errors, warnings, infos };
}

function formatDominantForeign(
  hist: Map<ScriptBucket, number>,
  expected: ScriptBucket[],
): string {
  const parts: string[] = [];
  for (const [bucket, count] of hist) {
    if (count > 0 && !expected.includes(bucket) && bucket !== 'Other') {
      parts.push(`${bucket}:${count}`);
    }
  }
  return parts.join(', ') || 'unknown';
}

function buildLeakSkipTerms(lockedTerms?: LockedTermForQa[]): string[] {
  const skip: string[] = [];
  for (const term of lockedTerms ?? []) {
    skip.push(term.source);
    skip.push(term.preferred);
    for (const v of term.forbiddenVariants ?? []) skip.push(v);
    for (const v of term.crossEditionForbidden ?? []) skip.push(v);
  }
  return skip;
}

function detectSourceLeakage(
  sourceText: string,
  translated: string,
  sourceProfile: LanguageProfile,
  targetProfile: LanguageProfile,
  skipTerms: string[],
): boolean {
  const src = sourceText.trim();
  const tgt = translated.trim();
  if (!src || !tgt) return false;

  if (isMostlyCjkSource(sourceProfile)) {
    return detectCjkRunLeakage(src, tgt, skipTerms);
  }

  if (profilesShareLatinScript(sourceProfile, targetProfile)) {
    return detectLatinOverlapLeakage(src, tgt, skipTerms);
  }

  return detectCjkRunLeakage(src, tgt, skipTerms) || detectLatinOverlapLeakage(src, tgt, skipTerms);
}

function isMostlyCjkSource(profile: LanguageProfile): boolean {
  return profile.script === 'Hans' || profile.script === 'Hant' || profile.script === 'Jpan' || profile.script === 'Kore';
}

function detectCjkRunLeakage(source: string, target: string, skipTerms: string[]): boolean {
  const runs = source.match(CJK_SOURCE_RUN_RE) ?? [];
  for (const run of runs) {
    if (run.length < CJK_LEAK_MIN_RUN) continue;
    if (skipTerms.some((s) => s.includes(run))) continue;
    if (/^\d+$/.test(run)) continue;
    if (target.includes(run)) return true;
  }
  return false;
}

function detectLatinOverlapLeakage(source: string, target: string, skipTerms: string[]): boolean {
  const normSrc = normalizeForTermMatch(source, { caseInsensitive: true });
  const normTgt = normalizeForTermMatch(target, { caseInsensitive: true });
  if (normSrc.length < 24) return false;

  const srcWords = normSrc.split(/\s+/).filter((w) => w.length > 1);
  if (srcWords.length < LATIN_LEAK_MIN_WORDS) return false;

  for (const skip of skipTerms) {
    const n = normalizeForTermMatch(skip, { caseInsensitive: true });
    if (n && normSrc.includes(n)) {
      // locked term overlap expected — compare without that substring
      const idx = normSrc.indexOf(n);
      if (idx >= 0) {
        const reduced =
          normSrc.slice(0, idx) + normSrc.slice(idx + n.length);
        if (reduced.split(/\s+/).filter(Boolean).length < LATIN_LEAK_MIN_WORDS) {
          return false;
        }
      }
    }
  }

  const tgtWords = new Set(normTgt.split(/\s+/).filter(Boolean));
  let hits = 0;
  for (const w of srcWords) {
    if (tgtWords.has(w)) hits += 1;
  }
  const ratio = hits / srcWords.length;
  if (ratio >= LATIN_LEAK_OVERLAP && !URL_RE.test(source)) {
    return true;
  }
  return false;
}

function detectPunctuationMismatch(text: string, targetProfile: LanguageProfile): boolean {
  if (text.length < 40) return false;

  const cjkPeriods = (text.match(/。/g) ?? []).length;
  const asciiEnds = (text.match(/(?<![0-9])[.!?](?!\d)/g) ?? []).length;
  const arabicComma = (text.match(/،/g) ?? []).length;

  if (targetProfile.punctuationProfile === 'western') {
    return cjkPeriods >= 2 && cjkPeriods > asciiEnds;
  }
  if (targetProfile.punctuationProfile === 'cjk') {
    return asciiEnds >= 3 && asciiEnds > cjkPeriods + 1;
  }
  if (targetProfile.punctuationProfile === 'arabic') {
    return cjkPeriods >= 2;
  }

  return cjkPeriods >= 2;

  return arabicComma >= 3 && targetProfile.script !== 'Arab';
}

function checkNormalizedLockedTerms(
  sources: SourceParagraphForQa[],
  translations: ParsedBatchResult['translations'],
  lockedTerms: LockedTermForQa[],
  matchOpts: ReturnType<typeof defaultTermMatchOptions>,
  errors: QaIssue[],
): void {
  const byId = new Map(translations.map((t) => [t.paragraphId, t.text]));

  for (const para of sources) {
    const translated = byId.get(para.paragraphId);
    if (translated === undefined) continue;

    for (const term of lockedTerms) {
      if (!para.sourceText.includes(term.source)) continue;

      const preferredPresent = termAppearsInText(translated, term.preferred, matchOpts);
      if (!preferredPresent) {
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
        if (termAppearsInText(translated, forbidden, matchOpts)) {
          errors.push({
            code: 'locked_term_forbidden_variant',
            severity: 'error',
            message: `Locked term "${term.source}": forbidden variant "${forbidden}" in ${para.paragraphId}`,
            paragraphId: para.paragraphId,
            termSource: term.source,
            expected: term.preferred,
            found: forbidden,
          });
        }
      }

      for (const forbidden of term.crossEditionForbidden ?? []) {
        if (!forbidden || forbidden === term.preferred) continue;
        if (termAppearsInText(translated, forbidden, matchOpts)) {
          errors.push({
            code: 'edition_term_leak',
            severity: 'error',
            message: `Edition leak for "${term.source}": other-edition form "${forbidden}" in ${para.paragraphId}`,
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

function checkLockedAddressTerms(
  sources: SourceParagraphForQa[],
  translations: ParsedBatchResult['translations'],
  addressTerms: LockedAddressTermForQa[],
  matchOpts: ReturnType<typeof defaultTermMatchOptions>,
  warnings: QaIssue[],
): void {
  const byId = new Map(translations.map((t) => [t.paragraphId, t.text]));

  for (const para of sources) {
    const translated = byId.get(para.paragraphId);
    if (translated === undefined) continue;

    for (const addr of addressTerms) {
      if (!addr.locked) continue;
      const speakerPresent = para.sourceText.includes(addr.speakerSourceName);
      const addresseePresent = para.sourceText.includes(addr.addresseeSourceName);
      if (!speakerPresent || !addresseePresent) continue;

      if (!termAppearsInText(translated, addr.expectedForm, matchOpts)) {
        warnings.push({
          code: 'address_inconsistency',
          severity: 'warning',
          message: `Locked address form "${addr.expectedForm}" expected in ${para.paragraphId}`,
          paragraphId: para.paragraphId,
          expected: addr.expectedForm,
        });
      }
    }
  }
}
