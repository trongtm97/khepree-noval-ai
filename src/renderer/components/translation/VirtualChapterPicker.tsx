import { useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { ChapterSummaryDto } from '@shared/schemas/translation-pack';
import { CHAPTER_NAV_OVERSCAN, CHAPTER_NAV_ROW_HEIGHT } from '../../utils/chapter-navigator';
import { chapterLabel } from './chapter-utils';

interface VirtualChapterPickerProps {
  chapters: { ch: ChapterSummaryDto; idx: number }[];
  chapterIndex: number;
  onPick: (index: number) => void;
}

/** Compact virtual list for command-bar chapter picker (10k-safe). */
export function VirtualChapterPicker({
  chapters,
  chapterIndex,
  onPick,
}: VirtualChapterPickerProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: chapters.length,
    getScrollElement: () => listRef.current,
    estimateSize: () => CHAPTER_NAV_ROW_HEIGHT,
    overscan: CHAPTER_NAV_OVERSCAN,
    getItemKey: (index) => chapters[index]?.ch.id ?? index,
  });

  return (
    <div ref={listRef} className="translation-command-bar__menu-scroll chapter-picker-virtual">
      <div
        style={{
          height: virtualizer.getTotalSize(),
          position: 'relative',
          width: '100%',
        }}
      >
        {virtualizer.getVirtualItems().map((row) => {
          const entry = chapters[row.index];
          return (
            <button
              key={row.key}
              type="button"
              role="option"
              aria-selected={entry.idx === chapterIndex}
              className={entry.idx === chapterIndex ? 'active chapter-picker-virtual__item' : 'chapter-picker-virtual__item'}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: `${row.size}px`,
                transform: `translateY(${row.start}px)`,
              }}
              onClick={() => {
                onPick(entry.idx);
              }}
            >
              {chapterLabel(entry.ch)}
              {entry.ch.title ? ` · ${entry.ch.title}` : ''}
            </button>
          );
        })}
      </div>
    </div>
  );
}
