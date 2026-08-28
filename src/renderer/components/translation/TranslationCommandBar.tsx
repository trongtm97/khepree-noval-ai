import { useMemo, useRef, useState } from 'react';
import { ArrowLeft, ChevronDown, Copy, Download, MoreHorizontal } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { ProjectDto } from '@shared/schemas/import';
import type { ChapterSummaryDto } from '@shared/schemas/translation-pack';
import type { JobDto } from '@shared/schemas/job';
import type { ChapterCopyMode } from '@shared/utils/chapter-export-text';
import type { NovelExportFormat } from '@shared/constants/portability';
import { useT } from '../../i18n';
import { DropdownMenu, ListboxPopover } from '../overlay';
import { Button, IconButton } from '../ui';
import { LanguagePairLabel } from '../LanguagePairLabel';
import { TranslationActions } from './TranslationActions';
import { TranslationContextStatus } from './TranslationContextStatus';
import { TranslationJobStrip } from './TranslationJobStrip';
import { TranslationSpreadsheetDialog } from '../TranslationSpreadsheetDialog';
import { chapterLabel } from './chapter-utils';

export interface TranslationCommandBarProps {
  projects: ProjectDto[];
  projectId: string;
  projectTitle: string;
  sourceLanguage: string;
  targetLanguage: string;
  activeEditionId?: string;
  chapters: ChapterSummaryDto[];
  chapterIndex: number;
  chapterNumber: number | null;
  busy: boolean;
  preparing: boolean;
  saveStatus: string;
  selectedCount: number;
  copyDisabled: boolean;
  activeJob: JobDto | null;
  preparingMessage?: string | null;
  onProjectChange: (projectId: string) => void;
  onChapterChange: (index: number) => void;
  onCopy: (mode: ChapterCopyMode) => void;
  onExport: (format: Extract<NovelExportFormat, 'txt' | 'docx'>) => void;
  onExportSelected?: () => void;
  onOpenExportDirectory?: () => void;
  onChangeExportLocation?: () => void;
  onContinue: () => void;
  onTranslateCurrent: () => void;
  onTranslateNext3: () => void;
  onTranslateRemaining: () => void;
  onTranslateRange: (from: number, to: number) => void;
  onClearTranslations: () => void;
  onRetranslate: () => void;
  onToggleFocusMode: () => void;
  onSpreadsheetImported: () => void;
}

