import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Check, AlertTriangle, Circle, ChevronDown, ChevronRight } from 'lucide-react';
import type { NotebookDualHealthDto, NotebookHealthDto } from '@shared/schemas/notebook';
import { Button, Badge, ErrorPanel } from '../components/ui';
import { useT } from '../i18n';
import { friendlyError } from '../i18n/errors';
import { statusLabel } from '../i18n/status';
import { HelpContextButton } from '../features/help/HelpContextButton';
import { useUiShellStore } from '../stores/ui-shell-store';
import { confirmDangerous } from '../utils/confirm-dangerous';

type FriendlyStatus = 'ready' | 'pending' | 'stale' | 'error' | 'assisted' | 'unknown';

function classifyStatus(health: NotebookHealthDto | null): FriendlyStatus {
  if (!health) return 'unknown';
  if (health.status === 'assisted_setup') return 'assisted';
  if (health.status === 'error' || health.status === 'unavailable') return 'error';
  if (
    health.status === 'stale' ||
    health.status === 'sync_pending' ||
    health.status === 'syncing' ||
    (health.pendingKnowledgeVersion > health.verifiedKnowledgeVersion &&
      !health.knowledgeVerified)
  ) {
    return health.status === 'stale' || !health.knowledgeVerified ? 'stale' : 'pending';
  }
  if (health.status === 'ready' && health.knowledgeVerified) return 'ready';
  if (health.status === 'ready') return 'pending';
  return 'unknown';
}

function formatRelative(iso: string | null, t: (k: string, p?: Record<string, string>) => string): string {
  if (!iso) return t('aiMemory.updatedNever');
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return t('aiMemory.updatedNever');
  const mins = Math.max(0, Math.round(ms / 60_000));
  if (mins < 1) return t('aiMemory.updatedJustNow');
  if (mins < 60) return t('aiMemory.updatedMinutes', { n: String(mins) });
  const hours = Math.round(mins / 60);
  if (hours < 48) return t('aiMemory.updatedHours', { n: String(hours) });
  const days = Math.round(hours / 24);
  return t('aiMemory.updatedDays', { n: String(days) });
}

