import {
  formatKnownTermsBlock,
  type BootstrapLocalPrepResult,
} from './bootstrap-local-prep';
import {
  formatBootstrapEditionHeaders,
  formatBootstrapPairSummary,
} from './bootstrap-prompt-language';

/** Single bootstrap AI prompt — analyze only, never translate. */
export function buildBootstrapAnalysisPrompt(prep: BootstrapLocalPrepResult): string {
  const { sourceHeader, targetHeader, scriptLines } = formatBootstrapEditionHeaders(
    prep.sourceLanguage,
    prep.targetLanguage,
  );
  const pairSummary = formatBootstrapPairSummary(prep.sourceLanguage, prep.targetLanguage);
  const chapterBlocks = prep.chapters
    .map(
      (c) =>
        `### Chapter ${c.chapterNumber}${c.title ? ` — ${c.title}` : ''}\n${c.text.slice(0, 12_000)}`,
    )
    .join('\n\n');

  return [
    '# BOOTSTRAP ANALYSIS — DO NOT TRANSLATE THE NOVEL',
    '',
    sourceHeader,
    targetHeader,
    ...scriptLines,
    '',
    `Analyze early chapters to SEED memory for a novel translation (${pairSummary}).`,
    'DO NOT TRANSLATE chapter prose into the target edition language.',
    'DO NOT return paragraph translations.',
    'DO NOT invent characters, relationships, or world facts that do not appear in the input.',
    'Empty arrays are valid when evidence is missing.',
    '',
    '## Story facts vs target-edition choices',
    '- Language-neutral story facts: canonical source names, roles, relationship types, descriptions, locations in source form, timeline, plot threads.',
    '- Target-edition choices: preferred_target_name, term preferred_target, a_calls_b / b_calls_a (forms of address vary by edition).',
    '- Do not store target-language prose as universal story facts.',
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
    '## Gender',
    '- gender_if_explicit: only when source text or source-language name clearly establishes gender.',
    '- If not established: null or "unknown". Do not infer from stereotypes or translated names.',
    '',
    '## Relationships',
    '- Language-neutral: relationship_type, description (fact), valid_from_chapter, valid_to_chapter.',
    '- Target-edition (this target only): a_calls_b, b_calls_a (edition-scoped forms of address).',
    '',
    '## Evidence (short identifiers only)',
    '- For important discoveries include evidence_chapter, evidence_source_name (short), confidence.',
    '- Optional evidence: one short phrase — no long source quotations.',
    '',
    '## Output',
    'Return ONE JSON object only (no markdown fences preferred) with this shape:',
    '{',
    '  "characters": [{',
    '    "canonical_source_name", "source_aliases", "role", "gender_if_explicit",',
    '    "first_seen_chapter", "confidence", "evidence", "evidence_chapter", "evidence_source_name",',
    '    "preferred_target_name"',
    '  }],',
    '  "relationships": [{',
    '    "character_a", "character_b", "relationship_type", "description",',
    '    "valid_from_chapter", "valid_to_chapter", "confidence",',
    '    "a_calls_b", "b_calls_a"',
    '  }],',
    '  "terms": [{',
    '    "source", "preferred_target", "category", "first_seen_chapter", "confidence",',
    '    "transliteration", "transliterationSystem", "evidence_chapter", "evidence_source_name", "notes"',
    '  }],',
    '  "world_knowledge": { "cultivation_system", "sects", "locations", "organizations", "items", "rules" },',
    '  "story_state": { "through_chapter", "current_locations", "current_goals", "current_conflicts", "open_plot_threads", "summary" },',
    '  "recent_context": { "through_chapter", "important_events" }',
    '}',
    '',
    'preferred_target_name and term preferred_target MUST be in the target edition language.',
    'Do NOT emit sourceLanguage, targetLanguage, editionId, sourceText, or targetText — the application attaches language pair and edition at persist.',
    'Never use locale-specific JSON field names for target names.',
    'transliteration / transliterationSystem: only when needed (e.g. pinyin for Chinese, romaji when policy requires); omit otherwise.',
    'Only include entities that appear in the chapters above.',
    'story_state reflects state at the END of the analyzed window only (locations, cultivation, items, open plot, timeline — not stylistic translation choices).',
  ].join('\n');
}
