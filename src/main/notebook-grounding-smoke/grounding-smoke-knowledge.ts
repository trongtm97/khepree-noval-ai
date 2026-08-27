/**
 * Knowledge document builders for Real Notebook grounding smoke.
 * No secrets. Values never appear in questions for Test A/B.
 */

import {
  buildSyncStateManifestContent,
  generateSyncNonce,
} from '@shared/constants/notebook-version-probe';

export const STATIC_VALUE_V1 = 'Ngọc Điệp Lam Vân 73';
export const STATIC_VALUE_V2 = 'Huyền Sa Tử 91';
export const GLOSSARY_SRC = '玄天铃';
export const GLOSSARY_VI_V1 = 'Huyền Thiên Linh';
export const GLOSSARY_VI_V2 = 'Huyền Thiên Chuông';

export function randomKnowledgeKey(): string {
  const bytes = new Uint8Array(3);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();
  return `NT_TEST_${hex}`;
}

export function buildSmokeKnowledgeContent(input: {
  knowledgeKey: string;
  knowledgeValue: string;
  glossaryVi: string;
}): string {
  return [
    '# NovelTrans smoke knowledge',
    '# Machine-readable grounding fixture — do not paraphrase keys.',
    '',
    '## Knowledge keys',
    `${input.knowledgeKey}=${input.knowledgeValue}`,
    '',
    '## Glossary',
    `${GLOSSARY_SRC} → ${input.glossaryVi}`,
    '',
  ].join('\n');
}

export function buildSmokeSyncStateContent(input: {
  projectId: string;
  knowledgeVersion: number;
  syncNonce?: string;
}): { content: string; syncNonce: string; knowledgeVersion: number } {
  const syncNonce = input.syncNonce ?? generateSyncNonce();
  return {
    content: buildSyncStateManifestContent({
      projectId: input.projectId,
      knowledgeVersion: input.knowledgeVersion,
      syncNonce,
    }),
    syncNonce,
    knowledgeVersion: input.knowledgeVersion,
  };
}

export function buildStaticGroundingQuestion(knowledgeKey: string): string {
  return [
    'According to the NovelTrans knowledge source,',
    'return only the value associated with',
    `${knowledgeKey}.`,
  ].join('\n');
}

/** SLIM translation prompt: Chinese source only — no mapping. */
export function buildSlimTranslationPrompt(chineseLine: string): string {
  return [
    'Translate the following Chinese line to Vietnamese.',
    'Use NovelTrans Notebook knowledge for proper names.',
    'Do not invent character names.',
    'Return only the Vietnamese translation.',
    '',
    'Source Chinese:',
    chineseLine,
  ].join('\n');
}

export function sanitizeResponseSnippet(raw: string, max = 400): string {
  let text = raw.replace(/\r\n/g, '\n').trim();
  // Strip anything that looks like auth material (belt-and-suspenders for reports).
  text = text
    .replace(/cookie[s]?\s*[:=]\s*\S+/gi, '[redacted]')
    .replace(/authorization\s*[:=]\s*\S+/gi, '[redacted]')
    .replace(/bearer\s+[A-Za-z0-9._-]+/gi, '[redacted]')
    .replace(/ya29\.[A-Za-z0-9_\-.]+/g, '[redacted]')
    .replace(/1\/\/[A-Za-z0-9_\-.]+/g, '[redacted]');
  if (text.length > max) return `${text.slice(0, max)}…`;
  return text;
}

export function normalizeExact(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

export function responseEqualsExpected(raw: string, expected: string): boolean {
  const n = normalizeExact(raw);
  const e = normalizeExact(expected);
  if (n === e) return true;
  // Allow model wrapping with quotes / trailing punctuation noise.
  const stripped = n.replace(/^["'`]+|["'`]+$/g, '').replace(/[.。!！?？]+$/g, '').trim();
  return stripped === e || n.includes(e);
}

export function responseUsesGlossary(raw: string, expectedVi: string): boolean {
  return normalizeExact(raw).includes(normalizeExact(expectedVi));
}
