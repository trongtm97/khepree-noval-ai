import { useState } from 'react';
import type { EditorContextResponseSchema } from '@shared/schemas/translation-editor';
import type { z } from 'zod';
import { useT } from '../../i18n';
import { termScopeLabel } from '../../i18n/enums';

type EditorContext = z.infer<typeof EditorContextResponseSchema>;

interface EditorContextPanelProps {
  context: EditorContext | null;
}

const TABS = ['characters', 'relationships', 'terms', 'memory'] as const;
type Tab = (typeof TABS)[number];

const TAB_KEYS: Record<Tab, string> = {
  characters: 'editor.tabCharacters',
  relationships: 'editor.tabRelationships',
  terms: 'editor.tabTerms',
  memory: 'editor.tabMemory',
};

export function EditorContextPanel({ context }: EditorContextPanelProps) {
  const t = useT();
  const [tab, setTab] = useState<Tab>('terms');

  if (!context) {
    return (
      <aside className="editor-context">
        <h3>{t('editor.context')}</h3>
        <p className="muted">{t('editor.loadChapter')}</p>
      </aside>
    );
  }

  return (
    <aside className="editor-context">
      <h3>{t('editor.context')}</h3>
      <div className="editor-context-tabs">
        {TABS.map((item) => (
          <button
            key={item}
            type="button"
            className={tab === item ? 'active' : ''}
            onClick={() => { setTab(item); }}
          >
            {t(TAB_KEYS[item])}
          </button>
        ))}
      </div>
      <div className="editor-context-body">
        {tab === 'characters' ? (
          <ul className="editor-context-list">
            {context.characters.map((c) => (
              <li key={c.id}>
                <strong>{c.canonicalName}</strong>
                {c.translatedName ? ` → ${c.translatedName}` : ''}
                {c.role ? <span className="muted"> · {c.role}</span> : null}
              </li>
            ))}
          </ul>
        ) : null}
        {tab === 'relationships' ? (
          <ul className="editor-context-list">
            {context.relationships.map((r) => (
              <li key={r.id}>
                {r.fromName} — {r.type} — {r.toName}
              </li>
            ))}
          </ul>
        ) : null}
        {tab === 'terms' ? (
          <ul className="editor-context-list">
            {context.terms.map((term) => (
              <li key={term.id}>
                <strong>{term.sourceText}</strong>
                {term.translation ? ` → ${term.translation}` : ''}
                <span className="muted">
                  {' '}
                  · {termScopeLabel(term.scope)}
                  {term.confidence != null ? ` · ${term.confidence}` : ''}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
        {tab === 'memory' ? (
          <pre className="editor-memory-snippet">
            {context.memorySnippet ?? t('editor.noMemory')}
          </pre>
        ) : null}
      </div>
    </aside>
  );
}
