import type { ChapterSummaryDto } from '@shared/schemas/translation-pack';
import { useT } from '../../i18n';
import { Button } from '../ui';
import { chapterSourceIcon, chapterSourceTooltip } from '../../utils/chapter-source-ui';
import { chapterLabel } from './chapter-utils';

interface ChapterNavigatorProps {
  chapters: ChapterSummaryDto[];
  chapterIndex: number;
  selectedChapterIds: Set<string>;
  busy: boolean;
  onSelectChapter: (index: number) => void;
  onToggleSelect: (index: number, shiftKey: boolean) => void;
  onSelectAll: () => void;
  onClearSelection: () => void;
}

export function ChapterNavigator({
  chapters,
  chapterIndex,
  selectedChapterIds,
  busy,
  onSelectChapter,
  onToggleSelect,
  onSelectAll,
  onClearSelection,
}: ChapterNavigatorProps) {
  const t = useT();
  const selectedCount = selectedChapterIds.size;

  return (
    <aside className="translation-chapters" aria-label={t('translation.chapters')}>
      <div className="chapter-nav-header">
        <span>{t('translation.chapters')}</span>
        {chapters.length > 0 ? (
          <>
            <Button size="sm" disabled={busy} onClick={onSelectAll}>
              {t('translation.selectAllChapters')}
            </Button>
            <Button size="sm" disabled={busy || selectedCount === 0} onClick={onClearSelection}>
              {t('translation.clearChapterSelection')}
            </Button>
          </>
        ) : null}
      </div>
      {chapters.length === 0 ? (
        <p className="muted" style={{ padding: '0.75rem' }}>
          {t('translation.noChapters')}
        </p>
      ) : (
        chapters.map((ch, idx) => {
          const isSelected = selectedChapterIds.has(ch.id);
          return (
            <div
              key={ch.id}
              className={`chapter-item ${idx === chapterIndex ? 'active' : ''} ${isSelected ? 'selected' : ''}`}
            >
              <input
                type="checkbox"
                className="chapter-item-check"
                checked={isSelected}
                aria-label={chapterLabel(ch)}
                onChange={() => undefined}
                onClick={(event) => {
                  event.stopPropagation();
                  onToggleSelect(idx, event.shiftKey);
                }}
              />
              <button
                type="button"
                className="chapter-item-open"
                onClick={() => {
                  onSelectChapter(idx);
                }}
              >
                <span aria-hidden title={chapterSourceTooltip(ch.sourceStatus)}>
                  {chapterSourceIcon(ch.sourceStatus)}
                </span>
                {chapterLabel(ch)}
                {ch.title ? ` · ${ch.title}` : ''}
              </button>
            </div>
          );
        })
      )}
    </aside>
  );
}
