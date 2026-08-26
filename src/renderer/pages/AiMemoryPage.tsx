import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { NotebookHealthDto } from '@shared/schemas/notebook';
import { Button } from '../components/ui';
import { useT } from '../i18n';
import { HelpContextButton } from '../features/help/HelpContextButton';
import { useUiShellStore } from '../stores/ui-shell-store';

function statusLabel(status: string, t: (k: string) => string): string {
  switch (status) {
    case 'ready':
      return t('aiMemory.statusReady');
    case 'sync_pending':
    case 'syncing':
    case 'stale':
      return t('aiMemory.statusPending');
    case 'error':
    case 'unavailable':
      return t('aiMemory.statusError');
    case 'assisted_setup':
      return t('aiMemory.statusAssisted');
    default:
      return status;
  }
}

export function AiMemoryPage() {
  const t = useT();
  const navigate = useNavigate();
  const { projectId: paramProjectId = '' } = useParams();
  const storeProjectId = useUiShellStore((s) => s.currentProjectId) ?? '';
  const projectId = paramProjectId || storeProjectId;
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
  const [accountId, setAccountId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progressMsg, setProgressMsg] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [packInfo, setPackInfo] = useState<{
    outputDir: string;
    parts: Array<{ fileName: string; wordCount: number; chapterFrom: number; chapterTo: number }>;
    totalWords: number;
    totalChapters: number;
  } | null>(null);
  const [importText, setImportText] = useState('');
  const [syncAfterImport, setSyncAfterImport] = useState(true);

  const refresh = useCallback(async () => {
    if (!projectId) return;
    const [healthRes, accounts, boot] = await Promise.all([
      window.novelTrans.notebook.health({ projectId }),
      window.novelTrans.accounts.list(),
      window.novelTrans.notebook.getBootstrapStatus(projectId),
    ]);
    setHealth(healthRes);
    setBootstrap(boot);
    let workerId: string | null = healthRes.accountId;
    for (const account of accounts.accounts) {
      if (account.status === 'READY' || account.status === 'BUSY') {
        workerId = account.id;
        break;
      }
      if (workerId === healthRes.accountId) {
        workerId = account.id;
      }
    }
    setAccountId(workerId);
  }, [projectId]);

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
    return () => { window.clearInterval(id); };
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
          t('aiMemory.initOk', {
            mode: result.mode,
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
        setMessage(
          t('aiMemory.promptCopied', { path: result.promptPath ?? '—' }),
        );
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

  if (!projectId) {
    return (
      <div className="page-stack" style={{ padding: '1.25rem' }}>
        <h1>{t('aiMemory.title')}</h1>
        <p>{t('aiMemory.noProject')}</p>
        <Button onClick={() => { navigate('/projects'); }}>
          {t('nav.projects')}
        </Button>
      </div>
    );
  }

  return (
    <div className="page-stack" style={{ padding: '1.25rem', maxWidth: 880 }}>
      <header style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
        <h1 style={{ margin: 0, flex: 1 }}>{t('aiMemory.title')}</h1>
        <HelpContextButton articleId="bootstrap-memory" />
        <Button variant="ghost" onClick={() => { navigate(-1); }}>
          {t('common.back')}
        </Button>
      </header>

      <p className="muted">{t('aiMemory.subtitle')}</p>

      {error && <p className="error-text">{error}</p>}
      {message && <p className="success-text">{message}</p>}
      {progressMsg && busy ? <p className="muted">{progressMsg}</p> : null}

      <section
        id="notebooklm-preprocess"
        className="panel"
        style={{
          marginTop: '1rem',
          border: '1px solid var(--accent, #3b82f6)',
        }}
      >
        <h2 style={{ marginTop: 0 }}>{t('aiMemory.initTitle')}</h2>
        <p className="muted">{t('aiMemory.initHint')}</p>
        <div style={{ display: 'grid', gap: '0.85rem', marginTop: '0.75rem' }}>
          <div>
            <Button disabled={busy} onClick={() => void initMemory(false)}>
              {t('aiMemory.initMemory')}
            </Button>
            <p className="muted" style={{ margin: '0.35rem 0 0', fontSize: '0.9rem' }}>
              {t('aiMemory.initMemoryHelp')}
            </p>
          </div>
          <div>
            <Button
              disabled={busy}
              variant="ghost"
              onClick={() => void initMemory(true)}
            >
              {t('aiMemory.initFullForce')}
            </Button>
            <p className="muted" style={{ margin: '0.35rem 0 0', fontSize: '0.9rem' }}>
              {t('aiMemory.initFullForceHelp')}
            </p>
          </div>
          <div>
            <Button
              disabled={busy}
              variant="ghost"
              onClick={() => {
                const ok = window.confirm(t('aiMemory.resetConfirm'));
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
                          init: initMsg || result.init?.status || 'ok',
                        }),
                      );
                    }
                  } catch (err: unknown) {
                    setError(err instanceof Error ? err.message : t('errors.UNKNOWN.title'));
                  } finally {
                    setBusy(false);
                    setProgressMsg(null);
                  }
                })();
              }}
            >
              {t('aiMemory.resetMemory')}
            </Button>
            <p className="muted" style={{ margin: '0.35rem 0 0', fontSize: '0.9rem' }}>
              {t('aiMemory.resetMemoryHelp')}
            </p>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
            <Button
              disabled={busy}
              variant="ghost"
              onClick={() =>
                void run(
                  () =>
                    window.novelTrans.notebook.syncNow({
                      projectId,
                      accountId: accountId ?? undefined,
                    }),
                  t('aiMemory.msgSynced'),
                )
              }
            >
              {t('aiMemory.syncNow')}
            </Button>
            <Button
              disabled={busy}
              variant="ghost"
              onClick={() => void run(() => refresh(), t('aiMemory.msgChecked'))}
            >
              {t('aiMemory.check')}
            </Button>
          </div>
        </div>
      </section>

      {bootstrap && (
        <section className="panel" style={{ marginTop: '1rem' }}>
          <div style={{ display: 'grid', gap: '0.35rem' }}>
            <div>
              <strong>{t('aiMemory.bootstrapStatus')}:</strong> {bootstrap.status}
            </div>
            <div>
              <strong>{t('aiMemory.bootstrapThrough')}:</strong>{' '}
              {bootstrap.throughChapter != null
                ? `1–${bootstrap.throughChapter}`
                : '—'}
            </div>
            <div>
              <strong>{t('aiMemory.memoryCounts')}:</strong>{' '}
              {t('aiMemory.countCharacters')} {bootstrap.characterCount} ·{' '}
              {t('aiMemory.countRelationships')} {bootstrap.relationshipCount} ·{' '}
              {t('aiMemory.countTermCandidates')} {bootstrap.termCandidateCount}
            </div>
          </div>
        </section>
      )}

      {health && (
        <section className="panel" style={{ marginTop: '1rem' }}>
          <div style={{ display: 'grid', gap: '0.35rem' }}>
            <div>
              <strong>{t('aiMemory.notebook')}:</strong>{' '}
              {health.notebookName ?? '—'}
            </div>
            <div>
              <strong>{t('aiMemory.status')}:</strong>{' '}
              {statusLabel(health.status, t)}
            </div>
            <div>
              <strong>{t('aiMemory.versions')}:</strong> local v{health.localVersion}{' '}
              / notebook v{health.notebookVersion}
            </div>
          </div>
          <h3 style={{ marginTop: '1.25rem' }}>{t('aiMemory.knowledgeFiles')}</h3>
          <ul style={{ listStyle: 'none', padding: 0 }}>
            {health.files.map((file) => (
              <li
                key={file.type}
                style={{
                  display: 'flex',
                  gap: '0.5rem',
                  padding: '0.25rem 0',
                  borderBottom: '1px solid var(--border-subtle, #333)',
                }}
              >
                <span style={{ width: '1.5rem' }}>{file.dirty ? '⚠' : '✓'}</span>
                <span style={{ flex: 1 }}>{file.name}</span>
                <span className="muted">
                  v{file.localVersion}/{file.remoteVersion}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="panel" style={{ marginTop: '1rem' }}>
        <button
          type="button"
          className="btn-ghost"
          style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }}
          onClick={() => { setShowAdvanced((v) => !v); }}
        >
          <strong>
            {showAdvanced ? '▾' : '▸'} {t('aiMemory.advancedTitle')}
          </strong>
        </button>
        {showAdvanced ? (
          <div style={{ marginTop: '0.75rem' }}>
            <p className="muted" style={{ fontSize: '0.9rem' }}>
              {t('aiMemory.preprocessSteps')}
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
              <Button disabled={busy} onClick={() => void packCorpus()}>
                {t('aiMemory.packCorpus')}
              </Button>
              <Button disabled={busy} onClick={() => void copyPrompt()}>
                {t('aiMemory.copyPrompt')}
              </Button>
              <Button
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
                disabled={busy || !accountId}
                variant="ghost"
                onClick={() => {
                  if (!accountId) return;
                  void run(
                    () =>
                      window.novelTrans.notebook.provision({
                        projectId,
                        accountId,
                      }),
                    t('aiMemory.msgProvisioned'),
                  );
                }}
              >
                {t('aiMemory.openProvision')}
              </Button>
              <Button
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
            </div>
            {packInfo && (
              <ul style={{ marginTop: '0.75rem', fontSize: '0.9rem' }}>
                {packInfo.parts.map((p) => (
                  <li key={p.fileName}>
                    {p.fileName} · ch {p.chapterFrom}–{p.chapterTo} · ~{p.wordCount} words
                  </li>
                ))}
                <li className="muted">{packInfo.outputDir}</li>
              </ul>
            )}
            <label style={{ display: 'block', marginTop: '0.75rem' }}>
              {t('aiMemory.pasteResult')}
              <textarea
                value={importText}
                onChange={(e) => { setImportText(e.target.value); }}
                rows={6}
                style={{ width: '100%', marginTop: '0.35rem', fontFamily: 'monospace' }}
                disabled={busy}
              />
            </label>
            <label style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginTop: '0.5rem' }}>
              <input
                type="checkbox"
                checked={syncAfterImport}
                onChange={(e) => { setSyncAfterImport(e.target.checked); }}
                disabled={busy}
              />
              {t('aiMemory.syncAfterImport')}
            </label>
            <div style={{ marginTop: '0.5rem' }}>
              <Button disabled={busy} onClick={() => void importResult()}>
                {t('aiMemory.importResult')}
              </Button>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}
