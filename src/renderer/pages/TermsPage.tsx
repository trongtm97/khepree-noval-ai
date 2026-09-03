import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { BookOpen, Lock } from 'lucide-react';
import type { TermCandidateDto, TermDto } from '@shared/schemas/term';
import type { ProjectDto } from '@shared/schemas/import';
import { DEFAULT_SOURCE_LANGUAGE, DEFAULT_TARGET_LANGUAGE } from '@shared/constants/language-profile';
import { useT } from '../i18n';
import { friendlyError } from '../i18n/errors';
import { termStatusLabel, termTypeLabel } from '../i18n/enums';
import {
  Button,
  Tabs,
  TabPanel,
  EmptyState,
  Badge,
  DataTable,
  SearchInput,
  ErrorPanel,
  Skeleton,
} from '../components/ui';
import { ProjectSectionHeader } from '../components/shell/ProjectSectionHeader';
import { TermVaultTabularDialog } from '../components/TermVaultTabularDialog';
import { helpArticleForErrorCode } from '../features/help/content';
import { useUiShellStore } from '../stores/ui-shell-store';
import { termLanguageColumnLabels } from '../features/terms/term-language-labels';
import {
  TermFilterDrawer,
  countActiveTermFilters,
  type TermFiltersState,
} from '../features/terms/TermFilterDrawer';
import { TermDetailDrawer } from '../features/terms/TermDetailDrawer';

type Tab = 'vault' | 'review' | 'candidates';

const EMPTY_FILTERS: TermFiltersState = {
  type: '',
  scope: '',
  status: '',
  genre: '',
  pinyin: '',
};

