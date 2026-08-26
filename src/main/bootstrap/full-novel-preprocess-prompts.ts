import type { KnowledgeFileKey } from '@shared/constants/notebooklm-preprocess';
import { KNOWLEDGE_FILE_KEYS } from '@shared/constants/notebooklm-preprocess';

export interface PreprocessPromptInput {
  projectTitle: string;
  author?: string | null;
  genre?: string | null;
  partFileNames: string[];
}

/**
 * Assisted NotebookLM prompt — ask for exactly the 8 knowledge markdown files.
 */
export function buildFullNovelPreprocessPrompt(input: PreprocessPromptInput): string {
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
    'You are preparing memory for a Chinese → Vietnamese novel translation project (NovelTrans).',
    'Analyze the uploaded novel source files. DO NOT translate chapter prose into Vietnamese.',
    'DO NOT invent characters, terms, relationships, or world facts that do not appear in the sources.',
    'Empty sections are allowed when evidence is missing.',
    '',
    '## Book metadata (hints)',
    `- Title: ${input.projectTitle}`,
    `- Author: ${input.author?.trim() || '(unknown)'}`,
    `- Genre: ${input.genre?.trim() || '(unknown)'}`,
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
    `- Start with "# ${input.projectTitle} — Hồ sơ sách"`,
    '- Include: title, author, genre, language pair (中文→Tiếng Việt), tone, audience notes.',
    '',
    '### 01_TRANSLATION_RULES.md',
    `- Start with "# ${input.projectTitle} — Quy tắc dịch"`,
    '- Rules for full translation (no summary), consistent names, honorifics, genre style.',
    '- Include priority list: Pack > HOT MEMORY > LOCKED TERM > Project memory > Notebook > model.',
    '- Do NOT invent a custom output protocol beyond: keep paragraph IDs if present; no plot spoilers from later chapters when translating earlier ones.',
    '',
    '### 02_PROJECT_TERMS.md',
    `- Start with "# ${input.projectTitle} — Thuật ngữ"`,
    '- Bullets: `源词 → Bản dịch Việt (TYPE)` e.g. CHARACTER / SKILL / PLACE / ITEM / OTHER',
    '- Prefer frequent / plot-critical terms; mark uncertain with lower confidence in prose notes if needed.',
    '',
    '### 03_CHARACTERS.md',
    `- Start with "# ${input.projectTitle} — Nhân vật"`,
    '- One `## CanonicalName` section per major character: Tên Việt, Giới tính, Vai trò, Bí danh, short description.',
    '',
    '### 04_RELATIONSHIPS.md',
    `- Start with "# ${input.projectTitle} — Quan hệ"`,
    '- Bullets or short sections: A — B: type; how A calls B / B calls A when known.',
    '',
    '### 05_STORY_STATE.md',
    `- Start with "# ${input.projectTitle} — Trạng thái cốt truyện"`,
    '- Through last chapter: locations, goals, conflicts, open threads, short summary (not a full retelling).',
    '',
    '### 06_WORLD_KNOWLEDGE.md',
    `- Start with "# ${input.projectTitle} — Thế giới"`,
    '- Stable facts: cultivation/power system, sects, places, orgs, items, rules — only if evidenced.',
    '',
    '### 07_RECENT_CONTEXT.md',
    `- Start with "# ${input.projectTitle} — Ngữ cảnh gần"`,
    '- Important events from roughly the last 20 chapters of the packed sources (or all if shorter).',
    '',
    'Respond with the eight ```file:…``` blocks only after analysis. No chapter translations.',
  ].join('\n');
}

export function expectedKnowledgeFileKeys(): readonly KnowledgeFileKey[] {
  return KNOWLEDGE_FILE_KEYS;
}