export function TranslationCommandBar({
  projects,
  projectId,
  projectTitle,
  sourceLanguage,
  targetLanguage,
  activeEditionId,
  chapters,
  chapterIndex,
  chapterNumber,
  busy,
  preparing,
  saveStatus,
  selectedCount,
  copyDisabled,
  activeJob,
  preparingMessage,
  onProjectChange,
  onChapterChange,
  onCopy,
  onExport,
  onExportSelected,
  onOpenExportDirectory,
  onChangeExportLocation,
  onContinue,
  onTranslateCurrent,
  onTranslateNext3,
  onTranslateRemaining,
  onTranslateRange,
  onClearTranslations,
  onRetranslate,
  onToggleFocusMode,
  onSpreadsheetImported,
}: TranslationCommandBarProps) {
  const t = useT();
  const navigate = useNavigate();
  const [projectOpen, setProjectOpen] = useState(false);
  const [chapterOpen, setChapterOpen] = useState(false);
  const [copyOpen, setCopyOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [chapterFilter, setChapterFilter] = useState('');
  const projectTriggerRef = useRef<HTMLButtonElement>(null);
  const chapterTriggerRef = useRef<HTMLButtonElement>(null);
  const copyAnchorRef = useRef<HTMLDivElement>(null);
  const exportTriggerRef = useRef<HTMLButtonElement>(null);
  const moreTriggerRef = useRef<HTMLButtonElement>(null);

  const filteredChapters = useMemo(() => {
    const q = chapterFilter.trim().toLowerCase();
    if (!q) return chapters.map((ch, idx) => ({ ch, idx }));
    return chapters
      .map((ch, idx) => ({ ch, idx }))
      .filter(({ ch }) => {
        const label = chapterLabel(ch).toLowerCase();
        return label.includes(q) || (ch.title?.toLowerCase().includes(q) ?? false);
      });
  }, [chapters, chapterFilter]);

  const saveLabel =
    saveStatus === 'dirty'
      ? '…'
      : saveStatus === 'saving'
        ? t('common.loading')
        : saveStatus === 'saved'
          ? t('translation.saved')
          : saveStatus === 'error'
            ? t('status.failed')
            : '';

  const closeMenus = () => {
    setProjectOpen(false);
    setChapterOpen(false);
    setCopyOpen(false);
    setExportOpen(false);
    setMoreOpen(false);
  };

  return (
    <div className="translation-command-shell">
      <header className="translation-command-bar" aria-label={t('nav.translation')}>
        <div className="translation-command-bar__identity">
          <Button
            variant="ghost"
            size="sm"
            className="translation-command-bar__back"
            onClick={() => {
              navigate(`/projects/${projectId}`);
            }}
            aria-label={t('translation.backToProject')}
          >
            <ArrowLeft size={16} aria-hidden />
          </Button>

          <div className="translation-command-bar__dropdown">
            <button
              ref={projectTriggerRef}
              type="button"
              className="translation-command-bar__picker"
              aria-expanded={projectOpen}
              aria-haspopup="listbox"
              onClick={() => {
                setProjectOpen((v) => !v);
                setChapterOpen(false);
              }}
            >
              <span className="translation-command-bar__title">{projectTitle}</span>
              <ChevronDown size={14} aria-hidden />
            </button>
            <ListboxPopover
              open={projectOpen}
              onOpenChange={setProjectOpen}
              anchorRef={projectTriggerRef}
              className="translation-command-bar__menu"
              placement="bottom-start"
              matchAnchorWidth={false}
              minWidth={200}
              maxHeight={280}
            >
              {projects.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  role="option"
                  aria-selected={p.id === projectId}
                  className={p.id === projectId ? 'active' : undefined}
                  onClick={() => {
                    closeMenus();
                    onProjectChange(p.id);
                  }}
                >
                  {p.title}
                </button>
              ))}
            </ListboxPopover>
          </div>

          <div className="translation-command-bar__dropdown">
            <button
              ref={chapterTriggerRef}
              type="button"
              className="translation-command-bar__picker"
              aria-expanded={chapterOpen}
              aria-haspopup="listbox"
              disabled={chapters.length === 0}
              onClick={() => {
                setChapterOpen((v) => !v);
                setProjectOpen(false);
              }}
            >
              <span>
                {chapterNumber != null
                  ? t('translation.chapterNumber', { n: String(chapterNumber) })
                  : t('translation.selectChapter')}
              </span>
              <ChevronDown size={14} aria-hidden />
            </button>
            <ListboxPopover
              open={chapterOpen}
              onOpenChange={(next) => {
                setChapterOpen(next);
                if (!next) setChapterFilter('');
              }}
              anchorRef={chapterTriggerRef}
              className="translation-command-bar__menu translation-command-bar__menu--chapters"
              placement="bottom-start"
              matchAnchorWidth={false}
              minWidth={240}
              maxHeight={280}
            >
              <input
                type="search"
                className="input translation-command-bar__chapter-search"
                placeholder={t('actions.search')}
                value={chapterFilter}
                onChange={(e) => {
                  setChapterFilter(e.target.value);
                }}
              />
              <div className="translation-command-bar__menu-scroll">
                {filteredChapters.map(({ ch, idx }) => (
                  <button
                    key={ch.id}
                    type="button"
                    role="option"
                    aria-selected={idx === chapterIndex}
                    className={idx === chapterIndex ? 'active' : undefined}
                    onClick={() => {
                      closeMenus();
                      setChapterFilter('');
                      onChapterChange(idx);
                    }}
                  >
                    {chapterLabel(ch)}
                    {ch.title ? ` · ${ch.title}` : ''}
                  </button>
                ))}
              </div>
            </ListboxPopover>
          </div>

          <LanguagePairLabel
            sourceLanguage={sourceLanguage}
            targetLanguage={targetLanguage}
            className="translation-command-bar__pair"
          />
        </div>

        <div className="translation-command-bar__actions">
          <div ref={copyAnchorRef} className="translation-command-bar__dropdown">
            <Button
              variant="secondary"
              size="sm"
              disabled={copyDisabled || busy}
              aria-label={t('translation.copyTranslation')}
              onClick={() => {
                onCopy('translation');
              }}
            >
              <Copy size={14} aria-hidden />
              {t('actions.copy')}
            </Button>
            <IconButton
              label={t('translation.copyMenu')}
              active={copyOpen}
              onClick={() => {
                setCopyOpen((v) => !v);
                setExportOpen(false);
                setMoreOpen(false);
              }}
            >
              <ChevronDown size={14} />
            </IconButton>
            <DropdownMenu
              open={copyOpen}
              onOpenChange={setCopyOpen}
              anchorRef={copyAnchorRef}
              className="translation-command-bar__menu translation-command-bar__menu--wide"
              placement="bottom-end"
              minWidth={200}
              maxHeight={280}
            >
              <button type="button" role="menuitem" onClick={() => { closeMenus(); onCopy('translation'); }}>
                {t('translation.copyTranslation')}
              </button>
              <button type="button" role="menuitem" onClick={() => { closeMenus(); onCopy('source'); }}>
                {t('translation.copySource')}
              </button>
              <button type="button" role="menuitem" onClick={() => { closeMenus(); onCopy('bilingual'); }}>
                {t('translation.copyBilingual')}
              </button>
            </DropdownMenu>
          </div>

          <div className="translation-command-bar__dropdown">
            <Button
              ref={exportTriggerRef}
              variant="secondary"
              size="sm"
              disabled={busy || chapters.length === 0}
              aria-expanded={exportOpen}
              aria-haspopup="menu"
              onClick={() => {
                setExportOpen((v) => !v);
                setCopyOpen(false);
                setMoreOpen(false);
              }}
            >
              <Download size={14} aria-hidden />
              {t('actions.export')}
              <ChevronDown size={14} aria-hidden />
            </Button>
            <DropdownMenu
              open={exportOpen}
              onOpenChange={setExportOpen}
              anchorRef={exportTriggerRef}
              className="translation-command-bar__menu translation-command-bar__menu--wide"
              placement="bottom-end"
              minWidth={200}
              maxHeight={280}
            >
              <button type="button" role="menuitem" onClick={() => { closeMenus(); onExport('txt'); }}>
                {t('translation.exportTxt')}
              </button>
              <button type="button" role="menuitem" onClick={() => { closeMenus(); onExport('docx'); }}>
                {t('translation.exportDocx')}
              </button>
              {selectedCount > 1 && onExportSelected ? (
                <button type="button" role="menuitem" onClick={() => { closeMenus(); onExportSelected(); }}>
                  {t('translation.exportSelectedChapters', { count: String(selectedCount) })}
                </button>
              ) : null}
              <div className="translation-command-bar__menu-sep" role="separator" />
              {onOpenExportDirectory ? (
                <button type="button" role="menuitem" onClick={() => { closeMenus(); onOpenExportDirectory(); }}>
                  {t('exportDirectory.openExportFolder')}
                </button>
              ) : null}
              {onChangeExportLocation ? (
                <button type="button" role="menuitem" onClick={() => { closeMenus(); onChangeExportLocation(); }}>
                  {t('exportDirectory.changeProjectLocation')}
                </button>
              ) : null}
            </DropdownMenu>
          </div>

          <TranslationActions
            projectId={projectId}
            busy={busy}
            preparing={preparing}
            onContinue={onContinue}
            onTranslateCurrent={onTranslateCurrent}
            onTranslateNext3={onTranslateNext3}
            onTranslateRemaining={onTranslateRemaining}
            onTranslateRange={onTranslateRange}
          />

          <TranslationContextStatus
            projectId={projectId}
            packMode={activeJob?.progress?.packMode ?? null}
          />

          <div className="translation-command-bar__dropdown">
            <IconButton
              ref={moreTriggerRef}
              label={t('translation.moreActions')}
              active={moreOpen}
              onClick={() => {
                setMoreOpen((v) => !v);
                setCopyOpen(false);
                setExportOpen(false);
              }}
            >
              <MoreHorizontal size={18} />
            </IconButton>
            <DropdownMenu
              open={moreOpen}
              onOpenChange={setMoreOpen}
              anchorRef={moreTriggerRef}
              className="translation-command-bar__menu translation-command-bar__menu--wide translation-menu--danger"
              placement="bottom-end"
              minWidth={220}
              maxHeight={320}
            >
              {projectId && activeEditionId ? (
                <div className="translation-command-bar__menu-spreadsheet" role="none">
                  <TranslationSpreadsheetDialog
                    projectId={projectId}
                    editionId={activeEditionId}
                    onComplete={() => {
                      closeMenus();
                    }}
                    onImported={() => {
                      closeMenus();
                      onSpreadsheetImported();
                    }}
                  />
                </div>
              ) : null}
              <button type="button" role="menuitem" onClick={() => { closeMenus(); onToggleFocusMode(); }}>
                {t('translation.focusMode')}
              </button>
              <button type="button" role="menuitem" onClick={() => { closeMenus(); onClearTranslations(); }}>
                {selectedCount > 0 ? t('translation.clearSelected') : t('translation.clearChapter')}
              </button>
              <button type="button" role="menuitem" onClick={() => { closeMenus(); onRetranslate(); }}>
                {selectedCount > 0 ? t('actions.retranslateSelected') : t('actions.retranslate')}
              </button>
            </DropdownMenu>
          </div>

          {saveLabel ? (
            <span className={`editor-save-status editor-save-status--${saveStatus}`}>{saveLabel}</span>
          ) : null}
        </div>
      </header>

      {(activeJob || preparing) ? (
        <TranslationJobStrip
          job={activeJob}
          preparing={preparing}
          preparingMessage={preparingMessage}
        />
      ) : null}
    </div>
  );
}
