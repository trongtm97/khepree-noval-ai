import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { NotebookDualHealthDto, NotebookHealthDto } from '@shared/schemas/notebook';
import { Button, Badge, ErrorPanel, ProgressBar } from '../components/ui';
import { ProjectSectionHeader } from '../components/shell/ProjectSectionHeader';
import { MemoryDetailDrawer } from '../features/ai-memory/MemoryDetailDrawer';
import { NotebookDuplicateResolver } from '../features/ai-memory/NotebookDuplicateResolver';
import type { CharacterDto, MemoryConflictDto, RelationshipDto, StoryStateDto } from '@shared/schemas/memory';
import type { TermDto } from '@shared/schemas/term';
import type { ProjectDto } from '@shared/schemas/import';
import { useT } from '../i18n';
import { friendlyError } from '../i18n/errors';
import { statusLabel } from '../i18n/status';
import { useUiShellStore } from '../stores/ui-shell-store';
import { confirmDangerous } from '../utils/confirm-dangerous';

type FriendlyStatus = 'ready' | 'pending' | 'stale' | 'error' | 'assisted' | 'unknown';

function classifyResearchStatus(
  research: NotebookDualHealthDto['research'],
): FriendlyStatus {
  if (!research) return 'unknown';
  if (research.status === 'assisted_setup') return 'assisted';
  if (research.status === 'error' || research.status === 'unavailable') return 'error';
  if (research.status === 'ready') return 'ready';
  if (
    research.status === 'stale' ||
    research.status === 'sync_pending' ||
    research.status === 'syncing'
  ) {
    return 'pending';
  }
  return 'unknown';
}

