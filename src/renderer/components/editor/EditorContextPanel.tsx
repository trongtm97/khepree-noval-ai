import { useState } from 'react';
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

export function EditorContextPanel({
  context,
  paragraph = null,
  onTermClick,
  onCharacterClick,
}: EditorContextPanelProps) {
  const t = useT();
  const [tab, setTab] = useState<Tab>('terms');

  if (!context) {
    return (
      <aside className="editor-context editor-context--empty">
        <p className="muted">{t('editor.loadChapter')}</p>
      </aside>
    );
  }

  const filtered = filterContextForParagraph(context, paragraph);

  if (isEditorContextEmpty(filtered)) {
    return (
      <aside className="editor-context editor-context--empty">
        <p className="muted">{t('editor.emptyContext')}</p>
      </aside>
    );
  }

  const counts: Record<Tab, number | null> = {
    characters: filtered.characters.length,
    terms: filtered.terms.length,
    relationships: filtered.relationships.length,
    memory: null,
  };

  return (
    <aside className="editor-context">
      <div className="editor-context-tabs">
        {TABS.map((item) => (
          <button
            key={item}
            type="button"
            className={tab === item ? 'active' : ''}
            onClick={() => {
              setTab(item);
            }}
          >
            {t(TAB_KEYS[item])}
            {counts[item] != null ? ` ${counts[item]}` : ''}
          </button>
        ))}
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