export function AiMemoryPage() {
  const t = useT();
  const navigate = useNavigate();
  const { projectId: paramProjectId = '' } = useParams();
  const storeProjectId = useUiShellStore((s) => s.currentProjectId) ?? '';
  const projectId = paramProjectId || storeProjectId;
  const [dualHealth, setDualHealth] = useState<NotebookDualHealthDto | null>(null);
  const [health, setHealth] = useState<NotebookHealthDto | null>(null);
  const [bootstrap, setBootstrap] = useState<{
    status: string;
    throughChapter: number | null;
    version: string;
    chapterCount: number;
    characterCount: number;
    relationshipCount: number;
    termCandidateCount: number;
  } | null>(null);
  const [summary, setSummary] = useState({
    characters: 0,
    terms: 0,
    relationships: 0,
    throughChapter: null as number | null,
  });
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
  const [syncAfterImport, setSyncAfterImport] = useState(true);

  const refresh = useCallback(async () => {
    if (!projectId) return;
    const [dual, accounts, boot, resolved, chars, rels, terms] = await Promise.all([
      window.novelTrans.notebook.health({
        projectId,
        dual: true,
      }) as Promise<NotebookDualHealthDto>,
      window.novelTrans.accounts.list(),
      window.novelTrans.notebook.getBootstrapStatus(projectId),
      window.novelTrans.projects.resolveWorker({
        projectId,
        purpose: 'notebook',
      }),
      window.novelTrans.memory.listCharacters(projectId),
      window.novelTrans.memory.listRelationships({ projectId }),
      window.novelTrans.terms.search({ projectId, limit: 500 }),
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
  }, [projectId]);

  const changeWorker = async (nextAccountId: string) => {
    if (!projectId || nextAccountId === accountId) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const result = await window.novelTrans.projects.setWorker({
        projectId,
        accountId: nextAccountId,
        ensureNotebook: true,
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
    void refresh().catch((err: unknown) => {
      setError(err instanceof Error ? err.message : t('errors.UNKNOWN.title'));
    });
  }, [refresh, t]);

  useEffect(() => {
    if (!busy || !projectId) return;
    const id = window.setInterval(() => {
      void window.novelTrans.notebook.getAutoPreprocessProgress(projectId).then((p) => {
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

  const syncNow = () => {
    if (!projectId) return;
    void run(
      () =>
        window.novelTrans.notebook.syncNow({
          projectId,
          accountId: accountId ?? undefined,
        }),
      t('aiMemory.msgSynced'),
    );
  };

  const openNotebook = async () => {
    if (!accountId) {
      navigate('/accounts');
      return;
    }
    try {
      await window.novelTrans.accounts.openBrowser(accountId, 'notebook');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('errors.UNKNOWN.title'));
    }
  };

  const initMemory = async (forceFull = false) => {
    if (!projectId) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    setProgressMsg(t('aiMemory.initStarting'));
    try {
      const result = await window.novelTrans.notebook.runAutoPreprocess({
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
      const result = await window.novelTrans.notebook.packNovelCorpus({ projectId });
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
      const result = await window.novelTrans.notebook.getPreprocessPrompt({
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
      const result = await window.novelTrans.notebook.importPreprocessResult({
        projectId,
        text: filePath ? undefined : importText,
        filePath: filePath ?? undefined,
        syncDrive: syncAfterImport,
      });
      if (syncAfterImport && accountId) {
        await window.novelTrans.notebook.syncNow({
          projectId,
          accountId,
        });
      }
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

  const friendly = classifyStatus(health);
  const version =
    health?.verifiedKnowledgeVersion ||
    health?.notebookVersion ||
    health?.pendingKnowledgeVersion ||
    health?.localVersion ||
    0;
  const updatedAt =
    health?.lastVerifiedAt ?? health?.lastDriveSyncAt ?? health?.lastSyncAt ?? null;

  const researchOk =
    dualHealth?.research != null &&
    (dualHealth.research.status === 'ready' ||
      dualHealth.research.status === 'sync_pending' ||
      dualHealth.research.status === 'syncing');
  const researchDone =
    researchOk ||
    bootstrap?.status === 'COMPLETED' ||
    bootstrap?.status === 'COMPLETED_WITH_WARNINGS' ||
    bootstrap?.status === 'READY' ||
    (bootstrap?.throughChapter != null && bootstrap.throughChapter > 0);

  const translationVerified = Boolean(health?.knowledgeVerified);

  const errorCta =
    error || friendly === 'error' || friendly === 'assisted'
      ? friendly === 'assisted' || health?.status === 'assisted_setup'
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
          : !health || health.status === 'pending' || health.status === 'unavailable'
            ? {
                label: t('aiMemory.ctaInitMemory'),
                onClick: () => {
                  void initMemory(false);
                },
              }
            : {
                label: t('aiMemory.syncNow'),
                onClick: syncNow,
              }
      : null;

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
    <div className="ai-memory-page">
      <header className="ai-memory-header">
        <div>
          <h1>{t('aiMemory.title')}</h1>
        </div>
        <HelpContextButton articleId="bootstrap-memory" />
      </header>

      <div className="ai-memory-status-row">
        {friendly === 'ready' ? (
          <Badge tone="success">✓ {t('aiMemory.statusReady')}</Badge>
        ) : friendly === 'stale' || friendly === 'pending' ? (
          <Badge tone="warning">{t('aiMemory.statusPending')}</Badge>
        ) : friendly === 'error' || friendly === 'assisted' ? (
          <Badge tone="error">{statusLabelBadge(friendly, t)}</Badge>
        ) : (
          <Badge>{t('aiMemory.statusPending')}</Badge>
        )}
      </div>

      {friendly === 'ready' ? (
        <p className="ai-memory-lead">
          {t('aiMemory.readyLead', { version: String(version) })}
          <br />
          <span className="muted">{formatRelative(updatedAt, t)}</span>
        </p>
      ) : null}

      {friendly === 'stale' || friendly === 'pending' ? (
        <div className="ai-memory-stale banner banner-info" role="status">
          <p>
            <strong>{t('aiMemory.staleTitle')}</strong>
          </p>
          <p className="muted u-mb-0">
            {t('aiMemory.staleBody')}
          </p>
        </div>
      ) : null}

      {(error || friendly === 'error' || friendly === 'assisted') && errorCta ? (
        <ErrorPanel
          title={friendlyError(error || health?.lastError).title}
          description={
            friendly === 'assisted'
              ? t('aiMemory.initNeedsAssisted')
              : friendlyError(error || health?.lastError).description
          }
          technical={error || health?.lastError}
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
        <div className="ai-memory-meta">
          <div>
            <span className="muted">{t('aiMemory.accountLabel')}</span>
            {accountOptions.length > 1 ? (
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
            ) : (
              <strong>{accountEmail ?? '—'}</strong>
            )}
          </div>
        </div>

        <ul className="ai-memory-checklist">
          <li className={researchDone ? 'is-ok' : ''}>
            {researchDone ? <Check size={16} aria-hidden /> : <Circle size={16} aria-hidden />}
            <div>
              <strong>{t('aiMemory.researchLabel')}</strong>
              <p className="muted">
                {researchDone
                  ? t('aiMemory.researchDone')
                  : t('aiMemory.researchPending')}
              </p>
            </div>
          </li>
          <li className={translationVerified ? 'is-ok' : ''}>
            {translationVerified ? (
              <Check size={16} aria-hidden />
            ) : (
              <AlertTriangle size={16} aria-hidden />
            )}
            <div>
              <strong>{t('aiMemory.translationMemoryLabel')}</strong>
              <p className="muted">
                {translationVerified
                  ? t('aiMemory.translationMemoryVerified')
                  : t('aiMemory.translationMemoryPending')}
              </p>
            </div>
          </li>
        </ul>

        <div className="ai-memory-summary">
          <h3>{t('aiMemory.knowledgeSummary')}</h3>
          <ul>
            <li>{t('aiMemory.summaryCharacters', { n: String(summary.characters) })}</li>
            <li>{t('aiMemory.summaryTerms', { n: String(summary.terms) })}</li>
            <li>{t('aiMemory.summaryRelationships', { n: String(summary.relationships) })}</li>
            <li>
              {summary.throughChapter != null
                ? t('aiMemory.summaryThrough', { n: String(summary.throughChapter) })
                : t('aiMemory.summaryThroughUnknown')}
            </li>
          </ul>
        </div>

        <div className="ai-memory-actions">
          <Button
            variant={errorCta ? 'secondary' : 'primary'}
            disabled={busy}
            onClick={syncNow}
          >
            {t('aiMemory.syncNow')}
          </Button>
          <Button variant="secondary" disabled={busy || !accountId} onClick={() => void openNotebook()}>
            {t('aiMemory.openNotebook')}
          </Button>
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
                <span>{t('aiMemory.notebook')}</span>
                <strong>{health?.notebookName ?? '—'}</strong>
              </li>
              <li>
                <span>{t('aiMemory.versions')}</span>
                <strong>
                  v{health?.pendingKnowledgeVersion || health?.localVersion || 0} / v
                  {health?.verifiedKnowledgeVersion || health?.notebookVersion || 0}
                </strong>
              </li>
              {bootstrap ? (
                <li>
                  <span>{t('aiMemory.bootstrapStatus')}</span>
                  <strong>{statusLabel(bootstrap.status)}</strong>
                </li>
              ) : null}
            </ul>
            {!researchDone ? (
              <Button size="sm" disabled={busy} onClick={() => void initMemory(false)}>
                {t('aiMemory.initMemory')}
              </Button>
            ) : null}
          </div>
        ) : null}
      </section>

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
              <li>
                <span>{t('aiMemory.translationNotebook')}</span>
                <strong>{health?.notebookName ?? '—'}</strong>
              </li>
              {dualHealth?.research ? (
                <li>
                  <span>{t('aiMemory.researchNotebook')}</span>
                  <strong>{dualHealth.research.notebookName ?? '—'}</strong>
                </li>
              ) : null}
              {dualHealth?.research?.resourceUrl ? (
                <li>
                  <span>{t('aiMemory.driveUrl')}</span>
                  <strong className="ai-memory-mono">{dualHealth.research.resourceUrl}</strong>
                </li>
              ) : null}
              <li>
                <span>{t('aiMemory.localVersionLabel')}</span>
                <strong>{String(health?.localVersion ?? 0)}</strong>
              </li>
              <li>
                <span>{t('aiMemory.notebookVersionLabel')}</span>
                <strong>{String(health?.notebookVersion ?? 0)}</strong>
              </li>
              <li>
                <span>{t('aiMemory.probeStatus')}</span>
                <strong>{health?.versionProbeStatus ?? 'pending'}</strong>
              </li>
            </ul>

            {health?.files?.length ? (
              <div>
                <h4>{t('aiMemory.knowledgeFiles')}</h4>
                <ul className="ai-memory-files">
                  {health.files.map((file) => (
                    <li key={file.type}>
                      <span>{file.dirty ? '⚠' : '✓'}</span>
                      <span>{file.name}</span>
                      <span className="muted">
                        v{file.localVersion}/{file.remoteVersion}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {dualHealth?.layout === 'DUAL' ? (
              <div className="btn-row">
                <Button
                  size="sm"
                  disabled={busy || !accountId}
                  variant="ghost"
                  onClick={() => {
                    if (!accountId) return;
                    void run(
                      () =>
                        window.novelTrans.notebook.provision({
                          projectId,
                          accountId,
                          role: 'TRANSLATION',
                        }),
                      t('aiMemory.msgProvisioned'),
                    );
                  }}
                >
                  {t('aiMemory.provisionTranslation')}
                </Button>
                <Button
                  size="sm"
                  disabled={busy || !accountId}
                  variant="ghost"
                  onClick={() => {
                    if (!accountId) return;
                    void run(
                      () =>
                        window.novelTrans.notebook.provision({
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
              </div>
            ) : null}

            <div className="btn-row">
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
                  void window.novelTrans.notebook
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
                      window.novelTrans.notebook.runBootstrapAnalysis({
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
                    () => window.novelTrans.notebook.rebuild(projectId),
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
                      const result = await window.novelTrans.notebook.resetAiMemory({
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
            <label className="ai-memory-check">
              <input
                type="checkbox"
                checked={syncAfterImport}
                onChange={(e) => {
                  setSyncAfterImport(e.target.checked);
                }}
                disabled={busy}
              />
              {t('aiMemory.syncAfterImport')}
            </label>
            <Button size="sm" disabled={busy} onClick={() => void importResult()}>
              {t('aiMemory.importResult')}
            </Button>

            {health?.lastError ? (
              <p className="muted u-mono">{health.lastError}</p>
            ) : null}
          </div>
        ) : null}
      </section>
    </div>
  );
}

function statusLabelBadge(
  friendly: FriendlyStatus,
  t: (k: string) => string,
): string {
  if (friendly === 'assisted') return t('aiMemory.statusAssisted');
  if (friendly === 'error') return t('aiMemory.statusError');
  return t('aiMemory.statusPending');
}
