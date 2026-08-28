import {
  DEFAULT_SOURCE_LANGUAGE,
  getLanguageProfile,
  hasLanguageProfile,
  normalizeLanguageCode,
  type LanguageProfile,
} from '@shared/constants/language-profile';
import type { SourceDetectionMethod } from '@shared/constants/source-language';
import type { LanguageDetectResponse } from '@shared/schemas/language-profile';
import type { SourceLanguageDetection } from '@shared/schemas/source-language';
import type { AiLanguageDetectFn } from './ai-language-detect';

const HIGH_CONFIDENCE = 0.72;
const MEDIUM_CONFIDENCE = 0.45;

export interface DetectLanguageInput {
  sampleText: string;
  /** User hint — NEVER used as detected language. */
  hintCode?: string | null;
  aiDetect?: AiLanguageDetectFn;
}

function countKana(text: string): number {
  let n = 0;
  for (const ch of text) {
    const code = ch.codePointAt(0);
    if (code == null) continue;
    if (
      (code >= 0x3040 && code <= 0x309f) ||
      (code >= 0x30a0 && code <= 0x30ff)
    ) {
      n += 1;
    }
  }
  return n;
}

function countHangul(text: string): number {
  let n = 0;
  for (const ch of text) {
    const code = ch.codePointAt(0);
    if (code == null) continue;
    if (
      (code >= 0xac00 && code <= 0xd7af) ||
      (code >= 0x1100 && code <= 0x11ff)
    ) {
      n += 1;
    }
  }
  return n;
}

function countHan(text: string): number {
  let n = 0;
  for (const ch of text) {
    const code = ch.codePointAt(0);
    if (code != null && code >= 0x4e00 && code <= 0x9fff) n += 1;
  }
  return n;
}

function countLatinLetters(text: string): number {
  return (text.match(/[A-Za-z]/g) ?? []).length;
}

function scoreScriptBuckets(text: string): Record<string, number> {
  const scores: Record<string, number> = {
    'zh-Hans': 0,
    'zh-Hant': 0,
    ja: 0,
    ko: 0,
    ru: 0,
    ar: 0,
    th: 0,
    vi: 0,
    en: 0,
    es: 0,
    fr: 0,
    de: 0,
    pt: 0,
    id: 0,
  };

  const kana = countKana(text);
  const hangul = countHangul(text);
  const han = countHan(text);
  const latin = countLatinLetters(text);

  if (hangul > 0) scores.ko += hangul * 4;
  if (kana > 0) {
    scores.ja += kana * 5;
    if (han > 0) scores.ja += Math.min(han, kana * 2);
  }

  const tradHits = (text.match(/[國語門東車馬龍風這會國發灣臺]/g) ?? []).length;
  const simpHits = (text.match(/[这会国发湾台]/g) ?? []).length;
  if (han > 0 && kana < 3 && hangul < 3) {
    if (tradHits > simpHits) {
      scores['zh-Hant'] += han * 2 + tradHits * 4;
    } else if (simpHits > tradHits) {
      scores['zh-Hans'] += han * 2 + simpHits * 4;
    } else {
      scores['zh-Hans'] += han * 2;
      scores.ja += Math.floor(han * 0.15);
    }
  }

  let total = 0;
  for (const ch of text) {
    const code = ch.codePointAt(0);
    if (code == null || code <= 0x20) continue;
    total += 1;

    if (code >= 0x0e00 && code <= 0x0e7f) scores.th += 3;
    if (code >= 0x0600 && code <= 0x06ff) scores.ar += 3;
    if (code >= 0x0400 && code <= 0x04ff) scores.ru += 3;
  }

  const lower = text.toLowerCase();
  const viHits = (lower.match(/[ăâêôơưđáàảãạéèẻẽẹíìỉĩịóòỏõọúùủũụýỳỷỹỵ]/gi) ?? []).length;
  if (viHits > 0) scores.vi += viHits * 2;

  const enHints = (lower.match(/\b(the|and|that|with|from|chapter|said)\b/g) ?? []).length;
  scores.en += enHints * 2;
  const esHints = (lower.match(/\b(el|la|los|las|que|capítulo)\b/g) ?? []).length;
  scores.es += esHints;
  const frHints = (lower.match(/\b(le|la|les|des|une|chapitre)\b/g) ?? []).length;
  scores.fr += frHints;
  const deHints = (lower.match(/\b(der|die|das|und|nicht|kapitel)\b/g) ?? []).length;
  scores.de += deHints;
  const ptHints = (lower.match(/\b(o|a|os|as|que|capítulo|não)\b/g) ?? []).length;
  scores.pt += Math.floor(ptHints / 2);
  const idHints = (lower.match(/\b(yang|dan|dari|untuk|bab)\b/g) ?? []).length;
  scores.id += idHints;

  if (latin > 30 && han < latin / 4 && kana < 5 && hangul < 5) {
    scores.en += latin * 0.15;
  }
  if (han > latin * 3 && kana < 3) {
    scores['zh-Hans'] += han * 0.5;
    scores.en = Math.max(0, scores.en - latin * 0.1);
  }

  if (total === 0 && latin === 0) {
    scores[DEFAULT_SOURCE_LANGUAGE] = 1;
  }

  return scores;
}

