import { useMemo } from 'react';
import { SearchInput } from '../../../components/ui';
import { useT } from '../../../i18n';
import { searchHelpArticles } from '../content';
import { highlightText } from '../highlight';
import type { HelpArticle } from '../types';

interface HelpSearchProps {
  query: string;
  onQueryChange: (q: string) => void;
  onSelect: (article: HelpArticle) => void;
}

export function HelpSearch({ query, onQueryChange, onSelect }: HelpSearchProps) {
  const t = useT();
  const results = useMemo(() => searchHelpArticles(query).slice(0, 8), [query]);

  return (
    <div className="help-search">
      <SearchInput
        id="help-search-input"
        value={query}
        onChange={(e) => { onQueryChange(e.target.value); }}
        placeholder={t('help.searchPlaceholder')}
        aria-label={t('help.searchPlaceholder')}
      />
      {query.trim() && results.length > 0 ? (
        <ul className="help-search-results" role="listbox">
          {results.map(({ article, snippet }) => (
            <li key={article.id}>
              <button
                type="button"
                className="help-search-hit"
                role="option"
                onClick={() => {
                  onSelect(article);
                  onQueryChange('');
                }}
              >
                <strong>{highlightText(article.title, query)}</strong>
                <span className="muted">{highlightText(`${snippet}…`, query)}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {query.trim() && results.length === 0 ? (
        <p className="help-search-empty muted">{t('help.searchEmpty')}</p>
      ) : null}
    </div>
  );
}

interface HelpSidebarProps {
  categories: { id: string; label: string; articles: HelpArticle[] }[];
  activeId: string;
  onSelect: (id: string) => void;
}

export function HelpSidebar({ categories, activeId, onSelect }: HelpSidebarProps) {
  return (
    <nav className="help-sidebar" aria-label="Danh mục hướng dẫn">
      {categories.map((cat) => (
        <div key={cat.id} className="help-sidebar-group">
          <h3 className="help-sidebar-group-title">{cat.label}</h3>
          <ul>
            {cat.articles.map((article) => (
              <li key={article.id}>
                <button
                  type="button"
                  className={activeId === article.id ? 'help-sidebar-link active' : 'help-sidebar-link'}
                  aria-current={activeId === article.id ? 'page' : undefined}
                  onClick={() => { onSelect(article.id); }}
                >
                  {article.title}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}
