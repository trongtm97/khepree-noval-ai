import { createElement } from 'react';
import { describe, it, expect } from 'vitest';
import { renderToString } from 'react-dom/server';
import { computeVirtualWindow } from '../../../src/renderer/utils/virtual-window';
import { findMatches, applyReplaceAll } from '../../../src/renderer/utils/editor-search';
import { pushUndo, popUndo, popRedo } from '../../../src/renderer/utils/editor-undo';
import { HighlightedSourceText } from '../../../src/renderer/components/editor/HighlightedSourceText';

describe('virtual-window', () => {
  it('returns visible slice with overscan', () => {
    const win = computeVirtualWindow(200, 400, 100, 72, 2);
    expect(win.startIndex).toBe(0);
    expect(win.endIndex).toBeGreaterThan(0);
    expect(win.totalHeight).toBe(7200);
  });

  it('handles empty list', () => {
    const win = computeVirtualWindow(0, 400, 0, 72, 2);
    expect(win.endIndex).toBe(-1);
    expect(win.totalHeight).toBe(0);
  });
});

describe('editor-search', () => {
  const paragraphs = [
    {
      stableParagraphId: '[C1:P1]',
      sourceText: '青云门',
      translatedText: 'Thanh Vân Môn',
    },
    {
      stableParagraphId: '[C1:P2]',
      sourceText: '李逍遥',
      translatedText: 'Lý Tiêu Dao',
    },
  ];

  it('finds matches in source and translation', () => {
    const hits = findMatches(paragraphs, '青云');
    expect(hits).toHaveLength(1);
    expect(hits[0]?.side).toBe('source');
  });

  it('replace all is case-insensitive', () => {
    expect(applyReplaceAll('Hello hello', 'hello', 'X')).toBe('X X');
  });
});

describe('editor-undo', () => {
  it('undo/redo round trip', () => {
    let stacks = pushUndo({ undo: [], redo: [] }, {
      stableParagraphId: '[C1:P1]',
      before: 'A',
      after: 'B',
    });
    const undone = popUndo(stacks);
    expect(undone.entry?.before).toBe('A');
    stacks = undone.stacks;
    const redone = popRedo(stacks);
    expect(redone.entry?.after).toBe('B');
  });
});

describe('HighlightedSourceText (component render)', () => {
  it('renders term mark with title', () => {
    const html = renderToString(
      createElement(HighlightedSourceText, {
        text: '走进青云门',
        highlights: [
          {
            sourceText: '青云门',
            termId: '00000000-0000-4000-8000-000000000001',
            preferredTranslation: 'Thanh Vân Môn',
            termType: 'place',
            scope: 'PROJECT',
            confidence: 0.9,
            startIndex: 2,
            endIndex: 5,
          },
        ],
      }),
    );
    expect(html).toContain('editor-term');
    expect(html).toContain('青云门');
  });
});
