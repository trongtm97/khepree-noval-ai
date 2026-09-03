import { useEffect, useMemo, useState } from 'react';
import type { EditorParagraphDto } from '@shared/schemas/translation-editor';
import { useT } from '../../i18n';
import { termScopeLabel } from '../../i18n/enums';
import {
  filterContextForParagraph,
  isEditorContextEmpty,
  type EditorContext,
} from '../../utils/editor-context-filter';

interface EditorContextPanelProps {
  context: EditorContext | null;
  paragraph?: EditorParagraphDto | null;
  onTermClick?: (termId: string) => void;
  onCharacterClick?: (characterId: string, canonicalName: string) => void;
}

const TABS = ['characters', 'terms', 'relationships', 'memory'] as const;
type Tab = (typeof TABS)[number];

const TAB_KEYS: Record<Tab, string> = {
  characters: 'editor.tabCharacters',
  relationships: 'editor.tabRelationships',
  terms: 'editor.tabTerms',
  memory: 'editor.tabMemory',
};

function tabCount(filtered: EditorContext, item: Tab): number | null {
  if (item === 'characters') return filtered.characters.length;
  if (item === 'terms') return filtered.terms.length;
  if (item === 'relationships') return filtered.relationships.length;
  return null;
}

function pickInitialTab(filtered: EditorContext): Tab {
  if (filtered.terms.length > 0) return 'terms';
  if (filtered.characters.length > 0) return 'characters';
  if (filtered.relationships.length > 0) return 'relationships';
  if (filtered.memorySnippet?.trim()) return 'memory';
  return 'characters';
}

export function EditorContextPanel({
  context,
  paragraph = null,
  onTermClick,
  onCharacterClick,
}: EditorContextPanelProps) {
  const t = useT();

  const filtered = useMemo(
    () => (context ? filterContextForParagraph(context, paragraph) : null),
    [context, paragraph],
  );

  const counts = useMemo(() => {
    if (!filtered) return null;
    return Object.fromEntries(TABS.map((item) => [item, tabCount(filtered, item)])) as Record<
      Tab,
      number | null
    >;
  }, [filtered]);

  const [tab, setTab] = useState<Tab>('terms');

  useEffect(() => {
    if (!filtered) return;
    setTab(pickInitialTab(filtered));
  }, [
    filtered?.characters.length,
    filtered?.terms.length,
    filtered?.relationships.length,
    filtered?.memorySnippet,
  ]);

  if (!context) {
    return (
      <aside className="editor-context editor-context--empty">
        <p className="muted">{t('editor.loadChapter')}</p>
      </aside>
    );
  }

  if (!filtered || isEditorContextEmpty(filtered)) {
    return (
      <aside className="editor-context editor-context--empty">
        <p className="muted">{t('editor.emptyContext')}</p>
        <p className="editor-context-empty-hint muted">{t('editor.emptyContextHint')}</p>
      </aside>
    );
  }

  const visibleTabs = TABS.filter((item) => {
    const count = counts?.[item];
    if (item === tab) return true;
    if (item === 'memory') return Boolean(filtered.memorySnippet?.trim());
    return (count ?? 0) > 0;
  });

  const hiddenCount = TABS.length - visibleTabs.length;

  return (
    <aside className="editor-context">
      <div className="editor-context-tabs">
        {visibleTabs.map((item) => (
          <button
            key={item}
            type="button"
            className={tab === item ? 'active' : ''}
            onClick={() => {
              setTab(item);
            }}
          >
            {t(TAB_KEYS[item])}
            {counts?.[item] != null && counts[item] > 0 ? ` ${counts[item]}` : ''}
          </button>
        ))}
        {hiddenCount > 0 ? (
          <span className="editor-context-tabs-more muted">{t('editor.tabOther')}</span>
        ) : null}
      </div>
      <div className="editor-context-body">
        {tab === 'characters' ? (
          <ul className="editor-context-list">
            {filtered.characters.map((character) => (
              <li key={character.id}>
                <button
                  type="button"
                  className="editor-context-item"
                  onClick={() => {
                    onCharacterClick?.(character.id, character.canonicalName);
                  }}
                >
                  <strong>{character.canonicalName}</strong>
                  {character.translatedName ? ` → ${character.translatedName}` : ''}
                  {character.role ? <span className="muted"> · {character.role}</span> : null}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        {tab === 'relationships' ? (
          <ul className="editor-context-list">
            {filtered.relationships.map((rel) => (
              <li key={rel.id}>
                {rel.fromName} — {rel.type} — {rel.toName}
              </li>
            ))}
          </ul>
        ) : null}
        {tab === 'terms' ? (
          <ul className="editor-context-list">
            {filtered.terms.map((term) => (
              <li key={term.id}>
                <button
                  type="button"
                  className="editor-context-item"
                  onClick={() => {
                    onTermClick?.(term.id);
                  }}
                >
                  <strong>{term.sourceText}</strong>
                  {term.translation ? ` → ${term.translation}` : ''}
                  <span className="muted">
                    {' '}
                    · {termScopeLabel(term.scope)}
                    {term.confidence != null ? ` · ${term.confidence}` : ''}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        {tab === 'memory' ? (
          <pre className="editor-memory-snippet">
            {filtered.memorySnippet ?? t('editor.noMemory')}
          </pre>
        ) : null}
      </div>
    </aside>
  );
}
