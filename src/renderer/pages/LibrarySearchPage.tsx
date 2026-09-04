import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type {
  LibrarySearchIndexProgressDto,
  LibrarySearchResultItemDto,
  LibrarySearchSettingsDto,
} from '@shared/schemas/library-search';
import {
  LIBRARY_SEARCH_ENTITY_TYPES,
  type LibrarySearchEntityType,
} from '@shared/constants/library-search';
import { useT } from '../i18n';
import { Button, EmptyState, PageHeader, SearchInput, Select, Spinner } from '../components/ui';

const PAGE_SIZE = 25;

function openActionKey(
  entityType: LibrarySearchEntityType,
): `librarySearch.open${string}` {
  switch (entityType) {
    case 'project':
      return 'librarySearch.openProject';
    case 'chapter':
      return 'librarySearch.openChapter';
    case 'term':
      return 'librarySearch.openTerm';
    case 'character':
      return 'librarySearch.openCharacter';
    case 'translation':
      return 'librarySearch.openTranslation';
    case 'qa_finding':
      return 'librarySearch.openTranslation';
    case 'series':
      return 'librarySearch.openSeries';
    case 'world':
      return 'librarySearch.openWorld';
    default:
      return 'librarySearch.openResult';
  }
}

export function LibrarySearchPage() {
  const t = useT();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [entityType, setEntityType] = useState<string>('');
  const [items, setItems] = useState<LibrarySearchResultItemDto[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [settings, setSettings] = useState<LibrarySearchSettingsDto | null>(null);
  const [reindex, setReindex] = useState<LibrarySearchIndexProgressDto | null>(null);
  const requestSeq = useRef(0);

  useEffect(() => {
    const timer = setTimeout(() => { setDebouncedQuery(query.trim()); }, 320);
    return () => { clearTimeout(timer); };
  }, [query]);

  useEffect(() => {
    void window.khepreeNovelAI.librarySearch.getSettings().then(setSettings);
    void window.khepreeNovelAI.librarySearch.getReindexProgress().then((p) => {
      if (p) setReindex(p);
    });
    return window.khepreeNovelAI.librarySearch.onReindexProgress((p) => { setReindex(p); });
  }, []);

  const runSearch = useCallback(async (q: string, nextOffset: number) => {
    if (!q) {
      setItems([]);
      setTotal(0);
      return;
    }
    const seq = ++requestSeq.current;
    setLoading(true);
    try {
      await window.khepreeNovelAI.librarySearch.cancelQuery();
      const result = await window.khepreeNovelAI.librarySearch.query({
        query: q,
        limit: PAGE_SIZE,
        offset: nextOffset,
        entityTypes: entityType
          ? [entityType as LibrarySearchEntityType]
          : undefined,
      });
      if (seq !== requestSeq.current) return;
      if (result.cancelled) return;
      setItems(result.items);
      setTotal(result.total);
      setOffset(result.offset);
    } finally {
      if (seq === requestSeq.current) setLoading(false);
    }
  }, [entityType]);

  useEffect(() => {
    setOffset(0);
    void runSearch(debouncedQuery, 0);
  }, [debouncedQuery, entityType, runSearch]);

  const openResult = (item: LibrarySearchResultItemDto) => {
    navigate(item.route);
  };

  const toggleSourceIndex = async (enabled: boolean) => {
    const next = await window.khepreeNovelAI.librarySearch.updateSettings({
      indexSourceText: enabled,
    });
    setSettings(next);
    void window.khepreeNovelAI.librarySearch.startReindex({ force: true });
  };

  const toggleTranslationIndex = async (enabled: boolean) => {
    const next = await window.khepreeNovelAI.librarySearch.updateSettings({
      indexTranslationText: enabled,
    });
    setSettings(next);
    void window.khepreeNovelAI.librarySearch.startReindex({ force: true });
  };

  return (
    <div className="library-search-page page-shell">
      <PageHeader
        title={t('librarySearch.title')}
        description={t('librarySearch.subtitle')}
      />

      <div className="library-search-toolbar">
        <SearchInput
          value={query}
          onChange={(e) => { setQuery(e.target.value); }}
          placeholder={t('librarySearch.placeholder')}
          aria-label={t('librarySearch.placeholder')}
        />
        <Select
          value={entityType}
          onChange={(e) => { setEntityType(e.target.value); }}
          aria-label={t('librarySearch.filterType')}
        >
          <option value="">{t('librarySearch.allTypes')}</option>
          {LIBRARY_SEARCH_ENTITY_TYPES.map((type) => (
            <option key={type} value={type}>
              {t(`librarySearch.type.${type}`)}
            </option>
          ))}
        </Select>
      </div>

      {reindex && reindex.status !== 'COMPLETED' && reindex.status !== 'CANCELLED' && (
        <p className="library-search-reindex-status" role="status">
          {t('librarySearch.reindexProgress', {
            done: String(reindex.entitiesDone),
            total: String(reindex.entitiesTotal),
          })}
        </p>
      )}

      {settings && (
        <details className="library-search-advanced">
          <summary>{t('librarySearch.advancedTitle')}</summary>
          <p className="field-help">{t('librarySearch.localOnly')}</p>
          <div className="library-search-privacy">
            <label className="nt-check-row">
              <input
                type="checkbox"
                checked={settings.indexSourceText}
                onChange={(e) => void toggleSourceIndex(e.target.checked)}
              />
              <span>
                <span className="nt-check-label">{t('librarySearch.indexSource')}</span>
                <span className="field-help">{t('librarySearch.indexSourceHelp')}</span>
              </span>
            </label>
            <label className="nt-check-row">
              <input
                type="checkbox"
                checked={settings.indexTranslationText}
                onChange={(e) => void toggleTranslationIndex(e.target.checked)}
              />
              <span>
                <span className="nt-check-label">{t('librarySearch.indexTranslation')}</span>
                <span className="field-help">{t('librarySearch.indexTranslationHelp')}</span>
              </span>
            </label>
          </div>
          <div className="btn-row" style={{ marginTop: 'var(--space-3)' }}>
            <Button
              variant="secondary"
              onClick={() => void window.khepreeNovelAI.librarySearch.startReindex({ force: false })}
            >
              {t('librarySearch.reindex')}
            </Button>
          </div>
        </details>
      )}

      {loading && (
        <div className="library-search-loading" role="status">
          <Spinner />
          <span>{t('librarySearch.loading')}</span>
        </div>
      )}

      {!loading && !debouncedQuery && (
        <EmptyState
          title={t('librarySearch.idleTitle')}
          description={t('librarySearch.idleBody')}
        />
      )}

      {!loading && debouncedQuery && items.length === 0 && (
        <EmptyState
          title={t('librarySearch.emptyTitle')}
          description={t('librarySearch.empty')}
        />
      )}

      <ul className="library-search-results">
        {items.map((item) => (
          <li key={item.entityKey}>
            <button type="button" className="library-search-result" onClick={() => { openResult(item); }}>
              <span className="library-search-result-type">
                {t(`librarySearch.type.${item.entityType}`)}
              </span>
              <strong>{item.title}</strong>
              {item.projectTitle && (
                <span className="library-search-result-meta">{item.projectTitle}</span>
              )}
              {item.seriesTitle && (
                <span className="library-search-result-meta">{item.seriesTitle}</span>
              )}
              <p className="library-search-result-snippet">{item.snippet}</p>
              <span className="library-search-result-action">{t(openActionKey(item.entityType))}</span>
            </button>
          </li>
        ))}
      </ul>

      {total > PAGE_SIZE && (
        <div className="library-search-pagination">
          <Button
            variant="secondary"
            disabled={offset <= 0}
            onClick={() => void runSearch(debouncedQuery, Math.max(0, offset - PAGE_SIZE))}
          >
            {t('librarySearch.prev')}
          </Button>
          <span>
            {offset + 1}–{Math.min(offset + PAGE_SIZE, total)} / {total}
          </span>
          <Button
            variant="secondary"
            disabled={offset + PAGE_SIZE >= total}
            onClick={() => void runSearch(debouncedQuery, offset + PAGE_SIZE)}
          >
            {t('librarySearch.next')}
          </Button>
        </div>
      )}
    </div>
  );
}
