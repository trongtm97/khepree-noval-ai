/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { EditorParagraphDto } from '../../../src/shared/schemas/translation-editor';
import { EditorParagraphRow } from '../../../src/renderer/components/editor/EditorParagraphRow';
import { useUiShellStore } from '../../../src/renderer/stores/ui-shell-store';
import { useLocaleStore } from '../../../src/renderer/i18n';

function uuidFor(n: number): string {
  return `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
}

function makeParagraph(overrides: Partial<EditorParagraphDto> = {}): EditorParagraphDto {
  return {
    id: uuidFor(1),
    stableParagraphId: '[C000001:P000001]',
    sequence: 1,
    sourceText: '短句',
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

function renderRow(
  overrides: Partial<EditorParagraphDto> = {},
  extras: {
    draftText?: string;
    isActive?: boolean;
    isDirty?: boolean;
    sourceDirection?: 'ltr' | 'rtl';
    targetDirection?: 'ltr' | 'rtl';
    onDraftChange?: (id: string, text: string, previous: string) => void;
    searchHighlight?: { side: 'source' | 'translation'; start: number; end: number } | null;
  } = {},
) {
  const paragraph = makeParagraph(overrides);
  const onSelect = vi.fn();
  const onDraftChange = extras.onDraftChange ?? vi.fn();
  const view = render(
    <EditorParagraphRow
      paragraph={paragraph}
      draftText={extras.draftText ?? paragraph.translatedText ?? ''}
      isActive={extras.isActive ?? false}
      isDirty={extras.isDirty ?? false}
      searchHighlight={extras.searchHighlight ?? null}
      sourceDirection={extras.sourceDirection ?? 'ltr'}
      targetDirection={extras.targetDirection ?? 'ltr'}
      onSelect={onSelect}
      onDraftChange={onDraftChange}
    />,
  );
  return { ...view, paragraph, onSelect, onDraftChange };
}

describe('EditorParagraphRow', () => {
  beforeEach(() => {
    useLocaleStore.setState({ locale: 'vi' });
    useUiShellStore.setState({ showParagraphIds: false, showAdvancedTools: false });
    Object.defineProperty(HTMLTextAreaElement.prototype, 'scrollHeight', {
      configurable: true,
      get(this: HTMLTextAreaElement) {
        const lines = Math.max(2, this.value.split('\n').length + Math.ceil(this.value.length / 24));
        return lines * 27;
      },
    });
  });

  afterEach(() => {
    cleanup();
  });

  it('hides stable paragraph IDs by default but keeps data attribute', () => {
    const { container } = renderRow();
    expect(container.querySelector('[data-paragraph-id="[C000001:P000001]"]')).not.toBeNull();
    expect(container.querySelector('.editor-row-id')).toBeNull();
    expect(container.textContent).not.toContain('[C000001:P000001]');
  });

  it('shows paragraph IDs when the advanced setting is on', () => {
    useUiShellStore.setState({ showParagraphIds: true });
    renderRow();
    expect(screen.getByText('[C000001:P000001]')).toBeTruthy();
  });

  it('does not reserve a metadata line for version source', () => {
    const { container } = renderRow();
    expect(container.textContent).not.toContain('AI_INITIAL');
    expect(container.querySelector('.editor-row-meta')).toBeNull();
  });

  it('shows QA, locked, and unsaved markers only when relevant', () => {
    const { rerender, onSelect, onDraftChange } = renderRow();
    expect(screen.queryByText('KTCL')).toBeNull();
    expect(screen.queryByText('Khóa')).toBeNull();
    expect(screen.queryByText('Chưa lưu')).toBeNull();

    rerender(
      <EditorParagraphRow
        paragraph={makeParagraph({
          status: 'qa_warning',
          qaWarnings: ['length'],
          humanLocked: true,
        })}
        draftText=""
        isActive={false}
        isDirty
        onSelect={onSelect}
        onDraftChange={onDraftChange}
      />,
    );
    expect(screen.getByText('KTCL')).toBeTruthy();
    expect(screen.getByText('Khóa')).toBeTruthy();
    expect(screen.getByText('Chưa lưu')).toBeTruthy();
  });

  it('uses a lightweight empty-target placeholder', () => {
    renderRow({}, { draftText: '' });
    const textarea = screen.getByRole('textbox');
    expect(textarea.getAttribute('placeholder')).toBe('Chưa dịch');
    expect(textarea.getAttribute('rows')).not.toBe('3');
  });

  it('grows and shrinks with translation content', () => {
    const { rerender, onSelect, onDraftChange, paragraph } = renderRow({}, { draftText: '' });
    const textarea = screen.getByRole('textbox');
    const emptyHeight = parseFloat(textarea.style.height || '0');

    rerender(
      <EditorParagraphRow
        paragraph={paragraph}
        draftText={'dịch\n'.repeat(12)}
        isActive
        isDirty
        onSelect={onSelect}
        onDraftChange={onDraftChange}
      />,
    );
    const grown = parseFloat(screen.getByRole('textbox').style.height || '0');
    expect(grown).toBeGreaterThan(emptyHeight);

    rerender(
      <EditorParagraphRow
        paragraph={paragraph}
        draftText=""
        isActive
        isDirty={false}
        onSelect={onSelect}
        onDraftChange={onDraftChange}
      />,
    );
    const shrunk = parseFloat(screen.getByRole('textbox').style.height || '0');
    expect(shrunk).toBeLessThan(grown);
  });

  it('keeps independent RTL directions on source and target', () => {
    const { container } = renderRow(
      { sourceText: 'مرحبا' },
      { draftText: 'Xin chào', sourceDirection: 'rtl', targetDirection: 'ltr' },
    );
    expect(container.querySelector('.editor-col--source')?.getAttribute('dir')).toBe('rtl');
    expect(screen.getByRole('textbox').getAttribute('dir')).toBe('ltr');

    cleanup();
    const next = renderRow(
      { sourceText: 'Hello' },
      { draftText: 'مرحبا', sourceDirection: 'ltr', targetDirection: 'rtl' },
    );
    expect(next.container.querySelector('.editor-col--source')?.getAttribute('dir')).toBe('ltr');
    expect(screen.getByRole('textbox').getAttribute('dir')).toBe('rtl');
  });

  it('keeps search highlighting on source text', () => {
    const { container } = renderRow(
      { sourceText: '走进青云门' },
      { searchHighlight: { side: 'source', start: 2, end: 5 } },
    );
    expect(container.querySelector('.editor-search-hit')?.textContent).toBe('青云门');
  });

  it('records previous draft text for undo on edit', () => {
    const onDraftChange = vi.fn();
    renderRow({ translatedText: 'cũ' }, { draftText: 'cũ', onDraftChange });
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'mới' } });
    expect(onDraftChange).toHaveBeenCalledWith('[C000001:P000001]', 'mới', 'cũ');
  });

  it('exposes version history through the paragraph menu', () => {
    const onOpenVersionHistory = vi.fn();
    const paragraph = makeParagraph();
    render(
      <EditorParagraphRow
        paragraph={paragraph}
        draftText=""
        isActive
        isDirty={false}
        onSelect={vi.fn()}
        onDraftChange={vi.fn()}
        onOpenVersionHistory={onOpenVersionHistory}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Thao tác đoạn' }));
    fireEvent.click(screen.getByRole('menuitem', { name: /Lịch sử phiên bản/i }));
    expect(onOpenVersionHistory).toHaveBeenCalledWith('[C000001:P000001]');
  });

  it('renders long source without a fixed rows=3 target box', () => {
    renderRow({ sourceText: '字'.repeat(400) }, { draftText: 'Ngắn' });
    const textarea = screen.getByRole('textbox');
    expect(textarea.getAttribute('rows')).toBe('1');
    expect(screen.getByText('字'.repeat(400))).toBeTruthy();
  });
});
