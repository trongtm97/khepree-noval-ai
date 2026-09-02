import { useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  MoreHorizontal,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { ProjectDto } from '@shared/schemas/import';
import type { ChapterSummaryDto } from '@shared/schemas/translation-pack';
import type { JobDto } from '@shared/schemas/job';
import type { ChapterCopyMode } from '@shared/utils/chapter-export-text';
import type { NovelExportFormat } from '@shared/constants/portability';
import { useT } from '../../i18n';
import type { SaveStatus } from '../../stores/editor-store';
import { DropdownMenu, ListboxPopover } from '../overlay';
import { Button, IconButton } from '../ui';
import { LanguagePairLabel } from '../LanguagePairLabel';
import { TranslationActions } from './TranslationActions';
import { TranslationContextStatus } from './TranslationContextStatus';
import { TranslationJobStrip } from './TranslationJobStrip';
import { TranslationIssueCounter } from './TranslationIssueCounter';
import { TranslationChapterStatus } from './TranslationChapterStatus';
import { EditorSaveChip } from './EditorSaveChip';
import { VirtualChapterPicker } from './VirtualChapterPicker';
import { chapterMatchesSearch } from '../../utils/chapter-navigator';
import { ProjectAiPreferenceDialog } from '../settings/ProjectAiPreferenceDialog';
import { TranslationSpreadsheetDialog } from '../TranslationSpreadsheetDialog';
import type { EditorFontPreset } from '../../stores/translation-workspace-store';

export interface TranslationCommandBarProps {
  projects: ProjectDto[];
  projectId: string;
  projectTitle: string;
  sourceLanguage: string;
  targetLanguage: string;
  activeEditionId?: string;
  nextUntranslatedChapter?: number | null;
  chapters: ChapterSummaryDto[];
  chapterIndex: number;
  chapterNumber: number | null;
  busy: boolean;
  preparing: boolean;
  saveStatus: SaveStatus;
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
  onTranslateSelected: () => void;
  onTranslateRange: (from: number, to: number) => void;
  onClearTranslations: () => void;
  onRetranslate: () => void;
  onToggleFocusMode: () => void;
  onToggleContext?: () => void;
  onSpreadsheetImported: () => void;
  onPrevChapter?: () => void;
  onNextChapter?: () => void;
  qaIssueCount?: number;
  onJumpQaIssue?: () => void;
  chapterTranslated?: boolean;
  hasNextChapter?: boolean;
  readingMode?: boolean;
  qaReviewMode?: boolean;
  editorFontPreset?: EditorFontPreset;
  autoAdvanceAfterTranslate?: boolean;
  onToggleReadingMode?: () => void;
  onToggleQaReviewMode?: () => void;
  onSetEditorFontPreset?: (preset: EditorFontPreset) => void;
  onSetAutoAdvanceAfterTranslate?: (value: boolean) => void;
}

export function TranslationCommandBar({
  projects,
  projectId,
  projectTitle,
  sourceLanguage,
  targetLanguage,
  activeEditionId,
  nextUntranslatedChapter,
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
  onTranslateSelected,
  onTranslateRange,
  onClearTranslations,
  onRetranslate,
  onToggleFocusMode,
  onToggleContext,
  onSpreadsheetImported,
  onPrevChapter,
  onNextChapter,
  qaIssueCount = 0,
  onJumpQaIssue,
  chapterTranslated = false,
  hasNextChapter = false,
  readingMode = false,
  qaReviewMode = false,
  editorFontPreset = 'md',
  autoAdvanceAfterTranslate = false,
  onToggleReadingMode,
  onToggleQaReviewMode,
  onSetEditorFontPreset,
  onSetAutoAdvanceAfterTranslate,
}: TranslationCommandBarProps) {
  const t = useT();
  const navigate = useNavigate();
  const [projectOpen, setProjectOpen] = useState(false);
  const [chapterOpen, setChapterOpen] = useState(false);
  const [copyOpen, setCopyOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [spreadsheetOpen, setSpreadsheetOpen] = useState(false);
  const [projectAiOpen, setProjectAiOpen] = useState(false);
  const [chapterFilter, setChapterFilter] = useState('');
  const projectTriggerRef = useRef<HTMLButtonElement>(null);
  const chapterTriggerRef = useRef<HTMLButtonElement>(null);
  const copyAnchorRef = useRef<HTMLDivElement>(null);
  const copyChevronRef = useRef<HTMLButtonElement>(null);
  const exportAnchorRef = useRef<HTMLDivElement>(null);
  const exportChevronRef = useRef<HTMLButtonElement>(null);
  const moreTriggerRef = useRef<HTMLButtonElement>(null);

  const filteredChapters = useMemo(() => {
    return chapters
      .map((ch, idx) => ({ ch, idx }))
      .filter(({ ch }) => chapterMatchesSearch(ch, chapterFilter));
  }, [chapters, chapterFilter]);

  const canPrev = chapterIndex > 0;
  const canNext = chapterIndex < chapters.length - 1;

  const closeMenus = () => {
    setProjectOpen(false);
    setChapterOpen(false);
    setCopyOpen(false);
    setExportOpen(false);
    setMoreOpen(false);
  };

  const openExportMenu = () => {
    setExportOpen(true);
    setCopyOpen(false);
    setMoreOpen(false);
  };

  const openCopyMenu = () => {
    setCopyOpen(true);
    setExportOpen(false);
    setMoreOpen(false);
  };

  const pauseJob = () => {
    void window.khepreeNovelAI.jobs.pauseAll();
  };

  const resumeJob = () => {
    void window.khepreeNovelAI.jobs.resumeAll();
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

          <div className="translation-command-bar__chapter-nav">
            <IconButton
              label={t('translation.prevChapter')}
              className="translation-command-bar__chapter-step"
              disabled={!canPrev}
              title={t('translation.shortcutPrevChapter')}
              onClick={() => {
                onPrevChapter?.();
              }}
            >
              <ChevronLeft size={16} aria-hidden />
            </IconButton>

            <div className="translation-command-bar__dropdown">
              <button
                ref={chapterTriggerRef}
                type="button"
                className="translation-command-bar__picker translation-command-bar__picker--chapter"
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
                  placeholder={t('translation.chapterSearchPlaceholder')}
                  value={chapterFilter}
                  onChange={(e) => {
                    setChapterFilter(e.target.value);
                  }}
                />
                <VirtualChapterPicker
                  chapters={filteredChapters}
                  chapterIndex={chapterIndex}
                  onPick={(idx) => {
                    closeMenus();
                    setChapterFilter('');
                    onChapterChange(idx);
                  }}
                />
              </ListboxPopover>
            </div>

            <IconButton
              label={t('translation.nextChapter')}
              className="translation-command-bar__chapter-step"
              disabled={!canNext}
              title={t('translation.shortcutNextChapter')}
              onClick={() => {
                onNextChapter?.();
              }}
            >
              <ChevronRight size={16} aria-hidden />
            </IconButton>
          </div>

          <LanguagePairLabel
            sourceLanguage={sourceLanguage}
            targetLanguage={targetLanguage}
            className="translation-command-bar__pair"
          />
        </div>

        <div className="translation-command-bar__actions">
          <EditorSaveChip status={saveStatus} />

          {onJumpQaIssue ? (
            <TranslationIssueCounter count={qaIssueCount} onJump={onJumpQaIssue} />
          ) : null}

          <div ref={copyAnchorRef} className="translation-command-bar__split-action">
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
              <span className="translation-command-bar__action-label">{t('actions.copy')}</span>
            </Button>
            <IconButton
              ref={copyChevronRef}
              label={t('translation.copyMenu')}
              active={copyOpen}
              className="translation-command-bar__split-chevron"
              onClick={openCopyMenu}
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

          <div ref={exportAnchorRef} className="translation-command-bar__split-action">
            <Button
              variant="secondary"
              size="sm"
              disabled={busy || chapters.length === 0}
              aria-expanded={exportOpen}
              aria-haspopup="menu"
              aria-label={t('actions.export')}
              onClick={openExportMenu}
            >
              <Download size={14} aria-hidden />
              <span className="translation-command-bar__action-label">{t('actions.export')}</span>
            </Button>
            <IconButton
              ref={exportChevronRef}
              label={t('actions.export')}
              active={exportOpen}
              className="translation-command-bar__split-chevron"
              onClick={openExportMenu}
            >
              <ChevronDown size={14} />
            </IconButton>
            <DropdownMenu
              open={exportOpen}
              onOpenChange={setExportOpen}
              anchorRef={exportAnchorRef}
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
            chapters={chapters}
            chapterIndex={chapterIndex}
            nextUntranslatedChapter={nextUntranslatedChapter}
            selectedCount={selectedCount}
            busy={busy}
            preparing={preparing}
            activeJob={activeJob}
            onContinue={onContinue}
            onTranslateCurrent={onTranslateCurrent}
            onTranslateNext3={onTranslateNext3}
            onTranslateRemaining={onTranslateRemaining}
            onTranslateSelected={onTranslateSelected}
            onTranslateRange={onTranslateRange}
            onResume={resumeJob}
          />

          <TranslationContextStatus
            projectId={projectId}
            onOpenContext={onToggleContext}
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
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    closeMenus();
                    setSpreadsheetOpen(true);
                  }}
                >
                  {t('translation.excelCsvData')}
                </button>
              ) : null}
              {onToggleContext ? (
                <button type="button" role="menuitem" onClick={() => { closeMenus(); onToggleContext(); }}>
                  {t('translation.showContext')}
                </button>
              ) : null}
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  closeMenus();
                  setProjectAiOpen(true);
                }}
              >
                {t('translation.projectAiPreference')}
              </button>
              {onToggleReadingMode ? (
                <button
                  type="button"
                  role="menuitem"
                  className={readingMode ? 'active' : undefined}
                  onClick={() => {
                    closeMenus();
                    onToggleReadingMode();
                  }}
                >
                  {t('translation.readingMode')}
                </button>
              ) : null}
              {onToggleQaReviewMode ? (
                <button
                  type="button"
                  role="menuitem"
                  className={qaReviewMode ? 'active' : undefined}
                  onClick={() => {
                    closeMenus();
                    onToggleQaReviewMode();
                  }}
                >
                  {t('translation.qaReviewMode')}
                </button>
              ) : null}
              {onSetEditorFontPreset ? (
                <>
                  <div className="translation-command-bar__menu-sep" role="separator" />
                  <div className="translation-command-bar__menu-label" role="presentation">
                    {t('translation.editorFontSize')}
                  </div>
                  {(['sm', 'md', 'lg'] as const).map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      role="menuitemradio"
                      aria-checked={editorFontPreset === preset}
                      className={editorFontPreset === preset ? 'active' : undefined}
                      onClick={() => {
                        closeMenus();
                        onSetEditorFontPreset(preset);
                      }}
                    >
                      {t(`translation.editorFontPreset.${preset}`)}
                    </button>
                  ))}
                </>
              ) : null}
              {onSetAutoAdvanceAfterTranslate ? (
                <button
                  type="button"
                  role="menuitemcheckbox"
                  aria-checked={autoAdvanceAfterTranslate}
                  className={autoAdvanceAfterTranslate ? 'active' : undefined}
                  onClick={() => {
                    closeMenus();
                    onSetAutoAdvanceAfterTranslate(!autoAdvanceAfterTranslate);
                  }}
                >
                  {t('translation.autoAdvanceAfterTranslate')}
                </button>
              ) : null}
              <button type="button" role="menuitem" title="Ctrl+Shift+F" onClick={() => { closeMenus(); onToggleFocusMode(); }}>
                {t('translation.focusMode')}
              </button>
              <hr className="translation-menu__sep" />
              <button type="button" role="menuitem" className="translation-menu__danger" onClick={() => { closeMenus(); onRetranslate(); }}>
                {selectedCount > 0 ? t('actions.retranslateSelected') : t('actions.retranslate')}
              </button>
              <button type="button" role="menuitem" className="translation-menu__danger" onClick={() => { closeMenus(); onClearTranslations(); }}>
                {selectedCount > 0 ? t('translation.clearSelected') : t('translation.clearChapter')}
              </button>
            </DropdownMenu>
          </div>
        </div>
      </header>

      {projectId && activeEditionId ? (
        <TranslationSpreadsheetDialog
          projectId={projectId}
          editionId={activeEditionId}
          open={spreadsheetOpen}
          onClose={() => {
            setSpreadsheetOpen(false);
          }}
          onImported={() => {
            setSpreadsheetOpen(false);
            onSpreadsheetImported();
          }}
        />
      ) : null}

      {(activeJob || preparing) ? (
        <TranslationJobStrip
          job={activeJob}
          preparing={preparing}
          preparingMessage={preparingMessage}
          onPause={pauseJob}
          onResume={resumeJob}
        />
      ) : chapterTranslated ? (
        <TranslationChapterStatus
          translated
          hasNext={hasNextChapter}
          onNextChapter={onNextChapter}
        />
      ) : null}

      <ProjectAiPreferenceDialog
        open={projectAiOpen}
        projectId={projectId}
        onClose={() => {
          setProjectAiOpen(false);
        }}
      />
    </div>
  );
}
