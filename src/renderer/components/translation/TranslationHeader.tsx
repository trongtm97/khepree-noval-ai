import type { ReactNode } from 'react';
import { MoreHorizontal } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { LanguagePairLabel } from '../LanguagePairLabel';
import { useT } from '../../i18n';
import { IconButton } from '../ui';
import { HelpContextButton } from '../../features/help/HelpContextButton';
import { TranslationActions } from './TranslationActions';

export interface TranslationHeaderProps {
  projectTitle: string;
  sourceLanguage: string;
  targetLanguage: string;
  chapterNumber: number | null;
  projectId: string;
  busy: boolean;
  preparing: boolean;
  saveStatus: string;
  lastSavedAt: string | null;
  memoryBadge: ReactNode;
  onContinue: () => void;
  onTranslateCurrent: () => void;
  onTranslateNext3: () => void;
  onTranslateRemaining: () => void;
  onTranslateRange: (from: number, to: number) => void;
  onClearTranslations: () => void;
  onRetranslate: () => void;
  selectedCount: number;
}

/**
 * Translator header — novel title, language pair, chapter, primary translate.
 */
export function TranslationHeader({
  projectTitle,
  sourceLanguage,
  targetLanguage,
  chapterNumber,
  projectId,
  busy,
  preparing,
  saveStatus,
  lastSavedAt,
  memoryBadge,
  onContinue,
  onTranslateCurrent,
  onTranslateNext3,
  onTranslateRemaining,
  onTranslateRange,
  onClearTranslations,
  onRetranslate,
  selectedCount,
}: TranslationHeaderProps) {
  const t = useT();
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDoc = (event: MouseEvent) => {
      if (moreRef.current && !moreRef.current.contains(event.target as Node)) {
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
            : '';

  return (
    <header className="translation-header">
      <div className="translation-header__identity">
        <h1 className="translation-header__title">
          {projectTitle || t('translation.selectProject')}
        </h1>
        {sourceLanguage && targetLanguage ? (
          <LanguagePairLabel
            sourceLanguage={sourceLanguage}
            targetLanguage={targetLanguage}
            className="translation-header__pair"
          />
        ) : null}
        {chapterNumber != null ? (
          <p className="translation-header__chapter muted">
            {t('translation.chapterNumber', { n: String(chapterNumber) })}
          </p>
        ) : null}
      </div>

      <div className="translation-header__actions">
        <HelpContextButton articleId="start-translate" />
        {memoryBadge}
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
        <div className="translation-more" ref={moreRef}>
          <IconButton
            label={t('translation.moreActions')}
            active={moreOpen}
            onClick={() => {
              setMoreOpen((v) => !v);
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
        {saveLabel ? (
          <span className={`editor-save-status editor-save-status--${saveStatus}`}>
            {saveLabel}
          </span>
        ) : null}
      </div>
    </header>
  );
}
