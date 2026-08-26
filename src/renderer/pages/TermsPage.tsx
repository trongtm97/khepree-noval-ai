import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BookOpen, Lock } from 'lucide-react';
import type { TermCandidateDto, TermDto } from '@shared/schemas/term';
import {
  TERM_SCOPES,
  TERM_STATUSES,
  TERM_TYPES,
  type TermScope,
  type TermStatus,
  type TermType,
} from '@shared/constants/term';
import { useT } from '../i18n';
import { friendlyError } from '../i18n/errors';
import {
  termScopeLabel,
  termStatusLabel,
  termTypeLabel,
} from '../i18n/enums';
import {
  PageHeader,
  Button,
  Tabs,
  TabPanel,
  EmptyState,
  Badge,
  DataTable,
  Select,
  Input,
  SearchInput,
  ErrorPanel,
  Skeleton,
} from '../components/ui';
import { HelpContextButton } from '../features/help/HelpContextButton';
import { helpArticleForErrorCode } from '../features/help/content';

type Tab = 'vault' | 'review' | 'candidates';

const EMPTY_FILTERS = {
  chinese: '',
  vietnamese: '',
  pinyin: '',
  type: '' as TermType | '',
  scope: '' as TermScope | '',
  status: '' as TermStatus | '',
  genre: '',
};

