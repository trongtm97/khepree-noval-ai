import { useMemo, useRef, useState } from 'react';
import type { ChapterSummaryDto } from '@shared/schemas/translation-pack';
import { MoreHorizontal, PanelLeft, PanelLeftClose } from 'lucide-react';
import type { NovelExportFormat } from '@shared/constants/portability';
import type { ChapterCopyMode } from '@shared/utils/chapter-export-text';
import { useT } from '../../i18n';
import { DropdownMenu } from '../overlay';
import { Button, IconButton, Input } from '../ui';
import { chapterSourceIcon, chapterSourceTooltip } from '../../utils/chapter-source-ui';
import { chapterLabel } from './chapter-utils';

interface ChapterNavigatorProps {
  chapters: ChapterSummaryDto[];
  chapterIndex: number;
  selectedChapterIds: Set<string>;
  busy: boolean;
  collapsed: boolean;
  onToggleCollapse: () => void;
  onSelectChapter: (index: number) => void;
  onToggleSelect: (index: number, shiftKey: boolean) => void;
  onSelectAll: () => void;
  onClearSelection: () => void;
  onChapterCopy: (chapterId: string, mode: ChapterCopyMode) => void;
  onChapterExport: (chapterId: string, format: Extract<NovelExportFormat, 'txt' | 'docx'>) => void;
  onChapterRetranslate: (chapterId: string) => void;
}

interface ChapterRowProps {
  ch: ChapterSummaryDto;
  idx: number;
  chapterIndex: number;
  isSelected: boolean;
  menuOpen: boolean;
  onMenuOpenChange: (open: boolean) => void;
  onSelectChapter: (index: number) => void;
  onToggleSelect: (index: number, shiftKey: boolean) => void;
  onChapterCopy: (chapterId: string, mode: ChapterCopyMode) => void;
  onChapterExport: (chapterId: string, format: Extract<NovelExportFormat, 'txt' | 'docx'>) => void;
  onChapterRetranslate: (chapterId: string) => void;
}

function ChapterRow({
  ch,
  idx,
  chapterIndex,
  isSelected,
  menuOpen,
  onMenuOpenChange,
  onSelectChapter,
  onToggleSelect,
  onChapterCopy,
  onChapterExport,
  onChapterRetranslate,
}: ChapterRowProps) {
  const t = useT();
  const menuTriggerRef = useRef<HTMLButtonElement>(null);

  return (
    <div
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
        </DropdownMenu>
      </div>
    </div>
  );
}

export function ChapterNavigator({
  chapters,
  chapterIndex,
  selectedChapterIds,
  busy,
  collapsed,
  onToggleCollapse,
  onSelectChapter,
  onToggleSelect,
  onSelectAll,
  onClearSelection,
  onChapterCopy,
  onChapterExport,
  onChapterRetranslate,
}: ChapterNavigatorProps) {
  const t = useT();
  const selectedCount = selectedChapterIds.size;
  const selectionActive = selectedCount > 0;
  const [filter, setFilter] = useState('');
  const [headerMenuOpen, setHeaderMenuOpen] = useState(false);
  const [menuIdx, setMenuIdx] = useState<number | null>(null);
  const headerMenuTriggerRef = useRef<HTMLButtonElement>(null);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return chapters.map((ch, idx) => ({ ch, idx }));
    return chapters
      .map((ch, idx) => ({ ch, idx }))
      .filter(({ ch }) => {
        const label = chapterLabel(ch).toLowerCase();
        return label.includes(q) || (ch.title?.toLowerCase().includes(q) ?? false);
      });
  }, [chapters, filter]);

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
    <aside className="translation-chapters" aria-label={t('translation.chapters')}>
      <div className="chapter-nav-header chapter-nav-header--compact">
        <span className="chapter-nav-title">{t('translation.chapters')}</span>
        <Input
          type="search"
          className="chapter-nav-search"
          placeholder={t('actions.search')}
          value={filter}
          onChange={(e) => {
            setFilter(e.target.value);
          }}
        />
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
            maxHeight={200}
          >
            <button type="button" role="menuitem" disabled={busy || chapters.length === 0} onClick={() => { setHeaderMenuOpen(false); onSelectAll(); }}>
              {t('translation.selectAllChapters')}
            </button>
            <button type="button" role="menuitem" disabled={busy || selectedCount === 0} onClick={() => { setHeaderMenuOpen(false); onClearSelection(); }}>
              {t('translation.clearChapterSelection')}
            </button>
          </DropdownMenu>
        </div>
      </div>

      {selectionActive ? (
        <div className="chapter-nav-selection-bar" role="status">
          <span>{t('translation.chaptersSelected', { count: String(selectedCount) })}</span>
          <Button size="sm" disabled={busy} onClick={onSelectAll}>
            {t('translation.selectAllChapters')}
          </Button>
          <Button size="sm" disabled={busy} onClick={onClearSelection}>
            {t('translation.clearChapterSelection')}
          </Button>
        </div>
      ) : null}

      {chapters.length === 0 ? (
        <p className="chapter-nav-empty muted">{t('translation.noChapters')}</p>
      ) : (
        <div className="chapter-nav-list">
          {filtered.map(({ ch, idx }) => (
            <ChapterRow
              key={ch.id}
              ch={ch}
              idx={idx}
              chapterIndex={chapterIndex}
              isSelected={selectedChapterIds.has(ch.id)}
              menuOpen={menuIdx === idx}
              onMenuOpenChange={(open) => {
                setMenuIdx(open ? idx : null);
              }}
              onSelectChapter={onSelectChapter}
              onToggleSelect={onToggleSelect}
              onChapterCopy={onChapterCopy}
              onChapterExport={onChapterExport}
              onChapterRetranslate={onChapterRetranslate}
            />
          ))}
        </div>
      )}
    </aside>
  );
}
