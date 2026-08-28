import { useEffect, useMemo, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { EditorParagraphDto } from '@shared/schemas/translation-editor';
import type { TextDirection } from '@shared/constants/language-profile';
import { EDITOR_OVERSCAN, EDITOR_ROW_HEIGHT } from '@shared/constants/translation-editor';
import {
  estimateEditorRowHeight,
  resolveDraftText,
  shouldScrollActiveRow,
} from '../../utils/editor-virtual';
import { EditorParagraphRow } from './EditorParagraphRow';

interface EditorVirtualListProps {
  chapterId: string;
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
  readingMode?: boolean;
  sourceDirection?: TextDirection;
  targetDirection?: TextDirection;
  onSelect: (stableId: string) => void;
  onDraftChange: (stableId: string, text: string, previous: string) => void;
  onOpenVersionHistory?: (stableId: string) => void;
  onRetranslateParagraph?: (stableId: string) => void;
  onTermClick?: (termId: string) => void;
}

export function EditorVirtualList({
  chapterId,
  paragraphs,
  activeParagraphId,
  dirty,
  searchMatchIndex,
  searchMatches,
  readingMode = false,
  sourceDirection = 'ltr',
  targetDirection = 'ltr',
  onSelect,
  onDraftChange,
  onOpenVersionHistory,
  onRetranslateParagraph,
  onTermClick,
}: EditorVirtualListProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const paragraphsRef = useRef(paragraphs);
  paragraphsRef.current = paragraphs;
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;

  const idToIndex = useMemo(() => {
    const map = new Map<string, number>();
    for (let i = 0; i < paragraphs.length; i += 1) {
      map.set(paragraphs[i].stableParagraphId, i);
    }
    return map;
  }, [paragraphs]);

  const virtualizer = useVirtualizer({
    count: paragraphs.length,
    getScrollElement: () => containerRef.current,
    estimateSize: (index) => {
      const list = paragraphsRef.current;
      if (index < 0 || index >= list.length) return EDITOR_ROW_HEIGHT;
      const paragraph = list[index];
      const target = resolveDraftText(
        dirtyRef.current,
        paragraph.stableParagraphId,
        paragraph.translatedText,
      );
      return estimateEditorRowHeight(paragraph.sourceText, target);
    },
    overscan: EDITOR_OVERSCAN,
    getItemKey: (index) => {
      const list = paragraphsRef.current;
      if (index < 0 || index >= list.length) return index;
      return list[index].stableParagraphId;
    },
    useFlushSync: false,
  });

  const currentSearchHighlight = useMemo(() => {
    if (searchMatchIndex == null) return null;
    return searchMatches[searchMatchIndex] ?? null;
  }, [searchMatchIndex, searchMatches]);

  useEffect(() => {
    if (!activeParagraphId) return;
    const index = idToIndex.get(activeParagraphId);
    if (index == null) return;
    const frame = requestAnimationFrame(() => {
      const cache = virtualizer.measurementsCache;
      if (index < cache.length) {
        const measurement = cache[index];
        const scrollTop = virtualizer.scrollOffset ?? containerRef.current?.scrollTop ?? 0;
        const viewportHeight =
          virtualizer.scrollRect?.height ?? containerRef.current?.clientHeight ?? 0;
        if (!shouldScrollActiveRow(measurement.start, measurement.end, scrollTop, viewportHeight)) {
          return;
        }
      }
      virtualizer.scrollToIndex(index, { align: 'auto' });
    });
    return () => {
      cancelAnimationFrame(frame);
    };
  }, [activeParagraphId, searchMatchIndex, idToIndex, virtualizer, chapterId]);

  const virtualItems = virtualizer.getVirtualItems();

  return (
    <div ref={containerRef} className="editor-scroll">
      <div
        className="editor-scroll-inner"
        style={{
          height: virtualizer.getTotalSize(),
          position: 'relative',
          width: '100%',
        }}
      >
        {virtualItems.map((virtualRow) => {
          if (virtualRow.index < 0 || virtualRow.index >= paragraphs.length) return null;
          const paragraph = paragraphs[virtualRow.index];
          const draftText = resolveDraftText(
            dirty,
            paragraph.stableParagraphId,
            paragraph.translatedText,
          );
          const highlight =
            currentSearchHighlight?.stableParagraphId === paragraph.stableParagraphId
              ? {
                  side: currentSearchHighlight.side,
                  start: currentSearchHighlight.start,
                  end: currentSearchHighlight.end,
                }
              : null;
          return (
            <div
              key={virtualRow.key}
              data-index={virtualRow.index}
              ref={virtualizer.measureElement}
              className="editor-virtual-row"
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              <EditorParagraphRow
                paragraph={paragraph}
                draftText={draftText}
                isActive={activeParagraphId === paragraph.stableParagraphId}
                isDirty={Object.hasOwn(dirty, paragraph.stableParagraphId)}
                readingMode={readingMode}
                searchHighlight={highlight}
                sourceDirection={sourceDirection}
                targetDirection={targetDirection}
                onSelect={onSelect}
                onDraftChange={onDraftChange}
                onOpenVersionHistory={onOpenVersionHistory}
                onRetranslateParagraph={onRetranslateParagraph}
                onTermClick={onTermClick}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
