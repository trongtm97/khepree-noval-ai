import type { BootstrapLocalPrepResult } from './bootstrap-local-prep';
import { formatKnownTermsBlock } from './bootstrap-local-prep';

/** Single bootstrap AI prompt — analyze only, never translate. */
export function buildBootstrapAnalysisPrompt(prep: BootstrapLocalPrepResult): string {
  const chapterBlocks = prep.chapters
    .map(
      (c) =>
        `### Chapter ${c.chapterNumber}${c.title ? ` — ${c.title}` : ''}\n${c.text.slice(0, 12_000)}`,
    )
    .join('\n\n');

  return [
    '# BOOTSTRAP ANALYSIS — DO NOT TRANSLATE THE NOVEL',
    '',
    'You are analyzing early chapters to SEED memory for a Chinese→Vietnamese novel translation project.',
    'DO NOT TRANSLATE chapter text into Vietnamese.',
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
    '  "characters": [{ "source_name", "preferred_vi", "role", "gender", "aliases", "first_seen_chapter", "confidence" }],',
    '  "relationships": [{ "character_a", "character_b", "relationship_type", "a_calls_b", "b_calls_a", "valid_from_chapter", "confidence" }],',
    '  "terms": [{ "source", "preferred_vi", "category", "first_seen_chapter", "confidence" }],',
    '  "world_knowledge": { "cultivation_system", "sects", "locations", "organizations", "items", "rules" },',
    '  "story_state": { "through_chapter", "current_locations", "current_goals", "current_conflicts", "open_plot_threads", "summary" },',
    '  "recent_context": { "through_chapter", "important_events" }',
    '}',
    '',
    'Only include entities that appear in the chapters above.',
    'For relationships unknown: use [].',
    'story_state reflects state at the END of the analyzed window only.',
  ].join('\n');
}
