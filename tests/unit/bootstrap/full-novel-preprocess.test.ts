import { describe, expect, it } from 'vitest';
import { estimateWordCount, splitCorpusParts } from '../../../src/main/bootstrap/novel-corpus-packer';
import { CORPUS_PART_MAX_WORDS } from '../../../src/shared/constants/notebooklm-preprocess';
import {
  assertMinimumKnowledgeFiles,
  parseFullNovelPreprocessResponse,
} from '../../../src/main/bootstrap/full-novel-preprocess-parser';
import { buildFullNovelPreprocessPrompt } from '../../../src/main/bootstrap/full-novel-preprocess-prompts';
import { knowledgeMarkdownToBootstrapOutput } from '../../../src/main/bootstrap/full-novel-preprocess-markdown';
import { KNOWLEDGE_FILE_KEYS } from '../../../src/shared/constants/notebooklm-preprocess';

describe('estimateWordCount', () => {
  it('counts CJK as one word per character', () => {
    expect(estimateWordCount('你好世界')).toBe(4);
  });

  it('counts latin by whitespace', () => {
    expect(estimateWordCount('hello world foo')).toBe(3);
  });
});

describe('splitCorpusParts', () => {
  it('keeps under-limit novel as one part', () => {
    const parts = splitCorpusParts(
      [
        { chapterRef: 1, text: '你好'.repeat(100) },
        { chapterRef: 2, text: '世界'.repeat(100) },
      ],
      450_000,
    );
    expect(parts).toHaveLength(1);
  });

  it('splits when over soft word limit', () => {
    const big = '字'.repeat(300_000);
    const parts = splitCorpusParts(
      [
        { chapterRef: 1, text: big },
        { chapterRef: 2, text: big },
      ],
      450_000,
    );
    expect(parts.length).toBeGreaterThanOrEqual(2);
  });
});

describe('corpus soft limit constant', () => {
  it('stays under NotebookLM 500k', () => {
    expect(CORPUS_PART_MAX_WORDS).toBeLessThan(500_000);
    expect(CORPUS_PART_MAX_WORDS).toBe(450_000);
  });
});

describe('parseFullNovelPreprocessResponse', () => {
  const sample = KNOWLEDGE_FILE_KEYS.map(
    (k) => '```file:' + k + '\n# ' + k + '\ncontent for ' + k + '\n```',
  ).join('\n\n');

  it('extracts all 8 file keys', () => {
    const parsed = parseFullNovelPreprocessResponse(sample);
    expect(parsed.foundKeys).toHaveLength(8);
    expect(parsed.missingKeys).toHaveLength(0);
    assertMinimumKnowledgeFiles(parsed.files, 8);
  });

  it('maps markdown terms/characters into bootstrap shape', () => {
    const files = {
      '02_PROJECT_TERMS.md': '- 张三 → Trương Tam (CHARACTER)\n- 剑法 → Kiếm pháp (SKILL)',
      '03_CHARACTERS.md': '## 张三\n- Tên Việt: Trương Tam\n- Vai trò:主角',
      '04_RELATIONSHIPS.md': '- 张三 — 李四: friends',
      '05_STORY_STATE.md': '- At the city\n\nSummary text',
      '06_WORLD_KNOWLEDGE.md': '## Locations\n- City A',
      '07_RECENT_CONTEXT.md': '- Fought the demon',
    };
    const out = knowledgeMarkdownToBootstrapOutput(files);
    expect(out.terms.length).toBeGreaterThanOrEqual(2);
    expect(out.terms[0]?.preferred_target).toBeTruthy();
    expect(out.characters[0]?.source_name).toBe('张三');
    expect(out.characters[0]?.preferred_target).toBe('Trương Tam');
    expect(out.relationships[0]?.relationship_type).toContain('friends');
    expect(out.recent_context.important_events.length).toBeGreaterThan(0);
  });
});

describe('buildFullNovelPreprocessPrompt', () => {
  it('requires file fences for 00-07', () => {
    const prompt = buildFullNovelPreprocessPrompt({
      projectTitle: 'Test Novel',
      author: 'Author',
      genre: 'xianxia',
      partFileNames: ['NOVEL_PART_01.txt', 'NOVEL_PART_02.txt'],
      sourceLanguage: 'zh-Hans',
      targetLanguage: 'vi',
    });
    expect(prompt).toContain('DO NOT TRANSLATE');
    expect(prompt).toContain('SOURCE_LANGUAGE:');
    expect(prompt).toContain('TARGET_LANGUAGE:');
    expect(prompt).not.toMatch(/Chinese → Vietnamese|中文→Tiếng Việt/i);
    for (const key of KNOWLEDGE_FILE_KEYS) {
      expect(prompt).toContain('file:' + key);
    }
    expect(prompt).toContain('NOVEL_PART_02.txt');
  });
});
