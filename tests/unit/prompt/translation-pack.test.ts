import { describe, expect, it } from 'vitest';
import {
  PACK_SIZE_LIMITS,
  OUTPUT_PROTOCOL_BLOCK,
} from '@shared/constants/translation-pack';
import {
  MEMORY_DELTA_JSON_SCHEMA,
  TERM_DELTA_JSON_SCHEMA,
  parseTermDelta,
} from '@shared/schemas/term-delta';
import { parseMemoryDelta } from '@shared/schemas/memory-delta';
import type { MemoryContextDto } from '@shared/schemas/memory';
import { assemblePackSections } from '@main/prompt/translation-pack-builder';
import { estimateTokens } from '@main/memory/budget-estimator';

const FIXED_CONTEXT: MemoryContextDto = {
  activeTerms: [
    {
      sourceText: '李逍遥',
      preferredTranslation: 'Lý Tiêu Dao',
      type: 'PERSON',
      locked: true,
    },
    {
      sourceText: '青云门',
      preferredTranslation: 'Thanh Vân Môn',
      type: 'SECT',
      locked: false,
    },
  ],
  activeCharacters: [
    {
      id: '11111111-1111-4111-8111-111111111111',
      projectId: '22222222-2222-4222-8222-222222222222',
      canonicalName: '李逍遥',
      translatedName: 'Lý Tiêu Dao',
      aliases: ['逍遥'],
      gender: 'male',
      role: 'protagonist',
      description: null,
      firstChapter: 1,
      lastChapter: 451,
      status: 'active',
      locked: true,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
  ],
  relationships: [
    {
      id: '33333333-3333-4333-8333-333333333333',
      projectId: '22222222-2222-4222-8222-222222222222',
      fromCharacterId: '11111111-1111-4111-8111-111111111111',
      toCharacterId: '44444444-4444-4444-8444-444444444444',
      fromName: '李逍遥',
      toName: '赵灵儿',
      relationshipType: 'friend',
      description: null,
      aCallsB: '灵儿',
      bCallsA: '逍遥哥哥',
      validFromChapter: 1,
      validToChapter: null,
      confidence: 0.9,
      source: 'manual',
      locked: false,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
  ],
  recentMemory: [
    {
      category: 'plot',
      key: 'mc_realm',
      value: 'Foundation Establishment',
      chapterNumber: 450,
    },
  ],
  criticalProjectRules: ['Keep locked names exact.'],
  storyState: {
    summaryText: 'MC arrives at Qingyun.',
    locationState: { place: '青云门' },
    unresolvedPlotPoints: ['Who attacked the mountain?'],
  },
  anchorChapter: 451,
  recentWindow: { fromChapter: 447, toChapter: 451 },
  budget: { limit: 4000, estimated: 600, dropped: 0 },
};

const SOURCE_LINES = [
  '[C000451:P000001] 李逍遥走进青云门。',
  '[C000451:P000002] 他看见赵灵儿站在山门前。',
];

describe('TERM_DELTA / MEMORY_DELTA schemas', () => {
  it('parses TERM_DELTA discover/update/confirm', () => {
    const items = parseTermDelta([
      {
        action: 'discover',
        source: '灵气',
        target: 'linh khí',
        category: 'skill',
        confidence: 'high',
      },
      { action: 'update', source: '李逍遥', target: 'Lý Tiêu Dao' },
      { action: 'confirm', source: '青云门', target: 'Thanh Vân Môn' },
    ]);
    expect(items).toHaveLength(3);
  });

  it('parses MEMORY_DELTA array actions', () => {
    const items = parseMemoryDelta([
      { action: 'upsert', category: 'plot', key: 'k', value: 'v' },
      { action: 'relationship', from: 'A', to: 'B', type: 'friend' },
      { action: 'story_state', summaryText: 'ok' },
    ]);
    expect(items).toHaveLength(3);
  });

  it('exposes offline JSON schema descriptors', () => {
    expect(TERM_DELTA_JSON_SCHEMA.type).toBe('array');
    expect(MEMORY_DELTA_JSON_SCHEMA.type).toBe('array');
  });
});

describe('TranslationPackBuilder snapshots', () => {
  it('keeps balanced pack structure stable', () => {
    const { sections, prompt } = assemblePackSections({
      style: 'balanced',
      chapterNumbers: [451],
      criticalRules: FIXED_CONTEXT.criticalProjectRules,
      context: FIXED_CONTEXT,
      sourceLines: SOURCE_LINES,
      sourceLanguage: 'zh-Hans',
      targetLanguage: 'vi',
    });

    expect(sections.taskHeader).toMatchSnapshot('task-header');
    expect(sections.criticalRules).toMatchSnapshot('critical-rules');
    expect(sections.hotMemoryDelta).toMatchSnapshot('hot-memory');
    expect(sections.activeProjectTerms).toMatchSnapshot('active-terms');
    expect(sections.outputProtocol).toBe(OUTPUT_PROTOCOL_BLOCK);
    expect(prompt).toMatchSnapshot('full-prompt');
  });

  it('does not bloat context beyond size ceilings', () => {
    const { sections, prompt } = assemblePackSections({
      style: 'xianxia',
      chapterNumbers: [451, 452],
      criticalRules: FIXED_CONTEXT.criticalProjectRules,
      context: FIXED_CONTEXT,
      sourceLines: SOURCE_LINES,
      sourceLanguage: 'zh-Hans',
      targetLanguage: 'vi',
    });

    const contextChars =
      sections.taskHeader.length +
      sections.criticalRules.length +
      sections.hotMemoryDelta.length +
      sections.activeProjectTerms.length +
      sections.outputProtocol.length;

    expect(contextChars).toBeLessThanOrEqual(PACK_SIZE_LIMITS.maxContextChars);
    expect(contextChars).toBeLessThanOrEqual(PACK_SIZE_LIMITS.maxOverheadChars);
    expect(prompt.length).toBeLessThanOrEqual(PACK_SIZE_LIMITS.maxTotalChars);

    // Guard against accidental full-vault dumps in context sections.
    expect(sections.hotMemoryDelta).not.toMatch(/Term Vault/i);
    expect(sections.activeProjectTerms.split('\n').length).toBeLessThan(20);
    expect(estimateTokens(sections.hotMemoryDelta + sections.activeProjectTerms)).toBeLessThan(
      2000,
    );
  });

  it('includes only source IDs from batch, never prior-chapter dump', () => {
    const { sections } = assemblePackSections({
      style: 'literal',
      chapterNumbers: [451],
      criticalRules: [],
      context: FIXED_CONTEXT,
      sourceLines: SOURCE_LINES,
      sourceLanguage: 'zh-Hans',
      targetLanguage: 'vi',
    });

    expect(sections.sourceParagraphs).toContain('[C000451:P000001]');
    expect(sections.sourceParagraphs).not.toContain('[C000001:P000001]');
    expect(sections.sourceParagraphs).toMatchSnapshot('source-block');
  });

  it('embeds required output protocol sections', () => {
    expect(OUTPUT_PROTOCOL_BLOCK).toContain('<TRANSLATION>');
    expect(OUTPUT_PROTOCOL_BLOCK).toContain('<TERM_DELTA>');
    expect(OUTPUT_PROTOCOL_BLOCK).toContain('<MEMORY_DELTA>');
    expect(OUTPUT_PROTOCOL_BLOCK).toContain('category "character"');
    expect(OUTPUT_PROTOCOL_BLOCK).toContain('emit discover');
    expect(OUTPUT_PROTOCOL_BLOCK).toContain('do not manufacture');
  });
});
