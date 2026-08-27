import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useT } from '../../i18n';
import { statusLabel, statusTone } from '../../i18n/status';
import { Button, Card } from '../ui';
import { NOTEBOOK_CHANNEL_READY } from '@shared/constants/notebook';
import {
  mapNotebookServiceMessage,
  needsNotebookSync,
  resolveNotebookPanelHint,
} from '../../utils/notebook-panel';

interface AiStatusPanelProps {
  projectId?: string;
  projectName: string;
  chapterFrom?: number;
  chapterTo?: number;
  onNotebookChange?: () => void;
  /** Live translate channel from job progress (e.g. "Web API · fat-pack"). */
  translatePath?: string | null;
}

interface AccountOption { id: string; email: string | null; status: string; plan: string | null }

export function AiStatusPanel({
  projectId,
  projectName,
  chapterFrom,
  chapterTo,
  onNotebookChange,
  translatePath,
}: AiStatusPanelProps) {
  const t = useT();
  const navigate = useNavigate();
  const [email, setEmail] = useState<string | null>(null);
  const [plan, setPlan] = useState<string | null>(null);
  const [health, setHealth] = useState<string>('READY');
  const [accountId, setAccountId] = useState<string | null>(null);
  const [accountOptions, setAccountOptions] = useState<AccountOption[]>([]);
  const [notebookStatus, setNotebookStatus] = useState<string | null>(null);
  const [notebookBusy, setNotebookBusy] = useState(false);
  const [notebookMessage, setNotebookMessage] = useState<string | null>(null);
  const [localVersion, setLocalVersion] = useState(0);
  const [notebookVersion, setNotebookVersion] = useState(0);
  const [knowledgeDirty, setKnowledgeDirty] = useState(false);
  const [instructionsReady, setInstructionsReady] = useState(true);

  const refreshNotebookHealth = useCallback(async (pid: string, aid: string) => {
    const [nb, healthRes] = await Promise.all([
      window.novelTrans.notebook.get(pid, aid),
      window.novelTrans.notebook.health({ projectId: pid, accountId: aid }),
    ]);
    const single =
      'translation' in healthRes ? healthRes.translation : healthRes;
    setNotebookStatus(nb.mapping?.status ?? single.status);
    setLocalVersion(single.localVersion);
    setNotebookVersion(single.notebookVersion);
    setKnowledgeDirty(single.dirty);
    setInstructionsReady(single.instructionsReady);
  }, []);

  const refresh = useCallback(async () => {
    const [accounts, workers] = await Promise.all([
      window.novelTrans.accounts.list(),
      window.novelTrans.jobs.workers(),
    ]);
    const options = accounts.accounts.map((a) => ({
      id: a.id,
      email: a.email,
      status: a.status,
      plan: a.plan,
    }));
    setAccountOptions(options);

    let resolvedAccountId: string | null = null;
    let resolvedEmail: string | null = null;
    if (projectId) {
      const resolved = await window.novelTrans.projects.resolveWorker({
        projectId,
        purpose: 'translation',
      });
      resolvedAccountId = resolved.accountId;
      resolvedEmail = resolved.email;
    }

    const account =
      (resolvedAccountId
        ? options.find((a) => a.id === resolvedAccountId)
        : undefined) ?? null;
    const worker = workers.workers.find(
      (w) => w.accountId === (account?.id ?? resolvedAccountId),
    ) as { accountId: string; health: string } | undefined;

    setEmail(account?.email ?? resolvedEmail);
    setPlan(account?.plan ?? null);
    setHealth(worker?.health ?? account?.status ?? 'DISCONNECTED');
    setAccountId(account?.id ?? resolvedAccountId);

    const healthAccountId = account?.id ?? resolvedAccountId;
    if (projectId && healthAccountId) {
      await refreshNotebookHealth(projectId, healthAccountId);
    } else {
      setNotebookStatus(null);
      setKnowledgeDirty(false);
      setInstructionsReady(true);
    }
  }, [projectId, refreshNotebookHealth]);

  useEffect(() => {
    const cancelled = { current: false };
    void (async () => {
      try {
        await refresh();
      } catch {
        // ignore
      }
      if (cancelled.current) return;
    })();
    return () => {
      cancelled.current = true;
    };
  }, [refresh]);

  const changeWorker = async (nextAccountId: string) => {
    if (!projectId || nextAccountId === accountId) return;
    setNotebookBusy(true);
    setNotebookMessage(null);
    try {
      const result = await window.novelTrans.projects.setWorker({
        projectId,
        accountId: nextAccountId,
        ensureNotebook: true,
      });
      setNotebookStatus(result.notebookStatus);
      setNotebookMessage(mapNotebookServiceMessage(result.message, t));
      await refresh();
      onNotebookChange?.();
    } catch (err: unknown) {
      setNotebookMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setNotebookBusy(false);
    }
  };

  const tone = statusTone(health);
  const needsLogin = health === 'LOGIN_REQUIRED' || health === 'NEEDS_ATTENTION';
  const limited = health === 'LIMITED';
  const notebookReady = NOTEBOOK_CHANNEL_READY.has((notebookStatus ?? '').toLowerCase());
  const notebookAssisted = (notebookStatus ?? '').toLowerCase() === 'assisted_setup';
  const needsInstructionSetup = notebookReady && !instructionsReady;
  const panelHint = resolveNotebookPanelHint({
    status: notebookStatus,
    dirty: knowledgeDirty,
    instructionsReady,
  });
  const showSyncNow = Boolean(
    projectId && accountId && needsNotebookSync({ status: notebookStatus, dirty: knowledgeDirty }),
  );

  const afterNotebookAction = useCallback(async () => {
    if (projectId && accountId) {
      await refreshNotebookHealth(projectId, accountId);
    }
    onNotebookChange?.();
  }, [projectId, accountId, refreshNotebookHealth, onNotebookChange]);

  const runNotebook = async (mode: 'provision' | 'resume') => {
    if (!projectId || !accountId) return;
    setNotebookBusy(true);
    setNotebookMessage(null);
    try {
      if (mode === 'provision') {
        const result = await window.novelTrans.notebook.prepareForTranslate({
          projectId,
          accountId,
        });
        setNotebookStatus(result.notebookStatus);
        setNotebookMessage(mapNotebookServiceMessage(result.message, t));
        if (result.needsAssisted) {
          setNotebookStatus('assisted_setup');
        }
      } else {
        const result = await window.novelTrans.notebook.resume({ projectId, accountId });
        setNotebookStatus(result.mapping.status);
        setNotebookMessage(mapNotebookServiceMessage(result.message, t));
      }
      await afterNotebookAction();
    } catch (err: unknown) {
      setNotebookMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setNotebookBusy(false);
    }
  };

  const runSyncNow = async () => {
    if (!projectId || !accountId) return;
    setNotebookBusy(true);
    setNotebookMessage(null);
    try {
      await window.novelTrans.notebook.syncNow({ projectId, accountId });
      await afterNotebookAction();
      setNotebookMessage(t('aiPanel.msgPrepareDone'));
    } catch (err: unknown) {
      setNotebookMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setNotebookBusy(false);
    }
  };

  const openNotebookBrowser = async () => {
    if (!accountId) return;
    setNotebookMessage(null);
    try {
      await window.novelTrans.accounts.openBrowser(accountId, 'notebook');
      setNotebookMessage(`${t('actions.openBrowser')}: notebook.google.com`);
    } catch (err: unknown) {
      setNotebookMessage(err instanceof Error ? err.message : String(err));
    }
  };

  const hintMessage =
    panelHint === 'stale'
      ? t('aiPanel.staleHint')
      : panelHint === 'localChanges'
        ? t('aiPanel.localChangesHint')
        : panelHint === 'instructions'
          ? t('aiPanel.instructionsHint')
          : null;

  return (
    <Card style={{ margin: '0.5rem', padding: '0.75rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span className={`nt-status-dot nt-status-dot--${tone}`} />
        <strong>{t('aiPanel.title')}</strong>
      </div>
      <p className="muted" style={{ margin: '0 0 0.5rem', fontSize: 'var(--font-small)' }}>
        {needsLogin
          ? t('aiPanel.loginAgain')
          : limited
            ? t('aiPanel.quotaHit')
            : statusLabel(health)}
      </p>
      <dl className="info-list" style={{ fontSize: 'var(--font-small)' }}>
        <div>
          <dt>{t('aiPanel.translationAccount')}</dt>
          <dd>
            {projectId && accountOptions.length > 1 ? (
              <select
                value={accountId ?? ''}
                disabled={notebookBusy}
                onChange={(e) => {
                  const next = e.target.value;
                  if (next) void changeWorker(next);
                }}
                style={{ maxWidth: '100%' }}
              >
                {accountOptions.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.email ?? a.id}
                  </option>
                ))}
              </select>
            ) : (
              (email ?? '—')
            )}
          </dd>
        </div>
        <div>
          <dt>{t('aiPanel.plan')}</dt>
          <dd>{plan ?? '—'}</dd>
        </div>
        <div>
          <dt>{t('aiPanel.project')}</dt>
          <dd>{projectName || '—'}</dd>
        </div>
        <div>
          <dt>{t('aiPanel.batch')}</dt>
          <dd>
            {chapterFrom != null ? `${chapterFrom}–${chapterTo ?? chapterFrom}` : '—'}
          </dd>
        </div>
        <div>
          <dt>{t('aiPanel.notebook')}</dt>
          <dd>
            {notebookReady
              ? t('aiPanel.notebookReady')
              : notebookAssisted
                ? t('aiPanel.notebookAssisted')
                : t('aiPanel.notebookMissing')}
            {projectId
              ? ` · ${t('aiPanel.knowledgeVersion', {
                  local: String(localVersion),
                  remote: String(notebookVersion),
                })}`
              : ''}
          </dd>
        </div>
        <div>
          <dt>{t('aiPanel.translatePath')}</dt>
          <dd>
            {translatePath && translatePath.trim().length > 0
              ? translatePath
              : t('aiPanel.translatePathUnknown')}
          </dd>
        </div>
      </dl>
      {hintMessage ? (
        <p className="muted" style={{ fontSize: 'var(--font-small)' }}>
          {hintMessage}
        </p>
      ) : null}
      {notebookMessage ? (
        <p className="muted" style={{ fontSize: 'var(--font-small)' }}>
          {notebookMessage}
        </p>
      ) : null}
      <div className="btn-row" style={{ marginTop: 8 }}>
        {projectId ? (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              navigate(`/projects/${projectId}/ai-memory`);
            }}
          >
            {t('aiPanel.openAiMemory')}
          </Button>
        ) : null}
        {showSyncNow ? (
          <Button size="sm" variant="secondary" loading={notebookBusy} onClick={() => void runSyncNow()}>
            {t('aiPanel.syncNow')}
          </Button>
        ) : null}
        {needsLogin && accountId ? (
          <Button
            size="sm"
            variant="primary"
            onClick={() => {
              void window.novelTrans.accounts.openBrowser(accountId, 'gemini');
            }}
          >
            {t('actions.openBrowser')}
          </Button>
        ) : null}
        {limited ? (
          <Button
            size="sm"
            onClick={() => {
              void window.novelTrans.jobs.pauseAll();
            }}
          >
            {t('actions.pause')}
          </Button>
        ) : null}
        {projectId && accountId && (!notebookReady || notebookAssisted || needsInstructionSetup) ? (
          <>
            <Button size="sm" variant="secondary" onClick={() => void openNotebookBrowser()}>
              {t('aiPanel.openNotebookBrowser')}
            </Button>
            <Button
              size="sm"
              variant={notebookAssisted || needsInstructionSetup ? 'secondary' : 'primary'}
              loading={notebookBusy}
              onClick={() => {
                void runNotebook(
                  notebookAssisted || needsInstructionSetup ? 'resume' : 'provision',
                );
              }}
            >
              {notebookAssisted || needsInstructionSetup
                ? t('aiPanel.resume')
                : t('aiPanel.provision')}
            </Button>
          </>
        ) : null}
      </div>
    </Card>
  );
}
