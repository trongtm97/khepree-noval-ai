/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ChapterSummaryDto } from '../../../src/shared/schemas/translation-pack';
import { ChapterNavigator } from '../../../src/renderer/components/translation/ChapterNavigator';
import { useLocaleStore } from '../../../src/renderer/i18n';
import { useTranslationWorkspaceStore } from '../../../src/renderer/stores/translation-workspace-store';

function uuidFor(n: number): string {
  return `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
}

function makeChapter(n: number, overrides: Partial<ChapterSummaryDto> = {}): ChapterSummaryDto {
  return {
    id: uuidFor(n),
    chapterNumber: n,
    sequenceOrder: n,
    title: n === 2 ? 'Mở đầu' : null,
    characterCount: 80,
    paragraphCount: 8,
    status: 'ready',
    hasTranslation: n === 1,
    sourceStatus: n === 3 ? 'SOURCE_MODIFIED' : 'SOURCE_READY',
    ...overrides,
  };
}

function makeChapters(count: number): ChapterSummaryDto[] {
  const list: ChapterSummaryDto[] = [];
  for (let n = 1; n <= count; n += 1) list.push(makeChapter(n));
  return list;
}

function installListLayout(height = 360) {
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
    configurable: true,
    get(this: HTMLElement) {
      if (this.classList.contains('chapter-nav-list')) return height;
      if (this.getAttribute('data-index') != null) return 36;
      return 36;
    },
  });
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
    configurable: true,
    get(this: HTMLElement) {
      if (this.classList.contains('chapter-nav-list')) return height;
      return 36;
    },
  });
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
    configurable: true,
    get() {
      return 200;
    },
  });
}

const noop = {
  onToggleCollapse: vi.fn(),
  onSelectChapter: vi.fn(),
  onToggleSelect: vi.fn(),
  onSelectAll: vi.fn(),
  onClearSelection: vi.fn(),
  onTranslateSelected: vi.fn(),
  onExportSelected: vi.fn(),
  onChapterCopy: vi.fn(),
  onChapterExport: vi.fn(),
  onChapterRetranslate: vi.fn(),
};

describe('ChapterNavigator', () => {
  beforeEach(() => {
    useLocaleStore.setState({ locale: 'vi' });
    useTranslationWorkspaceStore.setState({ chapterListScrollByProject: {} });
    installListLayout();
  });

  afterEach(() => {
    cleanup();
  });

  it('is memoized against parent editor ticks', () => {
    expect(String(ChapterNavigator.$$typeof)).toContain('react.memo');
  });

  it('virtualizes 10,000 chapters instead of mounting every row', () => {
    const chapters = makeChapters(10_000);
    const { container } = render(
      <ChapterNavigator
        projectId="p1"
        chapters={chapters}
        chapterIndex={0}
        selectedChapterIds={new Set()}
        busy={false}
        collapsed={false}
        {...noop}
      />,
    );
    const rows = container.querySelectorAll('.chapter-item');
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.length).toBeLessThan(80);
  });

  it('hides checkboxes until selection mode or a selection exists', () => {
    const chapters = makeChapters(184);
    const { rerender } = render(
      <ChapterNavigator
        projectId="p1"
        chapters={chapters}
        chapterIndex={0}
        selectedChapterIds={new Set()}
        busy={false}
        collapsed={false}
        {...noop}
      />,
    );
    expect(screen.queryByRole('checkbox')).toBeNull();

    rerender(
      <ChapterNavigator
        projectId="p1"
        chapters={chapters}
        chapterIndex={0}
        selectedChapterIds={new Set([chapters[0].id])}
        busy={false}
        collapsed={false}
        {...noop}
      />,
    );
    expect(screen.getAllByRole('checkbox').length).toBeGreaterThan(0);
    expect(screen.getByText('1 đã chọn')).toBeTruthy();
    expect(screen.getByText('Dịch')).toBeTruthy();
  });

  it('searches by number and title', () => {
    render(
      <ChapterNavigator
        projectId="p1"
        chapters={makeChapters(20)}
        chapterIndex={0}
        selectedChapterIds={new Set()}
        busy={false}
        collapsed={false}
        {...noop}
      />,
    );
    const input = screen.getByPlaceholderText('Tìm chương...');
    fireEvent.change(input, { target: { value: 'Mở đầu' } });
    expect(screen.getByText(/Mở đầu/)).toBeTruthy();
    fireEvent.change(input, { target: { value: '9999' } });
    expect(screen.queryByText(/Mở đầu/)).toBeNull();
  });

  it('Ctrl+click selects without opening the chapter', () => {
    const onSelectChapter = vi.fn();
    const onToggleSelect = vi.fn();
    render(
      <ChapterNavigator
        projectId="p1"
        chapters={makeChapters(8)}
        chapterIndex={0}
        selectedChapterIds={new Set()}
        busy={false}
        collapsed={false}
        {...noop}
        onSelectChapter={onSelectChapter}
        onToggleSelect={onToggleSelect}
      />,
    );
    const openButtons = screen.getAllByRole('button').filter((el) => el.classList.contains('chapter-item-open'));
    fireEvent.click(openButtons[1], { ctrlKey: true });
    expect(onToggleSelect).toHaveBeenCalled();
    expect(onSelectChapter).not.toHaveBeenCalled();
  });

  it('restores persisted scroll for the project', async () => {
    useTranslationWorkspaceStore.getState().setChapterListScroll('p1', 180);
    const { container } = render(
      <ChapterNavigator
        projectId="p1"
        chapters={makeChapters(200)}
        chapterIndex={0}
        selectedChapterIds={new Set()}
        busy={false}
        collapsed={false}
        {...noop}
      />,
    );
    const list = container.querySelector('.chapter-nav-list');
    await waitFor(() => {
      expect(list?.scrollTop).toBe(180);
    });
  });
});
