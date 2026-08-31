/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach } from 'vitest';
import { EditorContextPanel } from '../../../src/renderer/components/editor/EditorContextPanel';
import { useLocaleStore } from '../../../src/renderer/i18n';
import type { EditorContext } from '../../../src/renderer/utils/editor-context-filter';

const empty: EditorContext = {
  characters: [],
  relationships: [],
  terms: [],
  memorySnippet: null,
};

describe('EditorContextPanel', () => {
  beforeEach(() => {
    useLocaleStore.setState({ preference: 'vi' });
  });

  afterEach(() => {
    cleanup();
  });

  it('shows a compact empty message with secondary hint', () => {
    render(<EditorContextPanel context={empty} />);
    expect(screen.getByText('Chưa có ngữ cảnh liên quan cho đoạn này.')).toBeTruthy();
    expect(screen.getByText(/Khepree Novel AI sẽ bổ sung/)).toBeTruthy();
    expect(screen.queryByText('Nhân vật')).toBeNull();
  });

  it('shows tab counts for populated context', () => {
    render(
      <EditorContextPanel
        context={{
          characters: [{ id: 'c1', canonicalName: '林峰', translatedName: 'Lâm Phong', role: null }],
          relationships: [],
          terms: [
            { id: 't1', sourceText: '青云门', translation: 'Thanh Vân Môn', scope: 'project', confidence: null },
            { id: 't2', sourceText: '灵石', translation: 'linh thạch', scope: 'project', confidence: null },
          ],
          memorySnippet: 'note',
        }}
      />,
    );
    expect(screen.getByText('Nhân vật 1')).toBeTruthy();
    expect(screen.getByText('Thuật ngữ 2')).toBeTruthy();
    expect(screen.queryByText('Quan hệ 0')).toBeNull();
  });
});
