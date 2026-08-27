import { getLanguageProfile } from '@shared/constants/language-profile';
import {
  formatKnownTermsBlock,
  type BootstrapLocalPrepResult,
} from './bootstrap-local-prep';

/** Single bootstrap AI prompt — analyze only, never translate. */
export function buildBootstrapAnalysisPrompt(prep: BootstrapLocalPrepResult): string {
  const source = getLanguageProfile(prep.sourceLanguage);
  const target = getLanguageProfile(prep.targetLanguage);
  const chapterBlocks = prep.chapters
    .map(
      (c) =>
        `### Chapter ${c.chapterNumber}${c.title ? ` — ${c.title}` : ''}\n${c.text.slice(0, 12_000)}`,
    )
    .join('\n\n');

  return [
    '# BOOTSTRAP ANALYSIS — DO NOT TRANSLATE THE NOVEL',
    '',
    `SOURCE_LANGUAGE: ${source.displayNameNative} (${prep.sourceLanguage})`,
    `TARGET_LANGUAGE: ${target.displayNameNative} (${prep.targetLanguage})`,
    '',
    `You are analyzing early chapters to SEED memory for a novel translation project (${source.displayNameNative} → ${target.displayNameNative}).`,
    `DO NOT TRANSLATE chapter text into ${target.displayNameNative}.`,
    'DO NOT return paragraph translations.',
    'DO NOT invent characters, relationships, or world facts that do not appear in the input.',
    'Empty arrays are valid when evidence is missing.',
    '',
    '## Book profile',
    prep.bookProfile.slice(0, 4_000),
    '',
    '## Translation rules (context only)',
    prep.translationRules.slice(0, 2_000),
    '',
    '## KNOWN TERMINOLOGY (respect; do not re-ask or contradict locked terms)',
    formatKnownTermsBlock(prep.knownTerms),
    '',
    '## Chapters to analyze',
    chapterBlocks || '(no chapter text)',
    '',
    '## Output',
    'Return ONE JSON object only (no markdown fences preferred) with this shape:',
    '{',
    '  "characters": [{ "source_name", "preferred_target", "role", "gender", "aliases", "first_seen_chapter", "confidence" }],',
    '  "relationships": [{ "character_a", "character_b", "relationship_type", "a_calls_b", "b_calls_a", "valid_from_chapter", "confidence" }],',
    '  "terms": [{ "sourceText", "targetText", "sourceLanguage", "targetLanguage", "category", "first_seen_chapter", "confidence" }],',
    '  "world_knowledge": { "cultivation_system", "sects", "locations", "organizations", "items", "rules" },',
    '  "story_state": { "through_chapter", "current_locations", "current_goals", "current_conflicts", "open_plot_threads", "summary" },',
    '  "recent_context": { "through_chapter", "important_events" }',
    '}',
    '',
    `For every term: sourceLanguage="${prep.sourceLanguage}", targetLanguage="${prep.targetLanguage}".`,
    `preferred_target / targetText must be in ${target.displayNameNative} (TARGET_LANGUAGE).`,
    'Only include entities that appear in the chapters above.',
    'For relationships unknown: use [].',
    'story_state reflects state at the END of the analyzed window only.',
    'Analysis facts must stay language-neutral where possible; only preferred_target/targetText use TARGET_LANGUAGE.',
  ].join('\n');
}