export function TermsPage() {
  const t = useT();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('vault');
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [terms, setTerms] = useState<TermDto[]>([]);
  const [candidates, setCandidates] = useState<TermCandidateDto[]>([]);
  const [candidateCount, setCandidateCount] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const candidateResult = await window.novelTrans.terms.listCandidates({});
    setCandidateCount(candidateResult.candidates.length);
    if (tab === 'vault') {
      const result = await window.novelTrans.terms.search({
        chinese: filters.chinese || undefined,
        vietnamese: filters.vietnamese || undefined,
        pinyin: filters.pinyin || undefined,
        type: filters.type || undefined,
        scope: filters.scope || undefined,
        status: filters.status || undefined,
        genre: filters.genre || undefined,
        limit: 200,
      });
      setTerms(result.terms);
    } else if (tab === 'review') {
      const result = await window.novelTrans.terms.reviewQueue();
      setTerms(result.terms);
    } else {
      setCandidates(candidateResult.candidates);
    }
    setSelected(new Set());
  }, [tab, filters]);

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

  const bulkReview = (action: 'accept' | 'reject' | 'lock' | 'promote') => {
    if (selectedIds.length === 0) return;
    void run(async () => {
      await window.novelTrans.terms.review({
        action,
        termIds: selectedIds,
        targetScope: action === 'promote' ? 'GLOBAL' : undefined,
      });
      setMessage(
        t('terms.bulkApplied', { action, count: selectedIds.length }),
      );
    });
  };

  const exportTerms = (format: 'csv' | 'json') => {
    void run(async () => {
      const result = await window.novelTrans.terms.export({ format, filters });
      await navigator.clipboard.writeText(result.content);
      setMessage(t('terms.exported', { count: result.count, format }));
    });
  };

  const importTerms = () => {
    const content = window.prompt(t('terms.promptImport'));
    if (!content?.trim()) return;
    const format: 'csv' | 'json' = content.trim().startsWith('[') ? 'json' : 'csv';
    void run(async () => {
      const result = await window.novelTrans.terms.import({
        format,
        content,
        scope: 'GLOBAL',
      });
      setMessage(t('terms.imported', { count: result.terms.length }));
    });
  };

  const addTerm = () => {
    const sourceText = window.prompt(t('terms.promptSource'));
    if (!sourceText?.trim()) return;
    const preferredTranslation = window.prompt(t('terms.promptTarget')) ?? '';
    void run(async () => {
      await window.novelTrans.terms.upsert({
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
      await window.novelTrans.terms.candidateReview({
        candidateIds: selectedIds,
        action,
        patch: { scope: 'GLOBAL' },
      });
      setMessage(
        t('terms.candidateApplied', { action, count: selectedIds.length }),
      );
    });
  };

  if (loading) {
    return (
      <div>
        <PageHeader title={t('terms.title')} description={t('terms.subtitle')} />
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
          onChange={() => {
            toggleSelect(term.id);
          }}
          onClick={(e) => {
            e.stopPropagation();
          }}
        />
      ),
    },
    {
      key: 'source',
      header: t('terms.source'),
      render: (term: TermDto) => term.sourceText,
    },
    {
      key: 'target',
      header: t('terms.target'),
      render: (term: TermDto) => term.preferredTranslation ?? '—',
    },
    {
      key: 'pinyin',
      header: t('terms.pinyin'),
      render: (term: TermDto) => term.pinyin ?? '—',
    },
    {
      key: 'type',
      header: t('terms.type'),
      render: (term: TermDto) => <Badge>{termTypeLabel(term.type)}</Badge>,
    },
    {
      key: 'scope',
      header: t('terms.scope'),
      render: (term: TermDto) => (
        <span>
          {termScopeLabel(term.scope)}
          {term.locked ? <Lock size={12} style={{ marginLeft: 4 }} aria-hidden /> : null}
        </span>
      ),
    },
    {
      key: 'status',
      header: t('terms.status'),
      render: (term: TermDto) => termStatusLabel(term.status),
    },
    {
      key: 'genre',
      header: t('terms.genre'),
      render: (term: TermDto) => term.genre ?? '—',
    },
    {
      key: 'occ',
      header: t('terms.occ'),
      render: (term: TermDto) => term.occurrences,
    },
    {
      key: 'proj',
      header: t('terms.proj'),
      render: (term: TermDto) => term.projectCount,
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
          onChange={() => {
            toggleSelect(c.id);
          }}
          onClick={(e) => {
            e.stopPropagation();
          }}
        />
      ),
    },
    {
      key: 'source',
      header: t('terms.source'),
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
      key: 'conf',
      header: t('terms.conf'),
      render: (c: TermCandidateDto) => c.confidence?.toFixed(2) ?? '—',
    },
    {
      key: 'tags',
      header: t('terms.tags'),
      render: (c: TermCandidateDto) => c.heuristicTags.join(', '),
    },
    {
      key: 'snippet',
      header: t('terms.snippet'),
      render: (c: TermCandidateDto) => (
        <span className="muted">{c.contextSnippet ?? '—'}</span>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title={t('terms.title')}
        description={t('terms.subtitle')}
        actions={
          <>
            <HelpContextButton articleId="term-vault" />
            <Button variant="primary" disabled={busy} onClick={addTerm}>
              {t('terms.addTerm')}
            </Button>
            <Button variant="secondary" disabled={busy} onClick={importTerms}>
              {t('actions.import')}
            </Button>
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => {
                exportTerms('csv');
              }}
            >
              {t('actions.export')} CSV
            </Button>
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => {
                exportTerms('json');
              }}
            >
              {t('actions.export')} JSON
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                navigate('/learning');
              }}
            >
              {t('terms.openLearning')}
            </Button>
          </>
        }
      />

      <p className="muted">{t('terms.priorityHint')}</p>

      <Tabs
        items={[
          { id: 'vault', label: t('terms.vault') },
          { id: 'review', label: t('terms.review') },
          {
            id: 'candidates',
            label:
              candidateCount > 0
                ? `${t('terms.candidates')} (${candidateCount})`
                : t('terms.candidates'),
          },
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
        <div className="term-filters" style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', margin: '0.75rem 0' }}>
          <SearchInput
            placeholder={t('terms.source')}
            value={filters.chinese}
            onChange={(e) => {
              setFilters((f) => ({ ...f, chinese: e.target.value }));
            }}
          />
          <Input
            placeholder={t('terms.target')}
            value={filters.vietnamese}
            onChange={(e) => {
              setFilters((f) => ({ ...f, vietnamese: e.target.value }));
            }}
          />
          <Input
            placeholder={t('terms.pinyin')}
            value={filters.pinyin}
            onChange={(e) => {
              setFilters((f) => ({ ...f, pinyin: e.target.value }));
            }}
          />
          <Select
            value={filters.type}
            onChange={(e) => {
              setFilters((f) => ({ ...f, type: e.target.value as TermType | '' }));
            }}
          >
            <option value="">{t('terms.allTypes')}</option>
            {TERM_TYPES.map((ty) => (
              <option key={ty} value={ty}>
                {termTypeLabel(ty)}
              </option>
            ))}
          </Select>
          <Select
            value={filters.scope}
            onChange={(e) => {
              setFilters((f) => ({ ...f, scope: e.target.value as TermScope | '' }));
            }}
          >
            <option value="">{t('terms.allScopes')}</option>
            {TERM_SCOPES.map((s) => (
              <option key={s} value={s}>
                {termScopeLabel(s)}
              </option>
            ))}
          </Select>
          <Select
            value={filters.status}
            onChange={(e) => {
              setFilters((f) => ({ ...f, status: e.target.value as TermStatus | '' }));
            }}
          >
            <option value="">{t('terms.allStatuses')}</option>
            {TERM_STATUSES.map((s) => (
              <option key={s} value={s}>
                {termStatusLabel(s)}
              </option>
            ))}
          </Select>
          <Input
            placeholder={t('terms.genre')}
            value={filters.genre}
            onChange={(e) => {
              setFilters((f) => ({ ...f, genre: e.target.value }));
            }}
          />
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() => {
              void refresh();
            }}
          >
            {t('actions.search')}
          </Button>
        </div>
      </TabPanel>

      {(tab === 'vault' || tab === 'review') && (
        <>
          <div className="btn-row" style={{ marginBottom: '0.75rem' }}>
            <Button
              variant="secondary"
              disabled={busy || !selected.size}
              onClick={() => {
                bulkReview('accept');
              }}
            >
              {t('terms.accept')}
            </Button>
            <Button
              variant="secondary"
              disabled={busy || !selected.size}
              onClick={() => {
                bulkReview('reject');
              }}
            >
              {t('terms.reject')}
            </Button>
            <Button
              variant="secondary"
              disabled={busy || !selected.size}
              onClick={() => {
                bulkReview('lock');
              }}
            >
              {t('terms.lock')}
            </Button>
            <Button
              variant="secondary"
              disabled={busy || !selected.size}
              onClick={() => {
                bulkReview('promote');
              }}
            >
              {t('terms.promote')}
            </Button>
          </div>
          {terms.length === 0 ? (
            <EmptyState
              icon={<BookOpen />}
              title={tab === 'review' ? t('terms.emptyReview') : t('terms.emptyFilter')}
              description={
                tab === 'review'
                  ? t('terms.emptyDesc')
                  : candidateCount > 0
                    ? t('terms.emptyVaultDesc')
                    : t('terms.emptyDesc')
              }
            />
          ) : (
            <DataTable columns={termColumns} rows={terms} rowKey={(row) => row.id} />
          )}
        </>
      )}

      <TabPanel active={tab === 'candidates'}>
        <div className="btn-row" style={{ margin: '0.75rem 0' }}>
          <Button
            variant="secondary"
            disabled={busy || !selected.size}
            onClick={() => {
              candidateBulk('accept');
            }}
          >
            {t('terms.accept')}
          </Button>
          <Button
            variant="secondary"
            disabled={busy || !selected.size}
            onClick={() => {
              candidateBulk('reject');
            }}
          >
            {t('terms.reject')}
          </Button>
        </div>
        {candidates.length === 0 ? (
          <EmptyState
            icon={<BookOpen />}
            title={t('terms.emptyCandidates')}
            description={t('terms.emptyCandidatesDesc')}
          />
        ) : (
          <DataTable
            columns={candidateColumns}
            rows={candidates}
            rowKey={(row) => row.id}
          />
        )}
      </TabPanel>
    </div>
  );
}