function pickBest(
  scores: Record<string, number>,
): { code: string; confidence: number } {
  let bestCode = DEFAULT_SOURCE_LANGUAGE;
  let best = -1;
  let second = -1;
  let sum = 0;
  for (const [code, score] of Object.entries(scores)) {
    sum += Math.max(0, score);
    if (score > best) {
      second = best;
      best = score;
      bestCode = code;
    } else if (score > second) {
      second = score;
    }
  }
  if (sum <= 0 || best <= 0) {
    return { code: DEFAULT_SOURCE_LANGUAGE, confidence: 0.2 };
  }
  const margin = best - Math.max(0, second);
  const raw = best / sum;
  const confidence = Math.min(0.98, raw * 0.75 + (margin / (best + 1)) * 0.4);
  return { code: bestCode, confidence };
}

function toProfileFields(code: string): {
  profile: LanguageProfile;
  profileMissing: boolean;
} {
  const normalized = normalizeLanguageCode(code);
  const profileMissing = !hasLanguageProfile(normalized);
  const profile = getLanguageProfile(normalized);
  return { profile, profileMissing };
}

function buildDetectionResult(params: {
  code: string;
  confidence: number;
  method: SourceDetectionMethod;
  hintCode: string | null;
  mixedLanguage?: boolean;
  secondaryLanguages?: string[];
}): SourceLanguageDetection {
  const { profile, profileMissing } = toProfileFields(params.code);
  const hintNorm = params.hintCode ? normalizeLanguageCode(params.hintCode) : null;
  const hintMismatch =
    hintNorm != null && hintNorm !== profile.code && hintNorm.toUpperCase() !== 'AUTO';

  return {
    detectedLanguage: profile.code,
    confidence: params.confidence,
    method: params.method,
    internationalName: profile.internationalName,
    nativeName: profile.nativeName,
    displayNameVi: profile.displayNameVi,
    displayNameNative: profile.displayNameNative,
    hintCode: hintNorm,
    hintMismatch,
    mixedLanguage: params.mixedLanguage ?? false,
    secondaryLanguages: params.secondaryLanguages ?? [],
    needsUserConfirm: params.confidence < HIGH_CONFIDENCE,
    profileMissing,
  };
}

export function detectLanguageHeuristic(sampleText: string): {
  code: string;
  confidence: number;
} {
  const sample = sampleText.trim();
  if (!sample) {
    return { code: DEFAULT_SOURCE_LANGUAGE, confidence: 0.15 };
  }
  return pickBest(scoreScriptBuckets(sample));
}

