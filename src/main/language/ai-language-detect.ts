import { z } from 'zod';
import { AiLanguageDetectOutputSchema } from '@shared/schemas/source-language';

const AI_DETECT_PROMPT = `You are a language identification system. Detect the PRIMARY language of the following novel text sample.
Do NOT translate. Return ONLY valid JSON matching this schema:
{
  "language_code": "ja",
  "confidence": 0.98,
  "language_name": "Japanese",
  "script": "Jpan",
  "mixed_language": false,
  "secondary_languages": []
}

Use BCP-47 codes (en, ja, ko, zh-Hans, zh-Hant, vi, th, ar, ru, es, fr, de, pt, id).
For Chinese distinguish zh-Hans vs zh-Hant when possible. Use "en" not en-US unless region matters.
If text is mostly one language with foreign proper nouns, set mixed_language true and list secondary codes.

TEXT SAMPLE:
`;

export function parseAiLanguageDetectResponse(raw: string): {
  code: string;
  confidence: number;
  mixedLanguage: boolean;
  secondaryLanguages: string[];
} | null {
  const trimmed = raw.trim();
  const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;
  try {
    const parsed = AiLanguageDetectOutputSchema.parse(JSON.parse(jsonMatch[0]));
    return {
      code: parsed.language_code,
      confidence: parsed.confidence,
      mixedLanguage: parsed.mixed_language,
      secondaryLanguages: parsed.secondary_languages,
    };
  } catch {
    return null;
  }
}

export function buildAiLanguageDetectPrompt(sample: string): string {
  return `${AI_DETECT_PROMPT}${sample.slice(0, 8000)}`;
}

export type AiLanguageDetectFn = (
  sample: string,
) => Promise<{ code: string; confidence: number; mixedLanguage?: boolean; secondaryLanguages?: string[] } | null>;

/** Validate raw AI JSON in tests without calling a provider. */
export function validateAiLanguageDetectJson(json: unknown): z.infer<typeof AiLanguageDetectOutputSchema> {
  return AiLanguageDetectOutputSchema.parse(json);
}
