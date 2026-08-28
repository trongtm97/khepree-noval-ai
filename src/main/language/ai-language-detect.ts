import { z } from 'zod';
import { listLanguageCatalogCodes } from '@shared/constants/language-profile';
import { AiLanguageDetectOutputSchema } from '@shared/schemas/source-language';

function catalogAllowList(): string {
  return listLanguageCatalogCodes().join(', ');
}

export function buildAiLanguageDetectPromptBody(): string {
  return `You are a language identification system. Detect the PRIMARY language of the following novel text sample.
Do NOT translate. Return ONLY valid JSON matching this schema:
{
  "language_code": "ja",
  "confidence": 0.98,
  "language_name": "Japanese",
  "script": "Jpan",
  "mixed_language": false,
  "secondary_languages": []
}

language_code MUST be a BCP-47 code from the NovelTrans World Language Catalog:
${catalogAllowList()}

Do not invent codes outside this catalog. Distinguish zh-Hans vs zh-Hant when possible.
Use sr-Cyrl / sr-Latn, pt-BR / pt-PT, az-Cyrl / az-Latn when script or region is clear.
If text is mostly one language with foreign proper nouns, set mixed_language true and list secondary catalog codes.

TEXT SAMPLE:
`;
}

export function parseAiLanguageDetectResponse(raw: string): {
  code: string;
  confidence: number;
  mixedLanguage: boolean;
  secondaryLanguages: string[];
} | null {
  const trimmed = raw.trim();
  const jsonMatch = /\{[\s\S]*\}/.exec(trimmed);
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
  return `${buildAiLanguageDetectPromptBody()}${sample.slice(0, 8000)}`;
}

export type AiLanguageDetectFn = (
  sample: string,
) => Promise<{ code: string; confidence: number; mixedLanguage?: boolean; secondaryLanguages?: string[] } | null>;

/** Validate raw AI JSON in tests without calling a provider. */
export function validateAiLanguageDetectJson(json: unknown): z.infer<typeof AiLanguageDetectOutputSchema> {
  return AiLanguageDetectOutputSchema.parse(json);
}
