import { describe, expect, it } from 'vitest';
import type { ChapterSummaryDto } from '../../../src/shared/schemas/translation-pack';
import {
  formatChapterDisplayLabel,
  chapterRef,
} from '../../../src/renderer/components/translation/chapter-utils';
import {
  clampChapterRailWidth,
  clampContextPanelWidth,
  resolveChapterRailWidth,
  resolveContextPanelWidth,
  CHAPTER_RAIL_MIN,
  CHAPTER_RAIL_MAX,
  CONTEXT_PANEL_MIN,
  CONTEXT_PANEL_MAX,
} from '../../../src/renderer/utils/translation-workspace-layout';

function makeChapter(overrides: Partial<ChapterSummaryDto> = {}): ChapterSummaryDto {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    chapterNumber: 3,
    sequenceOrder: 3,
    title: null,
    characterCount: 80,
    paragraphCount: 8,
    status: 'ready',
    hasTranslation: false,
    sourceStatus: 'SOURCE_READY',
    ...overrides,
  };
}

describe('formatChapterDisplayLabel', () => {
  const prefix = 'Chương {n}';

  it('shows "Chương 3" when no title', () => {
    expect(formatChapterDisplayLabel(makeChapter(), prefix)).toBe('Chương 3');
  });

  it('shows "Chương 16 · Hồi sinh" when title exists', () => {
    expect(
      formatChapterDisplayLabel(makeChapter({ chapterNumber: 16, title: 'Hồi sinh' }), prefix),
    ).toBe('Chương 16 · Hồi sinh');
  });

  it('does not produce awkward "3 · Chương" pattern', () => {
    const label = formatChapterDisplayLabel(makeChapter({ title: 'Chương' }), prefix);
    expect(label).toBe('Chương 3');
    expect(label).not.toMatch(/^3 ·/);
  });
});

describe('translation-workspace-layout', () => {
  it('clamps chapter rail to 160–320', () => {
    expect(clampChapterRailWidth(100)).toBe(CHAPTER_RAIL_MIN);
    expect(clampChapterRailWidth(400)).toBe(CHAPTER_RAIL_MAX);
    expect(clampChapterRailWidth(200)).toBe(200);
  });

  it('clamps context panel to 240–360', () => {
    expect(clampContextPanelWidth(200)).toBe(CONTEXT_PANEL_MIN);
    expect(clampContextPanelWidth(400)).toBe(CONTEXT_PANEL_MAX);
    expect(clampContextPanelWidth(260)).toBe(260);
  });

  it('caps chapter rail at 190px on 1366 viewport', () => {
    expect(resolveChapterRailWidth(220, 1366)).toBe(190);
    expect(resolveChapterRailWidth(170, 1366)).toBe(170);
  });

  it('prefers 210–230 range on 1920 viewport', () => {
    expect(resolveChapterRailWidth(200, 1920)).toBe(210);
    expect(resolveChapterRailWidth(250, 1920)).toBe(230);
  });

  it('caps context panel at 260px on 1366 viewport', () => {
    expect(resolveContextPanelWidth(300, 1366)).toBe(260);
    expect(resolveContextPanelWidth(240, 1366)).toBe(240);
  });
});

describe('chapterRef', () => {
  it('uses chapterNumber when present', () => {
    expect(chapterRef(makeChapter({ chapterNumber: 42, sequenceOrder: 1 }))).toBe(42);
  });
});
