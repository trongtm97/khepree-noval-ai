import { useT } from '../../i18n';
import { Button, Input } from '../ui';

interface EditorSearchBarProps {
  searchQuery: string;
  replaceQuery: string;
  showReplace: boolean;
  matchIndex: number | null;
  matchCount: number;
  onSearchChange: (value: string) => void;
  onReplaceChange: (value: string) => void;
  onToggleReplace: () => void;
  onReplaceAll: () => void;
  onNextMatch: () => void;
}

export function EditorSearchBar({
  searchQuery,
  replaceQuery,
  showReplace,
  matchIndex,
  matchCount,
  onSearchChange,
  onReplaceChange,
  onToggleReplace,
  onReplaceAll,
  onNextMatch,
}: EditorSearchBarProps) {
  const t = useT();

  return (
    <div className="editor-toolbar editor-search-bar">
      <Input
        id="editor-search"
        type="search"
        placeholder={t('translation.searchShortcut')}
        value={searchQuery}
        onChange={(event) => {
          onSearchChange(event.target.value);
        }}
        style={{ maxWidth: 200 }}
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
        {showReplace ? t('actions.close') : t('actions.edit')}
      </Button>
      {showReplace ? (
        <Button size="sm" disabled={!searchQuery} onClick={onReplaceAll}>
          {t('translation.replaceAll')}
        </Button>
      ) : null}
      {matchCount > 0 ? (
        <button type="button" className="muted editor-search-match" onClick={onNextMatch}>
          {matchIndex != null ? matchIndex + 1 : 0}/{matchCount}
        </button>
      ) : null}
    </div>
  );
}
