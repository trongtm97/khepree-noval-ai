import type { KnowledgeFileKey } from '@shared/constants/notebooklm-preprocess';
import { KNOWLEDGE_FILE_KEYS } from '@shared/constants/notebooklm-preprocess';
import { getLanguageProfile } from '@shared/constants/language-profile';

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
    `SOURCE_LANGUAGE: ${source.displayNameNative} (${input.sourceLanguage})`,
    `TARGET_LANGUAGE: ${target.displayNameNative} (${input.targetLanguage})`,
    '',
    `You are preparing memory for a novel translation project: ${source.displayNameNative} → ${target.displayNameNative} (NovelTrans).`,
    `Analyze the uploaded novel source files written in ${source.displayNameNative}.`,
    `DO NOT translate chapter prose into ${target.displayNameNative}.`,
    'DO NOT invent characters, terms, relationships, or world facts that do not appear in the sources.',
    'Empty sections are allowed when evidence is missing.',
    'Analysis output prefers structured, language-neutral facts.',
    `Target-language terminology (preferred names / translations) MUST use ${target.displayNameNative} only.`,
    '',
    '## Book metadata (hints)',
    `- Title: ${input.projectTitle}`,
    `- Author: ${input.author?.trim() ?? '(unknown)'}`,
    `- Genre: ${input.genre?.trim() ?? '(unknown)'}`,
    `- Language pair: ${source.displayNameNative} → ${target.displayNameNative}`,
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
    `- Bullets: \`sourceText → targetText (TYPE)\` e.g. CHARACTER / SKILL / PLACE / ITEM / OTHER`,
    `- targetText MUST be in ${target.displayNameNative}.`,
    '- Prefer frequent / plot-critical terms; mark uncertain with lower confidence in prose notes if needed.',
    '',
    '### 03_CHARACTERS.md',
    `- Start with "# ${input.projectTitle} — Characters"`,
    '- One `## CanonicalSourceName` section per major character: Preferred target name, Gender, Role, Aliases, short description.',
    `- Preferred target name MUST be in ${target.displayNameNative}.`,
    '',
    '### 04_RELATIONSHIPS.md',
    `- Start with "# ${input.projectTitle} — Relationships"`,
    '- Bullets or short sections: A — B: type; how A calls B / B calls A when known.',
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
