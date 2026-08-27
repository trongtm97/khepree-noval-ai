import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { EditorParagraphDto } from '@shared/schemas/translation-editor';
import type { TextDirection } from '@shared/constants/language-profile';
import { EDITOR_OVERSCAN, EDITOR_ROW_HEIGHT } from '@shared/constants/translation-editor';
import { computeVirtualWindow } from '../../utils/virtual-window';
import { EditorParagraphRow } from './EditorParagraphRow';

interface EditorVirtualListProps {
  paragraphs: EditorParagraphDto[];
  activeParagraphId: string | null;
  dirty: Record<string, string>;
  searchMatchIndex: number | null;
  searchMatches: {
    paragraphIndex: number;
    stableParagraphId: string;
    side: 'source' | 'translation';
    start: number;
    end: number;
  }[];
  sourceDirection?: TextDirection;
  targetDirection?: TextDirection;
  onSelect: (stableId: string) => void;
  onDraftChange: (stableId: string, text: string, previous: string) => void;
}

export function EditorVirtualList({
  paragraphs,
  activeParagraphId,
  dirty,
  searchMatchIndex,
  searchMatches,
  sourceDirection = 'ltr',
  targetDirection = 'ltr',
  onSelect,
  onDraftChange,
}: EditorVirtualListProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const rowRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(600);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setViewportHeight(el.clientHeight);
    });
    ro.observe(el);
    setViewportHeight(el.clientHeight);
    return () => {
      ro.disconnect();
    };
  }, []);

  useEffect(() => {
    if (!activeParagraphId) return;
    const el = rowRefs.current.get(activeParagraphId);
    el?.scrollIntoView({ block: 'nearest' });
  }, [activeParagraphId]);

  const windowRange = useMemo(
    () =>
      computeVirtualWindow(
        scrollTop,
        viewportHeight,
        paragraphs.length,
        EDITOR_ROW_HEIGHT,
        EDITOR_OVERSCAN,
      ),
    [scrollTop, viewportHeight, paragraphs.length],
  );

  const visible = useMemo(() => {
    if (windowRange.endIndex < windowRange.startIndex) return [];
    const items: { paragraph: EditorParagraphDto; index: number }[] = [];
    for (let i = windowRange.startIndex; i <= windowRange.endIndex; i += 1) {
      items.push({ paragraph: paragraphs[i], index: i });
    }
    return items;
  }, [paragraphs, windowRange.endIndex, windowRange.startIndex]);

  const currentSearchHighlight = useMemo(() => {
    if (searchMatchIndex == null) return null;
    return searchMatches[searchMatchIndex] ?? null;
  }, [searchMatchIndex, searchMatches]);

  const setRowRef = useCallback((stableId: string, el: HTMLDivElement | null) => {
    if (el) rowRefs.current.set(stableId, el);
    else rowRefs.current.delete(stableId);
  }, []);

  return (
    <div
      ref={containerRef}
      className="editor-scroll"
      onScroll={(event) => {
        setScrollTop(event.currentTarget.scrollTop);
      }}
    >
      <div className="editor-scroll-inner" style={{ height: windowRange.totalHeight }}>
        <div style={{ transform: `translateY(${windowRange.offsetY}px)` }}>
          {visible.map(({ paragraph }) => {
            const draftText =
              (dirty[paragraph.stableParagraphId] ?? paragraph.translatedText) || '';
            const highlight =
              currentSearchHighlight?.stableParagraphId === paragraph.stableParagraphId
                ? {
                    side: currentSearchHighlight.side,
                    start: currentSearchHighlight.start,
                    end: currentSearchHighlight.end,
                  }
                : null;
            return (
              <div key={paragraph.stableParagraphId} style={{ height: EDITOR_ROW_HEIGHT }}>
                <EditorParagraphRow
                  paragraph={paragraph}
                  draftText={draftText}
                  isActive={activeParagraphId === paragraph.stableParagraphId}
                  searchHighlight={highlight}
                  sourceDirection={sourceDirection}
                  targetDirection={targetDirection}
                  onSelect={onSelect}
                  onDraftChange={onDraftChange}
                  rowRef={(el) => {
                    setRowRef(paragraph.stableParagraphId, el);
                  }}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
