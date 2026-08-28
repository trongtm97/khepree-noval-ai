import { memo, useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { ChapterSummaryDto } from '@shared/schemas/translation-pack';
import { Filter, MoreHorizontal, PanelLeft, PanelLeftClose } from 'lucide-react';
import type { NovelExportFormat } from '@shared/constants/portability';
import type { ChapterCopyMode } from '@shared/utils/chapter-export-text';
import type { ChapterDisplayStatus } from '../../features/project-chapters/chapter-display-status';
import { useT } from '../../i18n';
import { useTranslationWorkspaceStore } from '../../stores/translation-workspace-store';
import {
  CHAPTER_FILTER_LABEL_KEY,
  CHAPTER_NAV_FILTERS,
  CHAPTER_NAV_OVERSCAN,
  CHAPTER_NAV_ROW_HEIGHT,
  CHAPTER_STATUS_GLYPH,
  CHAPTER_STATUS_TOOLTIP_KEY,
  EMPTY_TRANSLATING,
  currentChapterCountLabel,
  filterChapterEntries,
  type ChapterNavFilter,
} from '../../utils/chapter-navigator';
import { DropdownMenu } from '../overlay';
import { Button, IconButton, SearchInput } from '../ui';
import { chapterLabel } from './chapter-utils';

interface ChapterNavigatorProps {
  projectId: string;
  chapters: ChapterSummaryDto[];
  chapterIndex: number;
  selectedChapterIds: Set<string>;
  translatingNumbers?: ReadonlySet<number>;
  busy: boolean;
  collapsed: boolean;
  onToggleCollapse: () => void;
  onSelectChapter: (index: number) => void;
  onToggleSelect: (index: number, shiftKey: boolean) => void;
  onSelectAll: () => void;
  onClearSelection: () => void;
  onTranslateSelected: () => void;
  onExportSelected: () => void;
  onChapterCopy: (chapterId: string, mode: ChapterCopyMode) => void;
  onChapterExport: (chapterId: string, format: Extract<NovelExportFormat, 'txt' | 'docx'>) => void;
  onChapterRetranslate: (chapterId: string) => void;
  onOpenExportDirectory?: () => void;
  onNextUntranslated?: () => void;
  onNextIssue?: () => void;
}

interface ChapterRowProps {
  ch: ChapterSummaryDto;
  idx: number;
  status: ChapterDisplayStatus;
  isActive: boolean;
  isSelected: boolean;
  showCheckbox: boolean;
  menuOpen: boolean;
  onMenuOpenChange: (open: boolean) => void;
  onSelectChapter: (index: number) => void;
  onToggleSelect: (index: number, shiftKey: boolean) => void;
  onChapterCopy: (chapterId: string, mode: ChapterCopyMode) => void;
  onChapterExport: (chapterId: string, format: Extract<NovelExportFormat, 'txt' | 'docx'>) => void;
  onChapterRetranslate: (chapterId: string) => void;
  onOpenExportDirectory?: () => void;
}

const ChapterRow = memo(function ChapterRow({
  ch,
  idx,
  status,
  isActive,
  isSelected,
  showCheckbox,
  menuOpen,
  onMenuOpenChange,
  onSelectChapter,
  onToggleSelect,
  onChapterCopy,
  onChapterExport,
  onChapterRetranslate,
  onOpenExportDirectory,
}: ChapterRowProps) {
  const t = useT();
  const menuTriggerRef = useRef<HTMLButtonElement>(null);
  const tooltip = t(CHAPTER_STATUS_TOOLTIP_KEY[status]);

  return (
    <div
      className={`chapter-item ${isActive ? 'active' : ''} ${isSelected ? 'selected' : ''}`}
      data-chapter-id={ch.id}
      data-chapter-index={idx}
    >
      {showCheckbox ? (
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
      ) : null}
      <button
        type="button"
        className="chapter-item-open"
        onClick={(event) => {
          if (event.shiftKey || event.ctrlKey || event.metaKey) {
            event.preventDefault();
            onToggleSelect(idx, event.shiftKey);
            return;
          }
          onSelectChapter(idx);
        }}
      >
        <span
          className={`chapter-status chapter-status--${status}`}
          title={tooltip}
          aria-label={tooltip}
        >
          {CHAPTER_STATUS_GLYPH[status]}
        </span>
        <span className="chapter-item-label">
          {chapterLabel(ch)}
          {ch.title ? ` · ${ch.title}` : ''}
        </span>
      </button>
      <div className="chapter-item-menu">
        <IconButton
          ref={menuTriggerRef}
          label={t('translation.chapterRowMenu')}
          active={menuOpen}
          className="chapter-item-menu-btn"
          onClick={() => {
            onMenuOpenChange(!menuOpen);
          }}
        >
          <MoreHorizontal size={16} />
        </IconButton>
        <DropdownMenu
          open={menuOpen}
          onOpenChange={onMenuOpenChange}
          anchorRef={menuTriggerRef}
          className="translation-menu"
          placement="bottom-end"
          minWidth={220}
          maxHeight={280}
        >
          <button type="button" role="menuitem" onClick={() => { onMenuOpenChange(false); onSelectChapter(idx); }}>
            {t('translation.openChapter')}
          </button>
          <button type="button" role="menuitem" onClick={() => { onMenuOpenChange(false); onChapterCopy(ch.id, 'translation'); }}>
            {t('translation.copyTranslation')}
          </button>
          <button type="button" role="menuitem" onClick={() => { onMenuOpenChange(false); onChapterExport(ch.id, 'txt'); }}>
            {t('translation.exportTxt')}
          </button>
          <button type="button" role="menuitem" onClick={() => { onMenuOpenChange(false); onChapterExport(ch.id, 'docx'); }}>
            {t('translation.exportDocx')}
          </button>
          <button type="button" role="menuitem" onClick={() => { onMenuOpenChange(false); onChapterRetranslate(ch.id); }}>
            {t('actions.retranslate')}
          </button>
          {onOpenExportDirectory ? (
            <button type="button" role="menuitem" onClick={() => { onMenuOpenChange(false); onOpenExportDirectory(); }}>
              {t('exportDirectory.openExportFolder')}
            </button>
          ) : null}
        </DropdownMenu>
      </div>
    </div>
  );
});

function ChapterNavigatorInner({
  projectId,
  chapters,
  chapterIndex,
  selectedChapterIds,
  translatingNumbers = EMPTY_TRANSLATING,
  busy,
  collapsed,
  onToggleCollapse,
  onSelectChapter,
  onToggleSelect,
  onSelectAll,
  onClearSelection,
  onTranslateSelected,
  onExportSelected,
  onChapterCopy,
  onChapterExport,
  onChapterRetranslate,
  onOpenExportDirectory,
  onNextUntranslated,
  onNextIssue,
}: ChapterNavigatorProps) {
  const t = useT();
  const selectedCount = selectedChapterIds.size;
  const [selectionMode, setSelectionMode] = useState(false);
  const showCheckbox = selectionMode || selectedCount > 0;
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<ChapterNavFilter>('all');
  const [headerMenuOpen, setHeaderMenuOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [menuIdx, setMenuIdx] = useState<number | null>(null);
  const headerMenuTriggerRef = useRef<HTMLButtonElement>(null);
  const filterTriggerRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const saveScrollTimer = useRef<number>(0);

  const filtered = useMemo(
    () => filterChapterEntries(chapters, query, statusFilter, translatingNumbers),
    [chapters, query, statusFilter, translatingNumbers],
  );

  const virtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => listRef.current,
    estimateSize: () => CHAPTER_NAV_ROW_HEIGHT,
    overscan: CHAPTER_NAV_OVERSCAN,
    getItemKey: (index) => filtered[index]?.ch.id ?? index,
  });

  useEffect(() => {
    const el = listRef.current;
    if (!el || !projectId) return;
    const y = useTranslationWorkspaceStore.getState().chapterListScrollByProject[projectId] ?? 0;
    el.scrollTop = y;
  }, [projectId, chapters.length]);

  useEffect(() => {
    const pos = filtered.findIndex((entry) => entry.idx === chapterIndex);
    if (pos < 0) return;
    const frame = requestAnimationFrame(() => {
      virtualizer.scrollToIndex(pos, { align: 'auto' });
    });
    return () => {
      cancelAnimationFrame(frame);
    };
  }, [chapterIndex, filtered, virtualizer]);

  const persistScroll = useCallback(() => {
    const el = listRef.current;
    if (!el || !projectId) return;
    window.clearTimeout(saveScrollTimer.current);
    saveScrollTimer.current = window.setTimeout(() => {
      useTranslationWorkspaceStore.getState().setChapterListScroll(projectId, el.scrollTop);
    }, 120);
  }, [projectId]);

  useEffect(() => {
    return () => {
      window.clearTimeout(saveScrollTimer.current);
    };
  }, []);

  const counts = currentChapterCountLabel(chapters, chapterIndex);

  const handleRailKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== '/') return;
    const target = event.target;
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return;
    event.preventDefault();
    searchRef.current?.focus();
  };

  if (collapsed) {
    return (
      <aside
        className="translation-chapters translation-chapters--collapsed"
        aria-label={t('translation.chapters')}
      >
        <IconButton label={t('translation.expandChapterRail')} onClick={onToggleCollapse}>
          <PanelLeft size={18} />
        </IconButton>
      </aside>
    );
  }

  return (
    <aside
      className="translation-chapters"
      aria-label={t('translation.chapters')}
      onKeyDown={handleRailKeyDown}
    >
      {selectedCount > 0 ? (
        <div className="chapter-nav-selection-bar" role="status">
          <span>{t('translation.chaptersSelected', { count: String(selectedCount) })}</span>
          <Button size="sm" disabled={busy} onClick={onTranslateSelected}>
            {t('translation.chapterNavTranslate')}
          </Button>
          <Button size="sm" disabled={busy} onClick={onExportSelected}>
            {t('actions.export')}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              onClearSelection();
              setSelectionMode(false);
            }}
          >
            {t('actions.cancel')}
          </Button>
        </div>
      ) : (
        <div className="chapter-nav-header chapter-nav-header--compact">
          <span className="chapter-nav-title">
            {t('translation.chapters')}
            {chapters.length > 0 ? (
              <span className="chapter-nav-count">
                {t('translation.chapterCount', { current: counts.current, total: counts.total })}
              </span>
            ) : null}
          </span>
          <SearchInput
            ref={searchRef}
            className="chapter-nav-search"
            placeholder={t('translation.chapterSearchPlaceholder')}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
            }}
            onClear={() => {
              setQuery('');
            }}
          />
          <div className="chapter-nav-header-menu">
            <IconButton
              ref={filterTriggerRef}
              label={t('translation.chapterFilter')}
              active={filterOpen || statusFilter !== 'all'}
              onClick={() => {
                setFilterOpen((v) => !v);
                setHeaderMenuOpen(false);
              }}
            >
              <Filter size={16} />
            </IconButton>
            <DropdownMenu
              open={filterOpen}
              onOpenChange={setFilterOpen}
              anchorRef={filterTriggerRef}
              className="translation-menu"
              placement="bottom-end"
              minWidth={180}
              maxHeight={280}
            >
              {CHAPTER_NAV_FILTERS.map((key) => (
                <button
                  key={key}
                  type="button"
                  role="menuitem"
                  className={statusFilter === key ? 'active' : undefined}
                  onClick={() => {
                    setStatusFilter(key);
                    setFilterOpen(false);
                  }}
                >
                  {t(CHAPTER_FILTER_LABEL_KEY[key])}
                </button>
              ))}
            </DropdownMenu>
          </div>
          <IconButton label={t('translation.collapseChapterRail')} onClick={onToggleCollapse}>
            <PanelLeftClose size={16} />
          </IconButton>
          <div className="chapter-nav-header-menu">
            <IconButton
              ref={headerMenuTriggerRef}
              label={t('translation.chapterListMenu')}
              active={headerMenuOpen}
              onClick={() => {
                setHeaderMenuOpen((v) => !v);
                setFilterOpen(false);
              }}
            >
              <MoreHorizontal size={16} />
            </IconButton>
            <DropdownMenu
              open={headerMenuOpen}
              onOpenChange={setHeaderMenuOpen}
              anchorRef={headerMenuTriggerRef}
              className="translation-menu"
              placement="bottom-end"
              minWidth={220}
              maxHeight={280}
            >
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setHeaderMenuOpen(false);
                  setSelectionMode(true);
                }}
              >
                {t('translation.chapterSelectMultiple')}
              </button>
              <button
                type="button"
                role="menuitem"
                disabled={busy || chapters.length === 0}
                onClick={() => {
                  setHeaderMenuOpen(false);
                  setSelectionMode(true);
                  onSelectAll();
                }}
              >
                {t('translation.selectAllChapters')}
              </button>
              {onNextUntranslated ? (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setHeaderMenuOpen(false);
                    onNextUntranslated();
                  }}
                >
                  {t('translation.nextUntranslated')}
                </button>
              ) : null}
              {onNextIssue ? (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setHeaderMenuOpen(false);
                    onNextIssue();
                  }}
                >
                  {t('translation.nextIssue')}
                </button>
              ) : null}
            </DropdownMenu>
          </div>
        </div>
      )}

      {statusFilter !== 'all' && selectedCount === 0 ? (
        <button
          type="button"
          className="chapter-nav-filter-chip"
          onClick={() => {
            setStatusFilter('all');
          }}
        >
          {t(CHAPTER_FILTER_LABEL_KEY[statusFilter])} ×
        </button>
      ) : null}

      {chapters.length === 0 ? (
        <p className="chapter-nav-empty muted">{t('translation.noChapters')}</p>
      ) : (
        <div
          ref={listRef}
          className="chapter-nav-list"
          onScroll={persistScroll}
        >
          <div
            className="chapter-nav-list-inner"
            style={{
              height: virtualizer.getTotalSize(),
              position: 'relative',
              width: '100%',
            }}
          >
            {virtualizer.getVirtualItems().map((virtualRow) => {
              const entry = filtered[virtualRow.index];
              return (
                <div
                  key={virtualRow.key}
                  data-index={virtualRow.index}
                  ref={virtualizer.measureElement}
                  className="chapter-nav-virtual-row"
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: `${virtualRow.size}px`,
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                >
                  <ChapterRow
                    ch={entry.ch}
                    idx={entry.idx}
                    status={entry.status}
                    isActive={entry.idx === chapterIndex}
                    isSelected={selectedChapterIds.has(entry.ch.id)}
                    showCheckbox={showCheckbox}
                    menuOpen={menuIdx === entry.idx}
                    onMenuOpenChange={(open) => {
                      setMenuIdx(open ? entry.idx : null);
                    }}
                    onSelectChapter={onSelectChapter}
                    onToggleSelect={onToggleSelect}
                    onChapterCopy={onChapterCopy}
                    onChapterExport={onChapterExport}
                    onChapterRetranslate={onChapterRetranslate}
                    onOpenExportDirectory={onOpenExportDirectory}
                  />
                </div>
              );
            })}
          </div>
        </div>
      )}
    </aside>
  );
}

export const ChapterNavigator = memo(ChapterNavigatorInner);
ChapterNavigator.displayName = 'ChapterNavigator';
