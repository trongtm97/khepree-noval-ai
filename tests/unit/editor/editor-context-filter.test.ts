import { describe, expect, it } from 'vitest';
import type { EditorParagraphDto } from '../../../src/shared/schemas/translation-editor';
import {
  filterContextForParagraph,
  isEditorContextEmpty,
  type EditorContext,
} from '../../../src/renderer/utils/editor-context-filter';

function uuidFor(n: number): string {
  return `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
}

function makeParagraph(overrides: Partial<EditorParagraphDto> = {}): EditorParagraphDto {
  return {
    id: uuidFor(1),
    stableParagraphId: '[C000001:P000001]',
    sequence: 1,
    sourceText: '青云门弟子林峰走来。',
    translationId: null,
    translatedText: null,
    status: 'draft',
    versionSource: 'AI_INITIAL',
    humanLocked: false,
    qaWarnings: [],
    termHighlights: [],
    ...overrides,
  };
}

const chapterContext: EditorContext = {
  characters: [
    { id: 'c1', canonicalName: '林峰', translatedName: 'Lâm Phong', role: 'protagonist' },
    { id: 'c2', canonicalName: '苏婉', translatedName: 'Tô Uyển', role: 'support' },
  ],
  relationships: [
    { id: 'r1', fromName: '林峰', toName: '苏婉', type: 'ally' },
  ],
  terms: [
    { id: uuidFor(2), sourceText: '青云门', translation: 'Thanh Vân Môn', scope: 'project', confidence: 0.9 },
    { id: uuidFor(3), sourceText: '灵石', translation: 'linh thạch', scope: 'project', confidence: 0.8 },
  ],
  memorySnippet: 'Chapter memory',
};

describe('editor-context-filter', () => {
  it('treats missing lists and blank snippet as empty', () => {
    expect(isEditorContextEmpty(null)).toBe(true);
    expect(
      isEditorContextEmpty({
        characters: [],
        relationships: [],
        terms: [],
        memorySnippet: '   ',
      }),
    ).toBe(true);
    expect(isEditorContextEmpty(chapterContext)).toBe(false);
  });

  it('keeps only paragraph-relevant items when the paragraph matches', () => {
    const filtered = filterContextForParagraph(chapterContext, makeParagraph());
    expect(filtered.characters.map((c) => c.canonicalName)).toEqual(['林峰']);
    expect(filtered.terms.map((term) => term.sourceText)).toEqual(['青云门']);
    expect(filtered.relationships).toHaveLength(1);
    expect(filtered.memorySnippet).toBe('Chapter memory');
  });

  it('returns empty scoped context when the paragraph matches nothing', () => {
    const filtered = filterContextForParagraph(
      chapterContext,
      makeParagraph({ sourceText: '无匹配', translatedText: 'không khớp' }),
    );
    expect(filtered.characters).toHaveLength(0);
    expect(filtered.terms).toHaveLength(0);
    expect(filtered.relationships).toHaveLength(0);
    expect(filtered.memorySnippet).toBeNull();
  });
});