export function TermsPage() {
  const t = useT();
  const showAdvancedTools = useUiShellStore((s) => s.showAdvancedTools);
  const { projectId = '' } = useParams();
  const [tab, setTab] = useState<Tab>('vault');
  const [searchQuery, setSearchQuery] = useState('');
  const [filters, setFilters] = useState<TermFiltersState>(EMPTY_FILTERS);
  const [filterOpen, setFilterOpen] = useState(false);
  const [terms, setTerms] = useState<TermDto[]>([]);
  const [candidates, setCandidates] = useState<TermCandidateDto[]>([]);
  const [candidateCount, setCandidateCount] = useState(0);
  const [vaultCount, setVaultCount] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [detailTerm, setDetailTerm] = useState<TermDto | null>(null);
  const [project, setProject] = useState<ProjectDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const columnLabels = useMemo(
    () =>
      termLanguageColumnLabels(
        project?.sourceLanguage ?? DEFAULT_SOURCE_LANGUAGE,
        project?.targetLanguage ?? DEFAULT_TARGET_LANGUAGE,
      ),
    [project],
  );

  const showTransliteration = columnLabels.transliterationLabel != null;

  const refresh = useCallback(async () => {
    const candidateResult = await window.khepreeNovelAI.terms.listCandidates(
      projectId ? { projectId } : {},
    );
    setCandidateCount(candidateResult.candidates.length);

    if (tab === 'vault') {
      const result = await window.khepreeNovelAI.terms.search({
        chinese: searchQuery || undefined,
        pinyin: filters.pinyin || undefined,
        type: filters.type || undefined,
        scope: filters.scope || undefined,
        status: filters.status || undefined,
        genre: filters.genre || undefined,
        projectId: projectId || undefined,
        limit: 200,
      });
      setTerms(result.terms);
      setVaultCount(result.terms.length);
    } else if (tab === 'review') {
      const result = await window.khepreeNovelAI.terms.reviewQueue();
      setTerms(result.terms);
    } else {
      setCandidates(candidateResult.candidates);
    }
    setSelected(new Set());
  }, [tab, searchQuery, filters, projectId]);

  useEffect(() => {
    if (!projectId) return;
    void window.khepreeNovelAI.projects
      .get(projectId)
      .then((res) => { setProject(res.project); })
      .catch(() => { setProject(null); });
  }, [projectId]);

  useEffect(() => {
    void refresh()
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : t('errors.UNKNOWN.title'));
      })
      .finally(() => {
        setLoading(false);
      });
  }, [refresh, t]);

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await action();
      await refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('errors.UNKNOWN.title'));
    } finally {
      setBusy(false);
    }
  };

  const selectedIds = useMemo(() => [...selected], [selected]);
  const activeFilterCount = countActiveTermFilters(filters);

  const bulkReview = (action: 'accept' | 'reject' | 'lock' | 'promote') => {
    if (selectedIds.length === 0) return;
    void run(async () => {
      await window.khepreeNovelAI.terms.review({
        action,
        termIds: selectedIds,
        targetScope: action === 'promote' ? 'GLOBAL' : undefined,
      });
      setMessage(t('terms.bulkApplied', { action, count: selectedIds.length }));
    });
  };

  const addTerm = () => {
    const sourceText = window.prompt(t('terms.promptSource'));
    if (!sourceText?.trim()) return;
    const preferredTranslation = window.prompt(t('terms.promptTarget')) ?? '';
    void run(async () => {
      await window.khepreeNovelAI.terms.upsert({
        sourceText: sourceText.trim(),
        preferredTranslation: preferredTranslation.trim() || undefined,
        scope: 'GLOBAL',
        status: 'CANDIDATE',
        type: 'GENERAL',
      });
      setMessage(t('terms.added'));
    });
  };

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const candidateBulk = (action: 'accept' | 'reject') => {
    if (selectedIds.length === 0) return;
    void run(async () => {
      await window.khepreeNovelAI.terms.candidateReview({
        candidateIds: selectedIds,
        action,
        patch: { scope: 'GLOBAL' },
      });
      setMessage(t('terms.candidateApplied', { action, count: selectedIds.length }));
    });
  };

  if (loading) {
    return (
      <div className="project-page">
        <ProjectSectionHeader title={t('terms.title')} description={t('terms.subtitlePlain')} />
        <Skeleton height={240} />
      </div>
    );
  }

  const errInfo = error ? friendlyError(error) : null;

  const termColumns = [
    {
      key: 'select',
      header: '',
      width: '2.5rem',
      render: (term: TermDto) => (
        <input
          type="checkbox"
          checked={selected.has(term.id)}
          onChange={() => { toggleSelect(term.id); }}
          onClick={(e) => { e.stopPropagation(); }}
        />
      ),
    },
    {
      key: 'source',
      header: columnLabels.sourceLabel,
      render: (term: TermDto) => term.sourceText,
    },
    {
      key: 'target',
      header: columnLabels.targetLabel,
      render: (term: TermDto) => term.preferredTranslation ?? '—',
    },
    {
      key: 'type',
      header: t('terms.type'),
      render: (term: TermDto) => <Badge>{termTypeLabel(term.type)}</Badge>,
    },
    {
      key: 'status',
      header: t('terms.status'),
      render: (term: TermDto) => termStatusLabel(term.status),
    },
    {
      key: 'occ',
      header: t('terms.colOccurrences'),
      render: (term: TermDto) => term.occurrences,
    },
    {
      key: 'lock',
      header: '',
      width: '2rem',
      render: (term: TermDto) =>
        term.locked ? <Lock size={14} aria-label={t('terms.lockedLabel')} /> : null,
    },
  ];

  const candidateColumns = [
    {
      key: 'select',
      header: '',
      width: '2.5rem',
      render: (c: TermCandidateDto) => (
        <input
          type="checkbox"
          checked={selected.has(c.id)}
          onChange={() => { toggleSelect(c.id); }}
          onClick={(e) => { e.stopPropagation(); }}
        />
      ),
    },
    {
      key: 'source',
      header: columnLabels.sourceLabel,
      render: (c: TermCandidateDto) => c.sourceText,
    },
    {
      key: 'type',
      header: t('terms.type'),
      render: (c: TermCandidateDto) => c.suggestedType ?? '—',
    },
    {
      key: 'freq',
      header: t('terms.freq'),
      render: (c: TermCandidateDto) => c.frequency,
    },
    {
      key: 'snippet',
      header: t('terms.snippet'),
      render: (c: TermCandidateDto) => (
        <span className="muted">{c.contextSnippet ?? '—'}</span>
      ),
    },
  ];

  const vaultLabel =
    vaultCount > 0 ? `${t('terms.tabVault')} (${vaultCount})` : t('terms.tabVault');
  const candidatesLabel =
    candidateCount > 0
      ? `${t('terms.tabCandidates')} (${candidateCount})`
      : t('terms.tabCandidates');

  return (
    <div className="project-page terms-page">
      <ProjectSectionHeader
        title={t('terms.title')}
        description={t('terms.subtitlePlain')}
        helpArticleId="term-vault"
        primaryAction={{
          id: 'add-term',
          label: t('terms.addTerm'),
          variant: 'primary',
          disabled: busy,
          onClick: addTerm,
        }}
        secondaryAction={{
          id: 'import-export',
          label: t('terms.importExportMenu'),
          element: (
            <TermVaultTabularDialog
              variant="dropdown"
              projectId={projectId || undefined}
              editionId={project?.activeEditionId ?? undefined}
              onComplete={(msg) => { setMessage(msg); }}
            />
          ),
        }}
      />

      <Tabs
        items={[
          { id: 'vault', label: vaultLabel },
          { id: 'review', label: t('terms.tabReview') },
          { id: 'candidates', label: candidatesLabel },
        ]}
        value={tab}
        onChange={(id) => {
          setTab(id as Tab);
          setLoading(true);
        }}
      />

      {errInfo ? (
        <ErrorPanel
          title={errInfo.title}
          description={errInfo.description}
          technical={errInfo.technical}
          helpArticleId={helpArticleForErrorCode(errInfo.code)}
        />
      ) : null}
      {message ? <div className="banner banner-info">{message}</div> : null}

      <TabPanel active={tab === 'vault'}>
        <div className="terms-toolbar">
          <SearchInput
            placeholder={t('terms.searchPlaceholder')}
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); }}
          />
          <Button
            variant={activeFilterCount > 0 ? 'primary' : 'secondary'}
            onClick={() => { setFilterOpen(true); }}
          >
            {t('terms.filterButton')}
            {activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
          </Button>
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() => void refresh()}
          >
            {t('actions.search')}
          </Button>
        </div>
        {activeFilterCount > 0 ? (
          <div className="filter-chips">
            {filters.type ? (
              <span className="filter-chip">{termTypeLabel(filters.type)}</span>
            ) : null}
            {filters.scope ? (
              <span className="filter-chip">{filters.scope}</span>
            ) : null}
            {filters.status ? (
              <span className="filter-chip">{termStatusLabel(filters.status)}</span>
            ) : null}
            {filters.genre ? <span className="filter-chip">{filters.genre}</span> : null}
          </div>
        ) : null}
      </TabPanel>

      {(tab === 'vault' || tab === 'review') && selected.size > 0 ? (
        <div className="bulk-actions-bar">
          <span className="muted">{t('terms.selectedCount', { count: selected.size })}</span>
          <Button variant="secondary" disabled={busy} onClick={() => { bulkReview('accept'); }}>
            {t('terms.accept')}
          </Button>
          <Button variant="secondary" disabled={busy} onClick={() => { bulkReview('reject'); }}>
            {t('terms.reject')}
          </Button>
          <Button variant="secondary" disabled={busy} onClick={() => { bulkReview('lock'); }}>
            {t('terms.lock')}
          </Button>
          {showAdvancedTools ? (
            <Button variant="secondary" disabled={busy} onClick={() => { bulkReview('promote'); }}>
              {t('terms.promoteGlobal')}
            </Button>
          ) : null}
        </div>
      ) : null}

      {(tab === 'vault' || tab === 'review') &&
        (terms.length === 0 ? (
          <EmptyState
            icon={<BookOpen />}
            title={
              tab === 'review'
                ? t('terms.emptyReview')
                : activeFilterCount > 0 || searchQuery.trim()
                  ? t('terms.emptyFilter')
                  : t('terms.emptyTitle')
            }
            description={
              tab === 'review'
                ? t('terms.emptyVaultDesc')
                : activeFilterCount > 0 || searchQuery.trim()
                  ? undefined
                  : showAdvancedTools
                    ? t('terms.emptyDescAdvanced')
                    : t('terms.emptyDesc')
            }
            actionLabel={
              tab === 'vault' && activeFilterCount === 0 && !searchQuery.trim()
                ? t('terms.addTerm')
                : undefined
            }
            onAction={
              tab === 'vault' && activeFilterCount === 0 && !searchQuery.trim() ? addTerm : undefined
            }
          />
        ) : (
          <DataTable
            columns={termColumns}
            rows={terms}
            rowKey={(row) => row.id}
            onRowClick={(row) => { setDetailTerm(row); }}
          />
        )
      )}

      <TabPanel active={tab === 'candidates'}>
        {selected.size > 0 ? (
          <div className="bulk-actions-bar">
            <span className="muted">{t('terms.selectedCount', { count: selected.size })}</span>
            <Button variant="secondary" disabled={busy} onClick={() => { candidateBulk('accept'); }}>
              {t('terms.accept')}
            </Button>
            <Button variant="secondary" disabled={busy} onClick={() => { candidateBulk('reject'); }}>
              {t('terms.reject')}
            </Button>
          </div>
        ) : null}
        {candidates.length === 0 ? (
          <EmptyState
            icon={<BookOpen />}
            title={t('terms.emptyCandidates')}
            description={t('terms.emptyCandidatesDesc')}
          />
        ) : (
          <DataTable columns={candidateColumns} rows={candidates} rowKey={(row) => row.id} />
        )}
      </TabPanel>

      <TermFilterDrawer
        open={filterOpen}
        filters={filters}
        showTransliteration={showTransliteration}
        transliterationLabel={columnLabels.transliterationLabel}
        onClose={() => { setFilterOpen(false); }}
        onChange={setFilters}
        onApply={() => {
          setFilterOpen(false);
          void refresh();
        }}
        onClear={() => {
          setFilters(EMPTY_FILTERS);
          setFilterOpen(false);
        }}
      />

      <TermDetailDrawer
        open={detailTerm != null}
        busy={busy}
        term={detailTerm}
        onClose={() => { setDetailTerm(null); }}
        onSaved={() => {
          setDetailTerm(null);
          void refresh();
        }}
        onError={setError}
      />
    </div>
  );
}
