import {
  FIDELITY_RULES,
  GENRE_RULES,
  resolveStyleModel,
  type FidelityProfile,
  type GenreProfile,
} from '../translation-style-model';
import { normalizeLanguageCode } from '../language-profile';
import { UNIVERSAL_TRANSLATION_CONTRACT } from './universal-contract';
import { dedupePolicyRules } from './dedupe';
import { resolvePairOverrideRules } from './pair-overrides';
import { resolveSourceLanguageRules } from './source-policies';
import { resolveTargetLanguageRules } from './target-policies';
import { resolveScriptTypographyRules } from './script-typography';
import type {
  ResolveTranslationPromptPolicyInput,
  TranslationPromptPolicy,
  TranslationPromptPolicyLayers,
} from './types';

export function resolveTranslationPromptPolicy(
  input: ResolveTranslationPromptPolicyInput,
): TranslationPromptPolicy {
  const sourceLanguage = normalizeLanguageCode(input.sourceLanguage);
  const targetLanguage = normalizeLanguageCode(input.targetLanguage);
  const resolved = resolveStyleModel(input.style);
  const fidelity: FidelityProfile = input.fidelity ?? resolved.fidelity;
  const genre: GenreProfile = input.genre ?? resolved.genre;

  const layers: TranslationPromptPolicyLayers = {
    universal: [...UNIVERSAL_TRANSLATION_CONTRACT],
    fidelity: [...FIDELITY_RULES[fidelity]],
    genre: [...GENRE_RULES[genre]],
    source: resolveSourceLanguageRules(sourceLanguage),
    target: resolveTargetLanguageRules(targetLanguage),
    typography: resolveScriptTypographyRules(sourceLanguage, targetLanguage),
    pairOverrides: resolvePairOverrideRules(sourceLanguage, targetLanguage),
    project: (input.projectRules ?? []).map((r) => r.trim()).filter(Boolean),
    edition: (input.editionRules ?? []).map((r) => r.trim()).filter(Boolean),
  };

  const rules = dedupePolicyRules([
    layers.universal,
    layers.fidelity,
    layers.genre,
    layers.source,
    layers.target,
    layers.typography,
    layers.pairOverrides,
    layers.project,
    layers.edition,
  ]);

  return {
    sourceLanguage,
    targetLanguage,
    fidelity,
    genre,
    layers,
    rules,
  };
}

/** Alias for spec name TranslationPromptPolicyResolver.resolve */
export const TranslationPromptPolicyResolver = {
  resolve: resolveTranslationPromptPolicy,
};