/**
 * Source-of-truth detection. User hint is compared but NEVER overrides detected language.
 */
export async function detectSourceLanguage(
  input: DetectLanguageInput,
): Promise<SourceLanguageDetection> {
  const sample = input.sampleText.trim();
  const hintCode =
    input.hintCode && input.hintCode.toUpperCase() !== 'AUTO'
      ? normalizeLanguageCode(input.hintCode)
      : null;

  if (!sample) {
    return buildDetectionResult({
      code: DEFAULT_SOURCE_LANGUAGE,
      confidence: 0.15,
      method: 'FALLBACK',
      hintCode,
    });
  }

  const local = detectLanguageHeuristic(sample);
  let detectedCode = local.code;
  let confidence = local.confidence;
  let method: SourceDetectionMethod = 'LOCAL';
  let mixedLanguage = false;
  let secondaryLanguages: string[] = [];

  if (local.confidence < HIGH_CONFIDENCE && input.aiDetect) {
    try {
      const ai = await input.aiDetect(sample);
      if (ai && ai.confidence >= MEDIUM_CONFIDENCE) {
        const aiCode = normalizeLanguageCode(ai.code);
        if (aiCode === local.code && local.confidence >= MEDIUM_CONFIDENCE) {
          method = 'HYBRID';
          confidence = Math.min(0.98, (local.confidence + ai.confidence) / 2 + 0.1);
        } else {
          method = 'AI';
          detectedCode = aiCode;
          confidence = Math.min(0.98, ai.confidence);
        }
        mixedLanguage = ai.mixedLanguage ?? false;
        secondaryLanguages = ai.secondaryLanguages ?? [];
      }
    } catch {
      // fall through to local
    }
  }

  if (method === 'LOCAL' && confidence < MEDIUM_CONFIDENCE) {
    method = 'FALLBACK';
    confidence = Math.max(0.2, confidence);
  }

  return buildDetectionResult({
    code: detectedCode,
    confidence,
    method,
    hintCode,
    mixedLanguage,
    secondaryLanguages,
  });
}

function toLegacyResponse(
  detection: SourceLanguageDetection,
): LanguageDetectResponse {
  return {
    code: detection.detectedLanguage,
    internationalName: detection.internationalName,
    nativeName: detection.nativeName,
    displayNameVi: detection.displayNameVi,
    displayNameNative: detection.displayNameNative,
    confidence: detection.confidence,
    method:
      detection.method === 'LOCAL'
        ? 'heuristic'
        : detection.method === 'AI'
          ? 'ai'
          : detection.method === 'HYBRID'
            ? 'ai'
            : 'fallback',
    needsUserConfirm: detection.needsUserConfirm,
    hintMismatch: detection.hintMismatch,
    hintCode: detection.hintCode,
    mixedLanguage: detection.mixedLanguage,
    secondaryLanguages: detection.secondaryLanguages,
  };
}

/** @deprecated Prefer detectSourceLanguage — kept for IPC backward compat. */
export async function detectLanguage(
  input: DetectLanguageInput,
): Promise<LanguageDetectResponse> {
  const result = await detectSourceLanguage(input);
  return toLegacyResponse(result);
}

/**
 * Resolve create-time source language from sample.
 * Always returns detected language — never the hint alone.
 */
export async function resolveSourceLanguageInput(input: {
  sourceLanguage: string;
  sampleText?: string | null;
  hintCode?: string | null;
  aiDetect?: DetectLanguageInput['aiDetect'];
}): Promise<{
  code: string;
  detection: SourceLanguageDetection;
}> {
  const raw = input.sourceLanguage.trim();
  const hint =
    input.hintCode ??
    (raw.toUpperCase() !== 'AUTO' ? raw : null);

  const detection = await detectSourceLanguage({
    sampleText: input.sampleText ?? '',
    hintCode: hint,
    aiDetect: input.aiDetect,
  });

  return { code: detection.detectedLanguage, detection };
}
