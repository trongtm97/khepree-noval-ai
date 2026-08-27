/**
 * Unit tests for grounding smoke knowledge helpers (no live Google).
 */

import { describe, expect, it } from 'vitest';
import {
  STATIC_VALUE_V1,
  buildSlimTranslationPrompt,
  buildSmokeKnowledgeContent,
  buildStaticGroundingQuestion,
  randomKnowledgeKey,
  responseEqualsExpected,
  sanitizeResponseSnippet,
} from '@main/notebook-grounding-smoke/grounding-smoke-knowledge';

describe('notebook grounding smoke knowledge helpers', () => {
  it('builds random NT_TEST_ hex keys', () => {
    const key = randomKnowledgeKey();
    expect(key).toMatch(/^NT_TEST_[A-F0-9]{6}$/);
  });

  it('question never embeds the knowledge value', () => {
    const key = 'NT_TEST_82F193';
    const q = buildStaticGroundingQuestion(key);
    expect(q).toContain(key);
    expect(q).not.toContain(STATIC_VALUE_V1);
  });

  it('SLIM prompt has Chinese source but no VI mapping', () => {
    const prompt = buildSlimTranslationPrompt('玄天铃拔出长剑。');
    expect(prompt).toContain('玄天铃');
    expect(prompt).not.toContain('Huyền Thiên Linh');
    expect(prompt).not.toContain('Huyền Thiên Chuông');
  });

  it('knowledge content includes key=value and glossary', () => {
    const doc = buildSmokeKnowledgeContent({
      knowledgeKey: 'NT_TEST_82F193',
      knowledgeValue: STATIC_VALUE_V1,
      glossaryVi: 'Huyền Thiên Linh',
    });
    expect(doc).toContain('NT_TEST_82F193=Ngọc Điệp Lam Vân 73');
    expect(doc).toContain('玄天铃 → Huyền Thiên Linh');
  });

  it('exact response match tolerates light wrapping', () => {
    expect(responseEqualsExpected('Ngọc Điệp Lam Vân 73', STATIC_VALUE_V1)).toBe(true);
    expect(responseEqualsExpected('"Ngọc Điệp Lam Vân 73"', STATIC_VALUE_V1)).toBe(true);
    expect(responseEqualsExpected('Huyền Sa Tử 91', STATIC_VALUE_V1)).toBe(false);
  });

  it('sanitizes cookie-like tokens from report snippets', () => {
    const raw = 'answer cookie=abc123 and Bearer tok.en.here';
    const cleaned = sanitizeResponseSnippet(raw);
    expect(cleaned.toLowerCase()).not.toContain('abc123');
    expect(cleaned.toLowerCase()).not.toContain('tok.en.here');
    expect(cleaned).toContain('[redacted]');
  });
});
