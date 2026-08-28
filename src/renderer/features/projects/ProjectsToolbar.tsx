import { useEffect, useRef } from 'react';
import { LayoutGrid, List } from 'lucide-react';
import { useT } from '../../i18n';
import { SearchInput, Select } from '../../components/ui';

export type ProjectsSortKey = 'updated' | 'name' | 'progress';
export type ProjectsViewMode = 'grid' | 'list';

export interface ProjectsToolbarProps {
  query: string;
  onQueryChange: (value: string) => void;
  sort: ProjectsSortKey;
  onSortChange: (value: ProjectsSortKey) => void;
  view: ProjectsViewMode;
  onViewChange: (value: ProjectsViewMode) => void;
}

export function ProjectsToolbar({
  query,
  onQueryChange,
  sort,
  onSortChange,
  view,
  onViewChange,
}: ProjectsToolbarProps) {
  const t = useT();
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  return (
    <div className="projects-toolbar" role="toolbar" aria-label={t('projects.toolbarLabel')}>
      <SearchInput
        ref={searchRef}
        className="projects-toolbar__search"
        placeholder={t('projects.searchPlaceholder')}
        value={query}
        onChange={(e) => {
          onQueryChange(e.target.value);
        }}
        onClear={() => {
          onQueryChange('');
        }}
      />
      <Select
        className="projects-toolbar__sort"
        value={sort}
        onChange={(e) => {
          onSortChange(e.target.value as ProjectsSortKey);
        }}
        aria-label={t('projects.sortLabel')}
      >
        <option value="updated">{t('projects.sortUpdated')}</option>
        <option value="name">{t('projects.sortName')}</option>
        <option value="progress">{t('projects.sortProgress')}</option>
      </Select>
      <div className="projects-view-toggle" role="group" aria-label={t('projects.viewModeLabel')}>
        <button
          type="button"
          className="projects-view-toggle__btn"
          aria-pressed={view === 'list'}
          aria-label={t('projects.viewList')}
          title={t('projects.viewList')}
          onClick={() => {
            onViewChange('list');
          }}
        >
          <List size={16} aria-hidden />
        </button>
        <button
          type="button"
          className="projects-view-toggle__btn"
          aria-pressed={view === 'grid'}
          aria-label={t('projects.viewGrid')}
          title={t('projects.viewGrid')}
          onClick={() => {
            onViewChange('grid');
          }}
        >
          <LayoutGrid size={16} aria-hidden />
        </button>
      </div>
    </div>
  );
}