export function AiMemoryPage() {
  const t = useT();
  const navigate = useNavigate();
  const { projectId: paramProjectId = '' } = useParams();
  const storeProjectId = useUiShellStore((s) => s.currentProjectId) ?? '';
  const showAdvancedTools = useUiShellStore((s) => s.showAdvancedTools);
  const projectId = paramProjectId || storeProjectId;
  const [dualHealth, setDualHealth] = useState<NotebookDualHealthDto | null>(null);
  const [health, setHealth] = useState<NotebookHealthDto | null>(null);
  const [syncStatusMsg, setSyncStatusMsg] = useState<string | null>(null);
  const [bootstrap, setBootstrap] = useState<{
    status: string;
    throughChapter: number | null;
    version: string;
    chapterCount: number;
    characterCount: number;
    relationshipCount: number;
    termCandidateCount: number;
    hasLegacyDriveConfig?: boolean;
  } | null>(null);
  const [legacyDriveDismissed, setLegacyDriveDismissed] = useState(false);
  const [summary, setSummary] = useState({
    characters: 0,
    terms: 0,
    relationships: 0,
    throughChapter: null as number | null,
  });
  const [charactersList, setCharactersList] = useState<CharacterDto[]>([]);
  const [relationshipsList, setRelationshipsList] = useState<RelationshipDto[]>([]);
  const [termsList, setTermsList] = useState<TermDto[]>([]);
  const [storyState, setStoryState] = useState<StoryStateDto | null>(null);
  const [conflicts, setConflicts] = useState<MemoryConflictDto[]>([]);
  const [project, setProject] = useState<ProjectDto | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [accountEmail, setAccountEmail] = useState<string | null>(null);
  const [accountOptions, setAccountOptions] = useState<
    { id: string; email: string | null; status: string }[]
  >([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progressMsg, setProgressMsg] = useState<string | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [packInfo, setPackInfo] = useState<{
    outputDir: string;
    parts: { fileName: string; wordCount: number; chapterFrom: number; chapterTo: number }[];
    totalWords: number;
    totalChapters: number;
  } | null>(null);
  const [importText, setImportText] = useState('');
  const [researchQuestion, setResearchQuestion] = useState('');
  const [researchAnswer, setResearchAnswer] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!projectId) return;
    const [dual, accounts, boot, resolved, chars, rels, terms, storyRes, conflictRes, projectRes] =
      await Promise.all([
      window.khepreeNovelAI.notebook.health({
        projectId,
        dual: true,
      }) as Promise<NotebookDualHealthDto>,
      window.khepreeNovelAI.accounts.list(),
      window.khepreeNovelAI.notebook.getBootstrapStatus(projectId),
      window.khepreeNovelAI.projects.resolveWorker({
        projectId,
        purpose: 'notebook',
      }),
      window.khepreeNovelAI.memory.listCharacters(projectId),
      window.khepreeNovelAI.memory.listRelationships({ projectId }),
      window.khepreeNovelAI.terms.search({ projectId, limit: 500 }),
      window.khepreeNovelAI.memory.getStoryState(projectId),
      window.khepreeNovelAI.memory.listConflicts(projectId),
      window.khepreeNovelAI.projects.get(projectId),
    ]);
    setDualHealth(dual);
    setHealth(dual.translation);
    setBootstrap(boot);
    setAccountId(resolved.accountId ?? dual.translation.accountId);
    setAccountEmail(resolved.email);
    setAccountOptions(
      accounts.accounts.map((a) => ({
        id: a.id,
        email: a.email,
        status: a.status,
      })),
    );
    setSummary({
      characters: chars.characters.length || boot.characterCount,
      terms: terms.terms.length || boot.termCandidateCount,
      relationships: rels.relationships.length || boot.relationshipCount,
      throughChapter: boot.throughChapter,
    });
    setCharactersList(chars.characters);
    setRelationshipsList(rels.relationships);
    setTermsList(terms.terms);
    setStoryState(storyRes.storyState);
    setConflicts(conflictRes.conflicts);
    setProject(projectRes.project);
    try {
      const sync = await window.khepreeNovelAI.notebook.listSyncStatus({ projectId });
      setSyncStatusMsg(sync.userMessage);
    } catch {
      setSyncStatusMsg(null);
    }
  }, [projectId]);

  const changeWorker = async (nextAccountId: string) => {
    if (!projectId || nextAccountId === accountId) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const result = await window.khepreeNovelAI.projects.setWorker({
        projectId,
        accountId: nextAccountId,
        ensureNotebook: false,
      });
      await refresh();
      setMessage(result.message);
      if (result.needsAssisted) setError(result.message);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('errors.UNKNOWN.title'));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (!projectId) return;
    setLegacyDriveDismissed(
      window.localStorage.getItem(`legacy-drive-notice:${projectId}`) === '1',
    );
  }, [projectId]);

  useEffect(() => {
    void refresh().catch((err: unknown) => {
      setError(err instanceof Error ? err.message : t('errors.UNKNOWN.title'));
    });
  }, [refresh, t]);

  useEffect(() => {
    if (!busy || !projectId) return;
    const id = window.setInterval(() => {
      void window.khepreeNovelAI.notebook.getAutoPreprocessProgress(projectId).then((p) => {
        if (p.message) setProgressMsg(p.message);
      });
    }, 1000);
    return () => {
      window.clearInterval(id);
    };
  }, [busy, projectId]);

  const run = async (fn: () => Promise<unknown>, okMsg: string) => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await fn();
      await refresh();
      setMessage(okMsg);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('errors.UNKNOWN.title'));
    } finally {
      setBusy(false);
    }
  };

  const openNotebook = async () => {
    if (!projectId) return;
    if (!accountId) {
      navigate('/accounts');
      return;
    }
    try {
      await window.khepreeNovelAI.notebook.openResearch({ projectId, accountId });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('errors.UNKNOWN.title'));
    }
  };

  const runResearchQuery = async () => {
    if (!projectId || !researchQuestion.trim()) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    setResearchAnswer(null);
    try {
      const result = await window.khepreeNovelAI.notebook.researchQuery({
        projectId,
        accountId: accountId ?? undefined,
        question: researchQuestion.trim(),
      });
      setResearchAnswer(`${result.answer}\n\n— ${result.disclaimer}`);
      setMessage(t('aiMemory.researchQueryOk'));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('errors.UNKNOWN.title'));
    } finally {
      setBusy(false);
    }
  };

  const initMemory = async (forceFull = false) => {
    if (!projectId) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    setProgressMsg(t('aiMemory.initStarting'));
    try {
      const result = await window.khepreeNovelAI.notebook.runAutoPreprocess({
        projectId,
        forceFull,
        googleAccountId: accountId,
      });
      await refresh();
      if (result.status === 'failed') {
        setError(result.message);
      } else if (result.needsAssisted) {
        setError(result.message);
        setMessage(t('aiMemory.initNeedsAssisted'));
      } else {
        setMessage(
          t('aiMemory.initOkFriendly', {
            message: result.message,
          }),
        );
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('errors.UNKNOWN.title'));
    } finally {
      setBusy(false);
      setProgressMsg(null);
    }
  };

  const packCorpus = async () => {
    if (!projectId) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const result = await window.khepreeNovelAI.notebook.packNovelCorpus({ projectId });
      setPackInfo({
        outputDir: result.outputDir,
        parts: result.parts.map((p) => ({
          fileName: p.fileName,
          wordCount: p.wordCount,
          chapterFrom: p.chapterFrom,
          chapterTo: p.chapterTo,
        })),
        totalWords: result.totalWords,
        totalChapters: result.totalChapters,
      });
      setMessage(
        t('aiMemory.packOk', {
          parts: result.parts.length,
          chapters: result.totalChapters,
          words: result.totalWords,
          dir: result.outputDir,
        }),
      );
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('errors.UNKNOWN.title'));
    } finally {
      setBusy(false);
    }
  };

  const copyPrompt = async () => {
    if (!projectId) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const partFileNames = packInfo?.parts.map((p) => p.fileName);
      const result = await window.khepreeNovelAI.notebook.getPreprocessPrompt({
        projectId,
        partFileNames,
      });
      try {
        await navigator.clipboard.writeText(result.prompt);
        setMessage(t('aiMemory.promptCopied', { path: result.promptPath ?? '—' }));
      } catch {
        setMessage(t('aiMemory.promptCopyFailed'));
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('errors.UNKNOWN.title'));
    } finally {
      setBusy(false);
    }
  };

  const importResult = async (filePath?: string | null) => {
    if (!projectId) return;
    if (!filePath && !importText.trim()) {
      setError(t('aiMemory.pasteResult'));
      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const result = await window.khepreeNovelAI.notebook.importPreprocessResult({
        projectId,
        text: filePath ? undefined : importText,
        filePath: filePath ?? undefined,
        syncLocalKnowledge: true,
      });
      await refresh();
      setMessage(
        t('aiMemory.importOk', {
          message: result.message,
          chars: result.charactersUpserted,
          rels: result.relationshipsUpserted,
          terms: result.termCandidatesCreated,
        }),
      );
      setImportText('');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('errors.UNKNOWN.title'));
    } finally {
      setBusy(false);
    }
  };

  const friendly = classifyResearchStatus(dualHealth?.research ?? null);

  const researchOk =
    dualHealth?.research != null &&
    (dualHealth.research.status === 'ready' ||
      dualHealth.research.status === 'sync_pending' ||
      dualHealth.research.status === 'syncing' ||
      dualHealth.research.status === 'stale');
  const researchDone =
    researchOk ||
    bootstrap?.status === 'COMPLETED' ||
    bootstrap?.status === 'COMPLETED_WITH_WARNINGS' ||
    bootstrap?.status === 'READY' ||
    (bootstrap?.throughChapter != null && bootstrap.throughChapter > 0);

  const localMemoryReady =
    summary.characters > 0 ||
    summary.terms > 0 ||
    summary.relationships > 0 ||
    (summary.throughChapter ?? 0) > 0 ||
    bootstrap?.status === 'COMPLETED' ||
    bootstrap?.status === 'COMPLETED_WITH_WARNINGS' ||
    bootstrap?.status === 'READY';

  const errorCta =
    error || friendly === 'error' || friendly === 'assisted'
      ? friendly === 'assisted' || dualHealth?.research?.status === 'assisted_setup'
        ? {
            label: t('aiMemory.ctaOpenNotebook'),
            onClick: () => {
              void openNotebook();
            },
          }
        : !accountId
          ? {
              label: t('aiMemory.ctaAddAccount'),
              onClick: () => {
                navigate('/accounts');
              },
            }
          : !dualHealth?.research || dualHealth.research.status === 'pending' || dualHealth.research.status === 'unavailable'
            ? {
                label: t('aiMemory.ctaInitMemory'),
                onClick: () => {
                  void initMemory(false);
                },
              }
            : {
                label: t('aiMemory.ctaInitMemory'),
                onClick: () => {
                  void initMemory(false);
                },
              }
      : null;

  const storyChapter = summary.throughChapter ?? bootstrap?.throughChapter ?? null;
  const totalChapters =
    project?.sourceChapterCount ?? bootstrap?.chapterCount ?? storyChapter ?? 0;
  const researchProgressPct =
    totalChapters > 0 && storyChapter != null
      ? Math.min(100, Math.round((storyChapter / totalChapters) * 100))
      : 0;
  const researchFullyComplete =
    totalChapters > 0 && storyChapter != null && storyChapter >= totalChapters;
  const fullResearchChapter =
    bootstrap?.throughChapter ?? bootstrap?.chapterCount ?? storyChapter;
  const showLegacyDriveNotice =
    Boolean(bootstrap?.hasLegacyDriveConfig) && !legacyDriveDismissed;

  const dismissLegacyDriveNotice = () => {
    if (!projectId) return;
    window.localStorage.setItem(`legacy-drive-notice:${projectId}`, '1');
    setLegacyDriveDismissed(true);
  };

  if (!projectId) {
    return (
      <div className="ai-memory-page">
        <h1>{t('aiMemory.title')}</h1>
        <p>{t('aiMemory.noProject')}</p>
        <Button
          onClick={() => {
            navigate('/projects');
          }}
        >
          {t('nav.projects')}
        </Button>
      </div>
    );
  }

  return (
    <div className="project-page ai-memory-page">
      <ProjectSectionHeader
        title={t('aiMemory.title')}
        description={t('aiMemory.subtitle')}
        helpArticleId="bootstrap-memory"
        primaryAction={
          !localMemoryReady
            ? {
                id: 'init-memory',
                label: t('aiMemory.initMemory'),
                variant: 'primary',
                disabled: busy,
                onClick: () => {
                  void initMemory(false);
                },
              }
            : undefined
        }
        secondaryAction={
          researchDone
            ? {
                id: 'lookup',
                label: t('aiMemory.researchLookup'),
                disabled: busy || !accountId,
                onClick: () => {
                  const el = document.getElementById('research-query');
                  el?.focus();
                },
              }
            : undefined
        }
      />

      {projectId ? (
        <NotebookDuplicateResolver
          projectId={projectId}
          onResolved={() => {
            void refresh();
          }}
        />
      ) : null}

      {syncStatusMsg ? (
        <p className="muted ai-memory-sync-status" role="status">
          {syncStatusMsg}
        </p>
      ) : null}

      {showLegacyDriveNotice ? (
        <div className="banner banner-info ai-memory-legacy-drive" role="status">
          <p>{t('aiMemory.legacyDriveNotice')}</p>
          <Button size="sm" variant="ghost" onClick={dismissLegacyDriveNotice}>
            {t('aiMemory.legacyDriveDismiss')}
          </Button>
        </div>
      ) : null}

      {(error || friendly === 'error' || friendly === 'assisted') && errorCta ? (
        <ErrorPanel
          title={friendlyError(error ?? dualHealth?.research?.lastError ?? health?.lastError).title}
          description={
            friendly === 'assisted'
              ? t('aiMemory.initNeedsAssisted')
              : friendlyError(error ?? dualHealth?.research?.lastError ?? health?.lastError).description
          }
          technical={error ?? dualHealth?.research?.lastError ?? health?.lastError}
          tone={friendly === 'assisted' ? 'warning' : 'error'}
          actions={[
            {
              label: errorCta.label,
              onClick: errorCta.onClick,
              primary: true,
            },
          ]}
        />
      ) : null}

      {message ? <p className="success-text">{message}</p> : null}
      {progressMsg && busy ? <p className="muted">{progressMsg}</p> : null}

      <section className="ai-memory-card">
        <div className="ai-memory-card__head">
          <h2 className="ai-memory-section-title">{t('aiMemory.localMemorySection')}</h2>
          {localMemoryReady ? (
            <span className="project-status-quiet">✓ {t('aiMemory.localMemoryReadyShort')}</span>
          ) : (
            <Badge tone="warning">{t('aiMemory.localMemoryPending')}</Badge>
          )}
        </div>

        <div className="source-metrics-row ai-memory-metrics">
          <MemoryMetric value={summary.terms} label={t('aiMemory.metricTerms')} />
          <MemoryMetric value={summary.characters} label={t('aiMemory.metricCharacters')} />
          <MemoryMetric value={summary.relationships} label={t('aiMemory.metricRelationships')} />
          <MemoryMetric
            value={storyChapter ?? 0}
            label={t('aiMemory.metricLearnedChapter')}
            quiet={storyChapter == null || storyChapter === 0}
          />
        </div>

        <Button variant="secondary" onClick={() => { setDetailOpen(true); }}>
          {t('aiMemory.viewMemoryDetail')}
        </Button>
      </section>

      <p className="ai-memory-optional-note muted">{t('aiMemory.optionalResearchNote')}</p>

      <section className="ai-memory-card">
        <h2 className="ai-memory-section-title">{t('aiMemory.fullResearchSectionPlain')}</h2>
        <p className="muted">{t('aiMemory.fullResearchDesc')}</p>

        {researchFullyComplete && fullResearchChapter != null ? (
          <p className="project-status-quiet">
            ✓ {t('aiMemory.fullResearchComplete', { n: String(totalChapters || fullResearchChapter) })}
          </p>
        ) : (
          <>
            {storyChapter != null && totalChapters > 0 ? (
              <div className="ai-memory-research-progress">
                <p className="overview-stat">
                  {t('aiMemory.researchProgress', {
                    done: storyChapter,
                    total: totalChapters,
                  })}{' '}
                  · {researchProgressPct}%
                </p>
                <ProgressBar value={researchProgressPct} label={t('aiMemory.fullResearchSectionPlain')} />
              </div>
            ) : (
              <p className="muted">{t('aiMemory.fullResearchPending')}</p>
            )}
            <div className="ai-memory-actions">
              <Button variant="primary" disabled={busy} onClick={() => void initMemory(false)}>
                {t('aiMemory.continueResearch')}
              </Button>
              <Button variant="secondary" disabled={busy || !accountId} onClick={() => void openNotebook()}>
                {t('aiMemory.openResearchNotebook')}
              </Button>
            </div>
          </>
        )}
      </section>

      <section className="ai-memory-card ai-memory-card--optional">
        <h2 className="ai-memory-section-title">{t('aiMemory.lookupSection')}</h2>
        <p className="muted">{t('aiMemory.lookupHint')}</p>
        <div className="ai-memory-research-query">
          <label htmlFor="research-query">{t('aiMemory.researchQueryLabel')}</label>
          <textarea
            id="research-query"
            rows={2}
            value={researchQuestion}
            disabled={busy}
            placeholder={t('aiMemory.researchQueryPlaceholder')}
            onChange={(e) => {
              setResearchQuestion(e.target.value);
            }}
          />
          <Button
            variant="secondary"
            disabled={busy || !accountId || !researchQuestion.trim()}
            onClick={() => void runResearchQuery()}
          >
            {t('aiMemory.researchLookup')}
          </Button>
          {researchAnswer ? (
            <pre className="ai-memory-research-answer">{researchAnswer}</pre>
          ) : null}
        </div>
      </section>

      <section className="ai-memory-disclosure">
        <button
          type="button"
          className="ai-memory-disclosure__toggle"
          onClick={() => {
            setShowDetails((v) => !v);
          }}
        >
          {showDetails ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          {t('aiMemory.detailsTitle')}
        </button>
        {showDetails ? (
          <div className="ai-memory-disclosure__body">
            <p className="muted">{t('aiMemory.detailsHint')}</p>
            <ul className="ai-memory-details-list">
              <li>
                <span>{t('aiMemory.accountInUse')}</span>
                <strong>{accountEmail ?? '—'}</strong>
              </li>
              {showAdvancedTools && accountOptions.length > 1 ? (
                <li>
                  <span>{t('aiMemory.accountLabel')}</span>
                  <select
                    value={accountId ?? ''}
                    disabled={busy}
                    aria-label={t('aiMemory.accountLabel')}
                    onChange={(e) => {
                      const next = e.target.value;
                      if (next) void changeWorker(next);
                    }}
                  >
                    {accountOptions.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.email ?? a.id}
                      </option>
                    ))}
                  </select>
                </li>
              ) : null}
              {showAdvancedTools ? (
                <>
                  <li>
                    <span>{t('aiMemory.notebook')}</span>
                    <strong>{health?.notebookName ?? '—'}</strong>
                  </li>
                  <li>
                    <span>{t('aiMemory.versions')}</span>
                    <strong>
                      v{health?.pendingKnowledgeVersion ?? health?.localVersion ?? 0} / v
                      {health?.verifiedKnowledgeVersion ?? health?.notebookVersion ?? 0}
                    </strong>
                  </li>
                  {bootstrap ? (
                    <li>
                      <span>{t('aiMemory.bootstrapStatus')}</span>
                      <strong>{statusLabel(bootstrap.status)}</strong>
                    </li>
                  ) : null}
                </>
              ) : null}
            </ul>
            {!researchFullyComplete ? (
              <Button size="sm" disabled={busy} onClick={() => void initMemory(false)}>
                {t('aiMemory.continueResearch')}
              </Button>
            ) : null}
            {showAdvancedTools ? (
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => void initMemory(true)}>
                {t('aiMemory.reanalyzeFromStart')}
              </Button>
            ) : null}
          </div>
        ) : null}
      </section>

      <MemoryDetailDrawer
        open={detailOpen}
        onClose={() => { setDetailOpen(false); }}
        characters={charactersList}
        terms={termsList}
        relationships={relationshipsList}
        storyState={storyState}
        conflicts={conflicts}
      />

      {showAdvancedTools ? (
        <section className="ai-memory-disclosure">
          <button
            type="button"
            className="ai-memory-disclosure__toggle"
            onClick={() => {
              setShowAdvanced((v) => !v);
            }}
          >
            {showAdvanced ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            {t('aiMemory.advancedTitle')}
          </button>
          {showAdvanced ? (
          <div className="ai-memory-disclosure__body ai-memory-advanced">
            <p className="muted">{t('aiMemory.advancedHint')}</p>

            <ul className="ai-memory-details-list">
              <li>
                <span>{t('aiMemory.sourceBindings')}</span>
                <strong>
                  {dualHealth?.layout === 'DUAL'
                    ? t('aiMemory.layoutDual')
                    : t('aiMemory.layoutSingle')}
                </strong>
              </li>
              {dualHealth?.research ? (
                <li>
                  <span>{t('aiMemory.researchNotebook')}</span>
                  <strong>{dualHealth.research.notebookName ?? '—'}</strong>
                </li>
              ) : null}
              <li>
                <span>{t('aiMemory.localVersionLabel')}</span>
                <strong>{String(health?.localVersion ?? 0)}</strong>
              </li>
            </ul>

            {health?.files.length ? (
              <div>
                <h4>{t('aiMemory.knowledgeFiles')}</h4>
                <ul className="ai-memory-files">
                  {health.files.map((file) => (
                    <li key={file.type}>
                      <span>{file.dirty ? '⚠' : '✓'}</span>
                      <span>{file.name}</span>
                      <span className="muted">v{file.localVersion}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <div className="btn-row">
              <Button
                size="sm"
                disabled={busy || !accountId}
                variant="ghost"
                onClick={() => {
                  if (!accountId) return;
                  void run(
                    () =>
                      window.khepreeNovelAI.notebook.provision({
                        projectId,
                        accountId,
                        role: 'RESEARCH',
                      }),
                    t('aiMemory.msgResearchProvisioned'),
                  );
                }}
              >
                {t('aiMemory.provisionResearch')}
              </Button>
              <Button size="sm" disabled={busy} onClick={() => void packCorpus()}>
                {t('aiMemory.packCorpus')}
              </Button>
              <Button size="sm" disabled={busy} onClick={() => void copyPrompt()}>
                {t('aiMemory.copyPrompt')}
              </Button>
              <Button
                size="sm"
                disabled={busy}
                variant="ghost"
                onClick={() =>
                  void window.khepreeNovelAI.notebook
                    .selectPreprocessResultPath()
                    .then((pick) => {
                      if (!pick.canceled && pick.filePath) {
                        return importResult(pick.filePath);
                      }
                    })
                }
              >
                {t('aiMemory.pickResultFile')}
              </Button>
              <Button
                size="sm"
                disabled={busy}
                variant="ghost"
                onClick={() =>
                  void run(
                    () =>
                      window.khepreeNovelAI.notebook.runBootstrapAnalysis({
                        projectId,
                        mode: 'BALANCED',
                        googleAccountId: accountId,
                      }),
                    t('aiMemory.msgAnalyzed'),
                  )
                }
              >
                {t('aiMemory.analyzeBootstrap')}
              </Button>
              <Button
                size="sm"
                disabled={busy}
                variant="ghost"
                onClick={() => void initMemory(true)}
              >
                {t('aiMemory.initFullForce')}
              </Button>
              <Button
                size="sm"
                disabled={busy}
                variant="ghost"
                onClick={() =>
                  void run(
                    () => window.khepreeNovelAI.notebook.rebuild(projectId),
                    t('aiMemory.msgRebuilt'),
                  )
                }
              >
                {t('aiMemory.rebuild')}
              </Button>
              <Button
                size="sm"
                disabled={busy}
                variant="ghost"
                onClick={() => {
                  const ok = confirmDangerous(t('aiMemory.resetConfirm'));
                  if (!ok) return;
                  void (async () => {
                    setBusy(true);
                    setError(null);
                    setMessage(null);
                    setProgressMsg(t('aiMemory.initStarting'));
                    try {
                      const result = await window.khepreeNovelAI.notebook.resetAiMemory({
                        projectId,
                        confirm: true,
                        runInitAfter: true,
                        googleAccountId: accountId,
                      });
                      await refresh();
                      const initMsg = result.init?.message ?? '';
                      if (result.init?.status === 'failed' || result.init?.needsAssisted) {
                        setError(result.init.message);
                        setMessage(result.message);
                      } else {
                        setMessage(
                          t('aiMemory.resetOk', {
                            wipe: result.message,
                            init: initMsg || (result.init?.status ?? 'ok'),
                          }),
                        );
                      }
                    } catch (err: unknown) {
                      setError(
                        err instanceof Error ? err.message : t('errors.UNKNOWN.title'),
                      );
                    } finally {
                      setBusy(false);
                      setProgressMsg(null);
                    }
                  })();
                }}
              >
                {t('aiMemory.resetMemory')}
              </Button>
            </div>

            {packInfo ? (
              <ul className="ai-memory-files">
                {packInfo.parts.map((p) => (
                  <li key={p.fileName}>
                    <span>{p.fileName}</span>
                    <span className="muted">
                      ch {p.chapterFrom}–{p.chapterTo} · ~{p.wordCount}
                    </span>
                  </li>
                ))}
                <li className="muted">{packInfo.outputDir}</li>
              </ul>
            ) : null}

            <label className="ai-memory-import">
              {t('aiMemory.pasteResult')}
              <textarea
                value={importText}
                onChange={(e) => {
                  setImportText(e.target.value);
                }}
                rows={5}
                disabled={busy}
              />
            </label>
            <Button size="sm" disabled={busy} onClick={() => void importResult()}>
              {t('aiMemory.importResult')}
            </Button>

            {dualHealth?.research?.lastError ? (
              <p className="muted u-mono">{dualHealth.research.lastError}</p>
            ) : health?.lastError ? (
              <p className="muted u-mono">{health.lastError}</p>
            ) : null}
          </div>
        ) : null}
        </section>
      ) : null}
    </div>
  );
}

function MemoryMetric({
  value,
  label,
  quiet = false,
}: {
  value: number;
  label: string;
  quiet?: boolean;
}) {
  return (
    <div className={`source-metric ${quiet ? 'source-metric--quiet' : ''}`.trim()}>
      <span className="source-metric__value">{value}</span>
      <span className="source-metric__label">{label}</span>
    </div>
  );
}
