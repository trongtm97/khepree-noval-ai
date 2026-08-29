/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { cleanup, render, waitFor } from '@testing-library/react';
import type { EditorParagraphDto } from '../../../src/shared/schemas/translation-editor';
import { EditorVirtualList } from '../../../src/renderer/components/editor/EditorVirtualList';
import { EDITOR_ROW_HEIGHT } from '../../../src/shared/constants/translation-editor';
import { useUiShellStore } from '../../../src/renderer/stores/ui-shell-store';
import { useLocaleStore } from '../../../src/renderer/i18n';

function uuidFor(n: number): string {
  return `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
}

function makeParagraph(n: number, overrides: Partial<EditorParagraphDto> = {}): EditorParagraphDto {
  const pad = String(n).padStart(6, '0');
  return {
    id: uuidFor(n),
    stableParagraphId: `[C000001:P${pad}]`,
    sequence: n,
    sourceText: `S${n}`,
    translationId: null,
    translatedText: `T${n}`,
    status: 'translated',
    versionSource: null,
    humanLocked: false,
    qaWarnings: [],
    termHighlights: [],
    ...overrides,
  };
}

function rowHeightForIndex(index: number): number {
  return 72 + (index % 5) * 28;
}

function installLayoutMocks() {
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
    configurable: true,
    get(this: HTMLElement) {
      if (this.classList.contains('editor-scroll')) return 600;
      const indexAttr = this.getAttribute('data-index');
      if (indexAttr != null) return rowHeightForIndex(Number(indexAttr));
      return 80;
    },
  });
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', {
    configurable: true,
    get() {
      return 900;
    },
  });
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
    configurable: true,
    get(this: HTMLElement) {
      if (this.classList.contains('editor-scroll')) return 600;
      return 80;
    },
  });
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
    configurable: true,
    get() {
      return 900;
    },
  });
  Object.defineProperty(HTMLElement.prototype, 'scrollHeight', {
    configurable: true,
    get(this: HTMLElement) {
      if (this.classList.contains('editor-scroll')) {
        const inner = this.querySelector('.editor-scroll-inner');
        const fromStyle =
          inner instanceof HTMLElement ? parseFloat(inner.style.height || '0') : 0;
        return Math.max(fromStyle, 600);
      }
      return this.offsetHeight;
    },
  });
  Object.defineProperty(HTMLTextAreaElement.prototype, 'scrollHeight', {
    configurable: true,
    get() {
      return 54;
    },
  });
  HTMLElement.prototype.scrollTo = function scrollToPolyfill(
    this: HTMLElement,
    arg?: ScrollToOptions | number,
    y?: number,
  ) {
    if (typeof arg === 'number') {
      this.scrollLeft = arg;
      this.scrollTop = y ?? 0;
    } else if (arg && typeof arg === 'object') {
      if (arg.left != null) this.scrollLeft = arg.left;
      if (arg.top != null) this.scrollTop = arg.top;
    }
    this.dispatchEvent(new Event('scroll'));
  };
}

class ResizeObserverMock {
  private readonly callback: ResizeObserverCallback;

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
  }

  observe(target: Element) {
    const isScroll = target.classList.contains('editor-scroll');
    const height = isScroll ? 600 : 80;
    this.callback(
      [
        {
          target,
          contentRect: {
            x: 0,
            y: 0,
            top: 0,
            left: 0,
            width: 900,
            height,
            bottom: height,
            right: 900,
            toJSON() {
              return {};
            },
          },
          borderBoxSize: [{ inlineSize: 900, blockSize: height }],
          contentBoxSize: [{ inlineSize: 900, blockSize: height }],
          devicePixelContentBoxSize: [],
        },
      ],
      this,
    );
  }

  unobserve(_target: Element): void {
    return undefined;
  }

  disconnect(): void {
    return undefined;
  }
}

function renderList(
  paragraphs: EditorParagraphDto[],
  extras: {
    chapterId?: string;
    activeParagraphId?: string | null;
    dirty?: Record<string, string>;
    searchMatchIndex?: number | null;
    searchMatches?: {
      paragraphIndex: number;
      stableParagraphId: string;
      side: 'source' | 'translation';
      start: number;
      end: number;
    }[];
    sourceDirection?: 'ltr' | 'rtl';
    targetDirection?: 'ltr' | 'rtl';
  } = {},
) {
  const onSelect = vi.fn();
  const onDraftChange = vi.fn();
  const view = render(
    <div style={{ height: 600 }}>
      <EditorVirtualList
        chapterId={extras.chapterId ?? 'chapter-a'}
        paragraphs={paragraphs}
        activeParagraphId={
          extras.activeParagraphId !== undefined
            ? extras.activeParagraphId
            : paragraphs[0].stableParagraphId
        }
        dirty={extras.dirty ?? {}}
        searchMatchIndex={extras.searchMatchIndex ?? null}
        searchMatches={extras.searchMatches ?? []}
        sourceDirection={extras.sourceDirection ?? 'ltr'}
        targetDirection={extras.targetDirection ?? 'ltr'}
        onSelect={onSelect}
        onDraftChange={onDraftChange}
      />
    </div>,
  );
  return { ...view, onSelect, onDraftChange };
}

function virtualRowBoxes(container: HTMLElement): { start: number; size: number }[] {
  return [...container.querySelectorAll<HTMLElement>('.editor-virtual-row')].map((node) => {
    const match = /translateY\(([-\d.]+)px\)/.exec(node.style.transform);
    const start = Number(match?.[1] ?? 0);
    const index = Number(node.getAttribute('data-index') ?? '0');
    return { start, size: rowHeightForIndex(index) };
  });
}

describe('EditorVirtualList variable height', () => {
  beforeEach(() => {
    useLocaleStore.setState({ preference: 'vi' });
    useUiShellStore.setState({ showParagraphIds: false, showAdvancedTools: false });
    globalThis.ResizeObserver = ResizeObserverMock;
    installLayoutMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('does not use EDITOR_ROW_HEIGHT as the rendered row height', () => {
    const paragraphs = [makeParagraph(1, { sourceText: '字'.repeat(200) })];
    const { container } = renderList(paragraphs);
    const row = container.querySelector('.editor-virtual-row');
    expect(row).toBeInstanceOf(HTMLElement);
    if (!(row instanceof HTMLElement)) {
      throw new Error('expected virtual row');
    }
    expect(row.style.height).not.toBe(`${EDITOR_ROW_HEIGHT}px`);
    expect(row.style.overflow).not.toBe('hidden');
  });

  it.each([10, 500, 2000, 5000])(
    'virtualizes %s paragraphs instead of rendering all',
    (count) => {
      const paragraphs = Array.from({ length: count }, (_, i) => makeParagraph(i + 1));
      const { container } = renderList(paragraphs);
      const mounted = container.querySelectorAll('[data-paragraph-id]').length;
      expect(mounted).toBeGreaterThan(0);
      expect(mounted).toBeLessThanOrEqual(count);
      if (count >= 500) {
        expect(mounted).toBeLessThan(50);
      }
    },
  );

  it('does not overlap variable-height rows', () => {
    const paragraphs = Array.from({ length: 40 }, (_, i) =>
      makeParagraph(i + 1, {
        sourceText: i % 2 === 0 ? '短' : '字'.repeat(120),
        translatedText: i % 3 === 0 ? '' : 'dịch '.repeat(i + 1),
      }),
    );
    const { container } = renderList(paragraphs);
    const starts = virtualRowBoxes(container)
      .map((box) => box.start)
      .sort((a, b) => a - b);
    expect(starts.length).toBeGreaterThan(1);
    expect(new Set(starts).size).toBe(starts.length);
    for (let i = 1; i < starts.length; i += 1) {
      expect(starts[i]).toBeGreaterThan(starts[i - 1]);
    }
  });

  it('scrolls an offscreen search hit into the measured window', async () => {
    const paragraphs = Array.from({ length: 200 }, (_, i) => makeParagraph(i + 1));
    const last = paragraphs[199];
    const { container, rerender, onSelect, onDraftChange } = renderList(paragraphs);
    expect(container.querySelector(`[data-paragraph-id="${last.stableParagraphId}"]`)).toBeNull();

    rerender(
      <div style={{ height: 600 }}>
        <EditorVirtualList
          chapterId="chapter-a"
          paragraphs={paragraphs}
          activeParagraphId={last.stableParagraphId}
          dirty={{}}
          searchMatchIndex={0}
          searchMatches={[
            {
              paragraphIndex: 199,
              stableParagraphId: last.stableParagraphId,
              side: 'source',
              start: 0,
              end: 2,
            },
          ]}
          onSelect={onSelect}
          onDraftChange={onDraftChange}
        />
      </div>,
    );

    await waitFor(() => {
      expect(
        container.querySelector(`[data-paragraph-id="${last.stableParagraphId}"]`),
      ).not.toBeNull();
    });
  });

  it('clears mounted rows when the chapter identity changes', () => {
    const chapterA = Array.from({ length: 30 }, (_, i) => makeParagraph(i + 1));
    const chapterB = Array.from({ length: 8 }, (_, i) =>
      makeParagraph(i + 100, { stableParagraphId: `[C000002:P${String(i + 1).padStart(6, '0')}]` }),
    );
    const { container, rerender, onSelect, onDraftChange } = renderList(chapterA, {
      chapterId: 'chapter-a',
    });
    expect(container.querySelector('[data-paragraph-id="[C000001:P000001]"]')).not.toBeNull();

    rerender(
      <div style={{ height: 600 }}>
        <EditorVirtualList
          chapterId="chapter-b"
          paragraphs={chapterB}
          activeParagraphId={chapterB[0].stableParagraphId}
          dirty={{}}
          searchMatchIndex={null}
          searchMatches={[]}
          onSelect={onSelect}
          onDraftChange={onDraftChange}
        />
      </div>,
    );
    expect(container.querySelector('[data-paragraph-id="[C000001:P000001]"]')).toBeNull();
    expect(container.querySelector('[data-paragraph-id="[C000002:P000001]"]')).not.toBeNull();
  });

  it('preserves RTL on virtualized rows', () => {
    const paragraphs = [makeParagraph(1, { sourceText: 'مرحبا', translatedText: 'Xin chào' })];
    const { container } = renderList(paragraphs, {
      sourceDirection: 'rtl',
      targetDirection: 'ltr',
    });
    expect(container.querySelector('.editor-col--source')?.getAttribute('dir')).toBe('rtl');
    expect(container.querySelector('.editor-textarea')?.getAttribute('dir')).toBe('ltr');
  });
});
