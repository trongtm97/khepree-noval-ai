import {
  DEFAULT_SOURCE_LANGUAGE,
  getLanguageProfile,
  normalizeLanguageCode,
  type LanguageProfile,
} from '@shared/constants/language-profile';
import type { LanguageDetectResponse } from '@shared/schemas/language-profile';

const HIGH_CONFIDENCE = 0.72;
const MEDIUM_CONFIDENCE = 0.45;

export interface DetectLanguageInput {
  sampleText: string;
  hintCode?: string | null;
  /**
   * Optional AI detector — unit tests inject a stub.
   * Only called when local heuristic confidence is below HIGH_CONFIDENCE.
   */
  aiDetect?: (sample: string) => Promise<{
    code: string;
    confidence: number;
  } | null>;
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

  let total = 0;
  for (const ch of text) {
    const code = ch.codePointAt(0);
    if (code == null || code <= 0x20) continue;
    total += 1;

    // Hangul
    if (
      (code >= 0xac00 && code <= 0xd7af) ||
      (code >= 0x1100 && code <= 0x11ff)
    ) {
      scores.ko += 3;
      continue;
    }
    // Hiragana / Katakana
    if (
      (code >= 0x3040 && code <= 0x309f) ||
      (code >= 0x30a0 && code <= 0x30ff)
    ) {
      scores.ja += 4;
      continue;
    }
    // Thai
    if (code >= 0x0e00 && code <= 0x0e7f) {
      scores.th += 3;
      continue;
    }
    // Arabic
    if (code >= 0x0600 && code <= 0x06ff) {
      scores.ar += 3;
      continue;
    }
    // Cyrillic
    if (code >= 0x0400 && code <= 0x04ff) {
      scores.ru += 3;
      continue;
    }
    // CJK Unified Ideographs — shared by zh/ja
    if (code >= 0x4e00 && code <= 0x9fff) {
      scores['zh-Hans'] += 2;
      scores.ja += 1;
      continue;
    }
  }

  const lower = text.toLowerCase();
  // Vietnamese diacritics / letters
  const viHits = (lower.match(/[ăâêôơưđáàảãạéèẻẽẹíìỉĩịóòỏõọúùủũụýỳỷỹỵ]/gi) ?? [])
    .length;
  if (viHits > 0) scores.vi += viHits * 2;

  // Latin language light keyword hints
  const enHints = (
    lower.match(/\b(the|and|that|with|from|chapter|said)\b/g) ?? []
  ).length;
  scores.en += enHints;
  const esHints = (lower.match(/\b(el|la|los|las|que|capítulo)\b/g) ?? []).length;
  scores.es += esHints;
  const frHints = (lower.match(/\b(le|la|les|des|une|chapitre)\b/g) ?? []).length;
  scores.fr += frHints;
  const deHints = (lower.match(/\b(der|die|das|und|nicht|kapitel)\b/g) ?? [])
    .length;
  scores.de += deHints;
  const ptHints = (lower.match(/\b(o|a|os|as|que|capítulo|não)\b/g) ?? []).length;
  scores.pt += Math.floor(ptHints / 2);
  const idHints = (lower.match(/\b(yang|dan|dari|untuk|bab)\b/g) ?? []).length;
  scores.id += idHints;

  // Traditional vs Simplified: presence of common traditional-only chars
  const tradHits = (text.match(/[國語門東車馬龍風]/g) ?? []).length;
  if (tradHits > 0) {
    scores['zh-Hant'] += tradHits * 3;
    scores['zh-Hans'] = Math.max(0, scores['zh-Hans'] - tradHits);
  }

  if (total === 0) {
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

function toResponse(
  code: string,
  confidence: number,
  method: LanguageDetectResponse['method'],
): LanguageDetectResponse {
  const profile: LanguageProfile = getLanguageProfile(code);
  return {
    code: profile.code,
    displayNameVi: profile.displayNameVi,
    displayNameNative: profile.displayNameNative,
    confidence,
    method,
    needsUserConfirm: confidence < HIGH_CONFIDENCE,
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
 * Local heuristic first; optional AI only when confidence is low.
 * Never silently locks language — needsUserConfirm when unsure.
 */
export async function detectLanguage(
  input: DetectLanguageInput,
): Promise<LanguageDetectResponse> {
  const sample = input.sampleText.trim();
  if (!sample) {
    return toResponse(DEFAULT_SOURCE_LANGUAGE, 0.15, 'fallback');
  }

  if (input.hintCode) {
    const hint = normalizeLanguageCode(input.hintCode);
    return toResponse(hint, 0.9, 'hint');
  }

  const heuristic = detectLanguageHeuristic(sample);

  if (heuristic.confidence >= HIGH_CONFIDENCE) {
    return toResponse(heuristic.code, heuristic.confidence, 'heuristic');
  }

  if (input.aiDetect) {
    try {
      const ai = await input.aiDetect(sample.slice(0, 4000));
      if (ai && ai.confidence >= MEDIUM_CONFIDENCE) {
        return toResponse(
          normalizeLanguageCode(ai.code),
          Math.min(0.95, ai.confidence),
          'ai',
        );
      }
    } catch {
      // fall through to heuristic / fallback
    }
  }

  if (heuristic.confidence >= MEDIUM_CONFIDENCE) {
    return toResponse(heuristic.code, heuristic.confidence, 'heuristic');
  }

  return toResponse(
    heuristic.code || DEFAULT_SOURCE_LANGUAGE,
    Math.max(0.2, heuristic.confidence),
    'fallback',
  );
}

/**
 * Resolve create-time source language.
 * AUTO → detect from sample (or default + needs confirm).
 */
export async function resolveSourceLanguageInput(input: {
  sourceLanguage: string;
  sampleText?: string | null;
  aiDetect?: DetectLanguageInput['aiDetect'];
}): Promise<{
  code: string;
  detection: LanguageDetectResponse | null;
}> {
  const raw = input.sourceLanguage.trim();
  if (raw.toUpperCase() !== 'AUTO') {
    const code = normalizeLanguageCode(raw);
    return { code, detection: null };
  }

  const detection = await detectLanguage({
    sampleText: input.sampleText ?? '',
    aiDetect: input.aiDetect,
  });
  return { code: detection.code, detection };
}
