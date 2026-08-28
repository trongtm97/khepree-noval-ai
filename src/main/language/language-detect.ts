import {
  DEFAULT_SOURCE_LANGUAGE,
  getLanguageProfile,
  hasLanguageProfile,
  LANGUAGE_AUTO,
  normalizeLanguageCode,
  type LanguageProfile,
} from '@shared/constants/language-profile';
import type { SourceDetectionMethod } from '@shared/constants/source-language';
import type { LanguageDetectResponse } from '@shared/schemas/language-profile';
import type { SourceLanguageDetection } from '@shared/schemas/source-language';
import type { AiLanguageDetectFn } from './ai-language-detect';
import { scoreLexicalEvidence } from './language-lexical';
import { detectScript } from './script-detect';

/** High confidence is allowed only when evidence identifies a LANGUAGE, not a script. */
export const LANGUAGE_HIGH_CONFIDENCE = 0.72;
const HIGH_CONFIDENCE = LANGUAGE_HIGH_CONFIDENCE;
const MEDIUM_CONFIDENCE = 0.45;
/** Script-only guesses stay below HIGH so AI fallback always runs. */
export const SCRIPT_ONLY_MAX_CONFIDENCE = 0.61;
const MIN_UNIQUE_SCRIPT_LETTERS = 8;

const SCRIPT_FAMILY_FALLBACK: Record<string, string> = {
  Cyrl: 'ru',
  Arab: 'ar',
  Latn: 'en',
  Hebr: 'he',
  Deva: 'hi',
  Beng: 'bn',
  Ethi: 'am',
  Hani: 'zh-Hans',
};

export interface DetectLanguageInput {
  sampleText: string;
  /** User hint — NEVER used as detected language. */
  hintCode?: string | null;
  aiDetect?: AiLanguageDetectFn;
}

export interface LocalLanguageDetection {
  code: string;
  confidence: number;
  script: string;
  /** True when evidence identifies a language, not merely a script. */
  languageSpecific: boolean;
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

function addScore(scores: Record<string, number>, code: string, amount: number): void {
  if (amount <= 0) return;
  scores[code] = (scores[code] ?? 0) + amount;
}

function scoreChineseVariant(text: string, han: number, kana: number, hangul: number): {
  scores: Record<string, number>;
  languageSpecific: boolean;
} {
  const scores: Record<string, number> = {};
  if (han <= 0 || kana >= 3 || hangul >= 3) {
    return { scores, languageSpecific: false };
  }
  const tradHits = (text.match(/[國語門東車馬龍風這會國發灣臺]/g) ?? []).length;
  const simpHits = (text.match(/[这会国发湾台]/g) ?? []).length;
  if (tradHits > simpHits) {
    addScore(scores, 'zh-Hant', han * 2 + tradHits * 4);
  } else if (simpHits > tradHits) {
    addScore(scores, 'zh-Hans', han * 2 + simpHits * 4);
  } else {
    addScore(scores, 'zh-Hans', han * 2);
  }
  return { scores, languageSpecific: true };
}

function registeredCode(raw: string): string | null {
  const normalized = normalizeLanguageCode(raw);
  if (normalized === LANGUAGE_AUTO) return null;
  if (!hasLanguageProfile(normalized)) return null;
  return normalized;
}

export function detectLanguageHeuristic(sampleText: string): LocalLanguageDetection {
  const sample = sampleText.trim();
  if (!sample) {
    return {
      code: DEFAULT_SOURCE_LANGUAGE,
      confidence: 0.15,
      script: 'Latn',
      languageSpecific: false,
    };
  }

  const script = detectScript(sample);
  const lexical = scoreLexicalEvidence(sample);
  const kana = script.counts.Hira + script.counts.Kana;
  const hangul = script.counts.Hang;
  const han = script.counts.Hani;
  const scores: Record<string, number> = {};
  let languageSpecific = false;

  if (hangul >= 3) {
    addScore(scores, 'ko', hangul * 4);
    languageSpecific = true;
  }
  if (kana >= 3 || (kana >= 1 && han >= 1)) {
    addScore(scores, 'ja', kana * 5 + Math.min(han, kana * 2));
    languageSpecific = true;
  }

  const chinese = scoreChineseVariant(sample, han, kana, hangul);
  for (const [code, score] of Object.entries(chinese.scores)) addScore(scores, code, score);
  if (chinese.languageSpecific) languageSpecific = true;

  if (
    script.uniqueLanguage &&
    script.letterCount >= MIN_UNIQUE_SCRIPT_LETTERS &&
    script.catalogScript !== 'Jpan' &&
    script.catalogScript !== 'Kore'
  ) {
    addScore(scores, script.uniqueLanguage, script.letterCount * 4);
    languageSpecific = true;
  }

  for (const [code, score] of Object.entries(lexical.scores)) addScore(scores, code, score);
  if (lexical.languageSpecific) languageSpecific = true;

  let picked = pickBest(scores);
  if (picked.confidence <= 0.2 && Object.keys(scores).length === 0) {
    const fallback = SCRIPT_FAMILY_FALLBACK[script.catalogScript] ?? DEFAULT_SOURCE_LANGUAGE;
    picked = { code: fallback, confidence: 0.28 };
    languageSpecific = false;
  }

  if (!languageSpecific) {
    if (!scores[picked.code] || picked.confidence > SCRIPT_ONLY_MAX_CONFIDENCE) {
      const fallback = SCRIPT_FAMILY_FALLBACK[script.catalogScript] ?? picked.code;
      picked = {
        code: lexical.bestCode ?? fallback,
        confidence: Math.min(picked.confidence, SCRIPT_ONLY_MAX_CONFIDENCE),
      };
    } else {
      picked = {
        code: picked.code,
        confidence: Math.min(picked.confidence, SCRIPT_ONLY_MAX_CONFIDENCE),
      };
    }
  }

  const code = registeredCode(picked.code) ?? DEFAULT_SOURCE_LANGUAGE;
  return {
    code,
    confidence: picked.confidence,
    script: script.catalogScript,
    languageSpecific,
  };
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
    displayNameNative: profile.nativeName,
    hintCode: hintNorm,
    hintMismatch,
    mixedLanguage: params.mixedLanguage ?? false,
    secondaryLanguages: params.secondaryLanguages ?? [],
    needsUserConfirm: params.confidence < HIGH_CONFIDENCE || profileMissing,
    profileMissing,
  };
}

function shouldCallAi(local: LocalLanguageDetection): boolean {
  if (!local.languageSpecific) return true;
  return local.confidence < HIGH_CONFIDENCE;
}

function acceptAiCode(raw: string): string | null {
  return registeredCode(raw);
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

  if (shouldCallAi(local) && input.aiDetect) {
    try {
      const ai = await input.aiDetect(sample);
      const aiCode = ai ? acceptAiCode(ai.code) : null;
      if (ai && aiCode && ai.confidence >= MEDIUM_CONFIDENCE) {
        if (aiCode === local.code && local.confidence >= MEDIUM_CONFIDENCE && local.languageSpecific) {
          method = 'HYBRID';
          confidence = Math.min(0.98, (local.confidence + ai.confidence) / 2 + 0.1);
        } else {
          method = 'AI';
          detectedCode = aiCode;
          confidence = Math.min(0.98, ai.confidence);
        }
        mixedLanguage = ai.mixedLanguage ?? false;
        secondaryLanguages = (ai.secondaryLanguages ?? [])
          .map((c) => acceptAiCode(c))
          .filter((c): c is string => c != null);
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
