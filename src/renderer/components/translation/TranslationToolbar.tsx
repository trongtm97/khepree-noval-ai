import { useEffect, useRef, useState, type ReactNode } from 'react';
import { MoreHorizontal, ChevronDown } from 'lucide-react';
import type { ProjectDto } from '@shared/schemas/import';
import { useT } from '../../i18n';
import { Button, IconButton, Input, Select, Dialog } from '../ui';
import { HelpContextButton } from '../../features/help/HelpContextButton';

interface TranslationToolbarProps {
  projectId: string;
  projects: ProjectDto[];
  projectTitle: string;
  chapterLabel: string;
  selectedCount: number;
  busy: boolean;
  preparing: boolean;
  saveStatus: string;
  lastSavedAt: string | null;
  hideProjectSelect?: boolean;
  onProjectChange: (projectId: string) => void;
  onContinue: () => void;
  onTranslateCurrent: () => void;
  onTranslateSelected: () => void;
  onTranslateRemaining: () => void;
  onTranslateRange: (from: number, to: number) => void;
  onClearTranslations: () => void;
  onRetranslate: () => void;
  memoryBadge: ReactNode;
}

export function TranslationToolbar({
  projectId,
  projects,
  projectTitle,
  chapterLabel,
  selectedCount,
  busy,
  preparing,
  saveStatus,
  lastSavedAt,
  hideProjectSelect,
  onProjectChange,
  onContinue,
  onTranslateCurrent,
  onTranslateSelected,
  onTranslateRemaining,
  onTranslateRange,
  onClearTranslations,
  onRetranslate,
  memoryBadge,
}: TranslationToolbarProps) {
  const t = useT();
  const [translateOpen, setTranslateOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [rangeOpen, setRangeOpen] = useState(false);
  const [rangeFrom, setRangeFrom] = useState('');
  const [rangeTo, setRangeTo] = useState('');
  const translateRef = useRef<HTMLDivElement>(null);
  const moreRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDoc = (event: MouseEvent) => {
      const target = event.target as Node;
      if (translateRef.current && !translateRef.current.contains(target)) {
        setTranslateOpen(false);
      }
      if (moreRef.current && !moreRef.current.contains(target)) {
        setMoreOpen(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => {
      document.removeEventListener('mousedown', onDoc);
    };
  }, []);

  const saveLabel =
    saveStatus === 'dirty'
      ? '…'
      : saveStatus === 'saving'
        ? t('common.loading')
        : saveStatus === 'saved' && lastSavedAt
          ? t('translation.saved')
          : saveStatus === 'error'
            ? t('status.failed')
            : t('status.ready');

  return (
    <header className="translation-toolbar page-header-row">
      <div className="translation-toolbar__title">
        <h2>{t('translation.title')}</h2>
        <p className="muted">
          {projectTitle || t('translation.selectProject')}
          {chapterLabel ? ` · ${chapterLabel}` : ''}
        </p>
      </div>

      <div className="translation-toolbar__actions">
        <HelpContextButton articleId="start-translate" />
        {memoryBadge}
        {!hideProjectSelect ? (
          <Select
            value={projectId}
            aria-label={t('translation.selectProject')}
            onChange={(event) => {
              onProjectChange(event.target.value);
            }}
            style={{ width: 'auto', minWidth: 140 }}
          >
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.title}
              </option>
            ))}
          </Select>
        ) : null}

        <div className="translation-action-split" ref={translateRef}>
          <Button
            variant="primary"
            size="sm"
            loading={busy}
            disabled={busy || !projectId}
            onClick={onContinue}
          >
            {preparing ? t('translation.ensuringReady') : t('translation.continueAction')}
          </Button>
          <Button
            variant="primary"
            size="sm"
            className="translation-action-split__chevron"
            disabled={busy || !projectId}
            aria-expanded={translateOpen}
            aria-haspopup="menu"
            onClick={() => {
              setTranslateOpen((v) => !v);
              setMoreOpen(false);
            }}
          >
            <ChevronDown size={16} aria-hidden />
          </Button>
          {translateOpen ? (
            <div className="translation-menu" role="menu">
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setTranslateOpen(false);
                  onTranslateCurrent();
                }}
              >
                {t('translation.translateCurrent')}
              </button>
              <button
                type="button"
                role="menuitem"
                disabled={selectedCount === 0}
                onClick={() => {
                  setTranslateOpen(false);
                  onTranslateSelected();
                }}
              >
                {t('translation.translateSelectedMenu', { count: String(selectedCount) })}
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setTranslateOpen(false);
                  setRangeOpen(true);
                }}
              >
                {t('translation.translateRangeMenu')}
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setTranslateOpen(false);
                  onTranslateRemaining();
                }}
              >
                {t('translation.translateRemaining')}
              </button>
            </div>
          ) : null}
        </div>

        <div className="translation-more" ref={moreRef}>
          <IconButton
            label={t('translation.moreActions')}
            active={moreOpen}
            onClick={() => {
              setMoreOpen((v) => !v);
              setTranslateOpen(false);
            }}
          >
            <MoreHorizontal size={18} />
          </IconButton>
          {moreOpen ? (
            <div className="translation-menu translation-menu--danger" role="menu">
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMoreOpen(false);
                  onClearTranslations();
                }}
              >
                {selectedCount > 0
                  ? t('translation.clearSelected')
                  : t('translation.clearChapter')}
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMoreOpen(false);
                  onRetranslate();
                }}
              >
                {selectedCount > 0
                  ? t('actions.retranslateSelected')
                  : t('actions.retranslate')}
              </button>
            </div>
          ) : null}
        </div>

        <span className={`editor-save-status editor-save-status--${saveStatus}`}>
          {saveLabel}
        </span>
      </div>

      <Dialog
        open={rangeOpen}
        title={t('translation.translateRangeMenu')}
        description={t('translation.novelMemoryHint')}
        confirmLabel={t('actions.start')}
        cancelLabel={t('actions.cancel')}
        busy={busy}
        onConfirm={() => {
          const from = Number.parseInt(rangeFrom.trim(), 10);
          const to = Number.parseInt(rangeTo.trim(), 10);
          if (!Number.isFinite(from) || !Number.isFinite(to) || from < 1 || to < from) {
            return;
          }
          setRangeOpen(false);
          onTranslateRange(from, to);
        }}
        onCancel={() => {
          if (!busy) setRangeOpen(false);
        }}
      >
        <div className="btn-row" style={{ marginTop: '0.75rem' }}>
          <label>
            {t('translation.novelRangeFrom')}
            <Input
              type="number"
              min={1}
              value={rangeFrom}
              onChange={(e) => {
                setRangeFrom(e.target.value);
              }}
            />
          </label>
          <label>
            {t('translation.novelRangeTo')}
            <Input
              type="number"
              min={1}
              value={rangeTo}
              onChange={(e) => {
                setRangeTo(e.target.value);
              }}
            />
          </label>
        </div>
      </Dialog>
    </header>
  );
}
