import { useEffect } from 'react';
import { useT } from '../../i18n';
import { Button, Input } from '../ui';

interface TranslationSearchOverlayProps {
  open: boolean;
  showReplace: boolean;
  searchQuery: string;
  replaceQuery: string;
  matchIndex: number | null;
  matchCount: number;
  onSearchChange: (value: string) => void;
  onReplaceChange: (value: string) => void;
  onToggleReplace: () => void;
  onReplaceAll: () => void;
  onNextMatch: () => void;
  onClose: () => void;
}

/** Floating search/replace bar — visible only when Ctrl+F / Ctrl+H opens it. */
export function TranslationSearchOverlay({
  open,
  showReplace,
  searchQuery,
  replaceQuery,
  matchIndex,
  matchCount,
  onSearchChange,
  onReplaceChange,
  onToggleReplace,
  onReplaceAll,
  onNextMatch,
  onClose,
}: TranslationSearchOverlayProps) {
  const t = useT();

  useEffect(() => {
    if (!open) return;
    const id = window.requestAnimationFrame(() => {
      document.getElementById('editor-search')?.focus();
    });
    return () => {
      window.cancelAnimationFrame(id);
    };
  }, [open, showReplace]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="translation-search-overlay" role="search">
      <div className="editor-toolbar editor-search-bar">
        <Input
          id="editor-search"
          type="search"
          placeholder={t('translation.searchShortcut')}
          value={searchQuery}
          onChange={(event) => {
            onSearchChange(event.target.value);
          }}
          style={{ maxWidth: 220 }}
        />
        {showReplace ? (
          <Input
            type="text"
            value={replaceQuery}
            onChange={(event) => {
              onReplaceChange(event.target.value);
            }}
            style={{ maxWidth: 160 }}
          />
        ) : null}
        <Button size="sm" onClick={onToggleReplace}>
          {showReplace ? t('translation.hideReplace') : t('translation.showReplace')}
        </Button>
        {showReplace ? (
          <Button size="sm" onClick={onReplaceAll}>
            {t('translation.replaceAll')}
          </Button>
        ) : null}
        <span className="muted">
          {matchCount > 0 && matchIndex != null
            ? `${matchIndex + 1}/${matchCount}`
            : matchCount === 0 && searchQuery
              ? '0'
              : ''}
        </span>
        <Button size="sm" onClick={onNextMatch}>
          {t('translation.nextMatch')}
        </Button>
        <Button size="sm" variant="ghost" onClick={onClose}>
          {t('actions.close')}
        </Button>
      </div>
    </div>
  );
}
