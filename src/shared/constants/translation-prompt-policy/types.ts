import type { FidelityProfile, GenreProfile } from '../translation-style-model';

export const POLICY_LAYERS = [
  'universal',
  'fidelity',
  'genre',
  'source',
  'target',
  'typography',
  'pairOverrides',
  'project',
  'edition',
] as const;

export type PolicyLayer = (typeof POLICY_LAYERS)[number];

export interface TranslationPromptPolicyLayers {
  universal: string[];
  fidelity: string[];
  genre: string[];
  source: string[];
  target: string[];
  typography: string[];
  pairOverrides: string[];
  project: string[];
  edition: string[];
}

export interface TranslationPromptPolicy {
  sourceLanguage: string;
  targetLanguage: string;
  fidelity: FidelityProfile;
  genre: GenreProfile;
  layers: TranslationPromptPolicyLayers;
  /** Ordered, deduplicated rules for prompt rendering. */
  rules: string[];
}

export interface ResolveTranslationPromptPolicyInput {
  sourceLanguage: string;
  targetLanguage: string;
  /** Legacy preset (balanced, xianxia, …). */
  style?: string | null;
  fidelity?: FidelityProfile | null;
  genre?: GenreProfile | null;
  projectRules?: string[];
  editionRules?: string[];
}
