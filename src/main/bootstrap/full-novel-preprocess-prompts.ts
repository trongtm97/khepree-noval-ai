import type { KnowledgeFileKey } from '@shared/constants/notebooklm-preprocess';
import { KNOWLEDGE_FILE_KEYS } from '@shared/constants/notebooklm-preprocess';
import { getLanguageProfile } from '@shared/constants/language-profile';
import {
  formatBootstrapEditionHeaders,
  formatBootstrapPairSummary,
} from './bootstrap-prompt-language';

export interface PreprocessPromptInput {
  projectTitle: string;
  author?: string | null;
  genre?: string | null;
  partFileNames: string[];
  sourceLanguage: string;
  targetLanguage: string;
}

/**
 * Assisted NotebookLM prompt — ask for exactly the 8 knowledge markdown files.
 */
export function buildFullNovelPreprocessPrompt(input: PreprocessPromptInput): string {
  const source = getLanguageProfile(input.sourceLanguage);
  const target = getLanguageProfile(input.targetLanguage);
  const { sourceHeader, targetHeader, scriptLines } = formatBootstrapEditionHeaders(
    input.sourceLanguage,
    input.targetLanguage,
  );
  const pairSummary = formatBootstrapPairSummary(input.sourceLanguage, input.targetLanguage);
  const partsList =
    input.partFileNames.length > 0
      ? input.partFileNames.map((n) => `- ${n}`).join('\n')
      : '- (upload all NOVEL_PART_*.txt sources)';

  const fileBlocks = KNOWLEDGE_FILE_KEYS.map(
    (name) => '```file:' + name + '\n…content…\n```',
  ).join('\n\n');

  return [
    '# FULL NOVEL PREPROCESS — DO NOT TRANSLATE THE NOVEL',
    '',
    sourceHeader,
    targetHeader,
    ...scriptLines,
    '',
    `Prepare memory for a novel translation project (${pairSummary}, NovelTrans).`,
    `Analyze uploaded source files in the source language profile above.`,
    'DO NOT translate chapter prose into the target edition language.',
    'DO NOT invent characters, terms, relationships, or world facts that do not appear in the sources.',
    'Empty sections are allowed when evidence is missing.',
    'Prefer language-neutral story facts; target-edition names and forms of address belong in the target edition layer only.',
    `Preferred names and term translations MUST use the target edition language (${target.internationalName}).`,
    'Do not guess gender — omit or mark unknown when source does not establish it.',
    'Relationship facts (type, description, valid_from/valid_to) are language-neutral; a_calls_b / b_calls_a are edition-scoped.',
    '',
    '## Book metadata (hints)',
    `- Title: ${input.projectTitle}`,
    `- Author: ${input.author?.trim() ?? '(unknown)'}`,
    `- Genre: ${input.genre?.trim() ?? '(unknown)'}`,
    `- Language pair: ${pairSummary}`,
    '',
    '## Sources to use (already uploaded to this notebook)',
    partsList,
    '',
    'If multiple NOVEL_PART_* files exist, treat them as one continuous novel in order.',
    'story_state and recent_context must reflect the END of the last part.',
    '',
    '## Required output format',
    'Return ONE message containing exactly these 8 fenced blocks (no other wrappers):',
    '',
    fileBlocks,
    '',
    '## Content rules per file',
    '',
    '### 00_BOOK_PROFILE.md',
    `- Start with "# ${input.projectTitle} — Book profile"`,
    `- Include: sourceTitle, targetTitle, alternativeTitles, author, genre, language pair (${source.displayNameNative} → ${target.displayNameNative}), tone, audience notes.`,
    '',
    '### 01_TRANSLATION_RULES.md',
    `- Start with "# ${input.projectTitle} — Translation rules"`,
    `- State: Source language: ${source.displayNameNative} (${input.sourceLanguage}).`,
    `- State: Target language: ${target.displayNameNative} (${input.targetLanguage}).`,
    '- Rules for full translation (no summary), consistent names, honorifics, genre style.',
    '- Include priority list: Pack > HOT MEMORY > LOCKED TERM > Project memory > Notebook > model.',
    '- Do NOT invent a custom output protocol beyond: keep paragraph IDs if present; no plot spoilers from later chapters when translating earlier ones.',
    '',
    '### 02_PROJECT_TERMS.md',
    `- Start with "# ${input.projectTitle} — Terms"`,
    `- Bullets: \`source → preferred_target (TYPE)\` e.g. CHARACTER / SKILL / PLACE / ITEM / OTHER`,
    `- preferred_target MUST be in the target edition language.`,
    '- Optional transliteration when source policy requires (pinyin, romaji, etc.); omit when unnecessary.',
    '- Prefer frequent / plot-critical terms; short evidence note when uncertain.',
    '',
    '### 03_CHARACTERS.md',
    `- Start with "# ${input.projectTitle} — Characters"`,
    '- One `## CanonicalSourceName` section per major character: canonical source name, source aliases, role, gender_if_explicit (or unknown), preferred_target_name, short neutral description, evidence chapter.',
    `- preferred_target_name MUST be in the target edition language — use preferred_target_name, not locale-specific legacy field names.`,
    '',
    '### 04_RELATIONSHIPS.md',
    `- Start with "# ${input.projectTitle} — Relationships"`,
    '- Language-neutral: A — B: relationship_type, description/fact, valid_from, valid_to.',
    '- Target-edition: how A calls B / how B calls A when known (edition-scoped forms of address).',
    '',
    '### 05_STORY_STATE.md',
    `- Start with "# ${input.projectTitle} — Story state"`,
    '- Through last chapter: locations, goals, conflicts, open threads, short summary (not a full retelling). Prefer language-neutral facts.',
    '',
    '### 06_WORLD_KNOWLEDGE.md',
    `- Start with "# ${input.projectTitle} — World"`,
    '- Stable facts: power system, factions, places, orgs, items, rules — only if evidenced. Language-neutral where possible.',
    '',
    '### 07_RECENT_CONTEXT.md',
    `- Start with "# ${input.projectTitle} — Recent context"`,
    '- Important events from roughly the last 20 chapters of the packed sources (or all if shorter).',
    '',
    'Respond with the eight ```file:…``` blocks only after analysis. No chapter translations.',
  ].join('\n');
}

export function expectedKnowledgeFileKeys(): readonly KnowledgeFileKey[] {
  return KNOWLEDGE_FILE_KEYS;
}
