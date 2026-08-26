import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useT } from '../../i18n';
import { statusLabel, statusTone } from '../../i18n/status';
import { Button, Card } from '../ui';
import { NOTEBOOK_CHANNEL_READY } from '@shared/constants/notebook';

interface AiStatusPanelProps {
  projectId?: string;
  projectName: string;
  chapterFrom?: number;
  chapterTo?: number;
  onNotebookChange?: () => void;
  /** Live translate channel from job progress (e.g. "Web API · fat-pack"). */
  translatePath?: string | null;
}

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
  const [notebookStatus, setNotebookStatus] = useState<string | null>(null);
  const [notebookBusy, setNotebookBusy] = useState(false);
  const [notebookMessage, setNotebookMessage] = useState<string | null>(null);
  const [localVersion, setLocalVersion] = useState(0);
  const [notebookVersion, setNotebookVersion] = useState(0);
  const [knowledgeDirty, setKnowledgeDirty] = useState(false);

  useEffect(() => {
    const cancelled = { current: false };
    void (async () => {
      try {
        const [workers, accounts] = await Promise.all([
          window.novelTrans.jobs.workers(),
          window.novelTrans.accounts.list(),
        ]);
        if (cancelled.current) return;
        const worker = workers.workers[0] as { accountId: string; health: string } | undefined;
        const account = worker
          ? accounts.accounts.find((a) => a.id === worker.accountId)
          : accounts.accounts[0];
        setEmail(account?.email ?? null);
        setPlan(account?.plan ?? null);
        setHealth(worker?.health ?? account?.status ?? 'DISCONNECTED');
        setAccountId(account?.id ?? null);
        if (projectId && account?.id) {
          const [nb, healthRes] = await Promise.all([
            window.novelTrans.notebook.get(projectId, account.id),
            window.novelTrans.notebook.health({ projectId, accountId: account.id }),
          ]);
          if (cancelled.current) return;
          setNotebookStatus(nb.mapping?.status ?? healthRes.status);
          setLocalVersion(healthRes.localVersion);
          setNotebookVersion(healthRes.notebookVersion);
          setKnowledgeDirty(healthRes.dirty);
        } else {
          setNotebookStatus(null);
        }
      } catch {
        // ignore
      }
    })();
    return () => {
      cancelled.current = true;
    };
  }, [projectId]);

  const tone = statusTone(health);
  const needsLogin = health === 'LOGIN_REQUIRED' || health === 'NEEDS_ATTENTION';
  const limited = health === 'LIMITED';
  const notebookReady = NOTEBOOK_CHANNEL_READY.has((notebookStatus ?? '').toLowerCase());
  const notebookAssisted = (notebookStatus ?? '').toLowerCase() === 'assisted_setup';
  const notebookPending =
    (notebookStatus ?? '').toLowerCase() === 'sync_pending' ||
    (notebookStatus ?? '').toLowerCase() === 'stale' ||
    knowledgeDirty;

  const runNotebook = async (mode: 'provision' | 'resume') => {
    if (!projectId || !accountId) return;
    setNotebookBusy(true);
    setNotebookMessage(null);
    try {
      const result =
        mode === 'provision'
          ? await window.novelTrans.notebook.provision({ projectId, accountId })
          : await window.novelTrans.notebook.resume({ projectId, accountId });
      setNotebookStatus(result.mapping.status);
      setNotebookMessage(result.message);
      onNotebookChange?.();
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
          <dt>{t('aiPanel.account')}</dt>
          <dd>{email ?? '—'}</dd>
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
      {notebookPending ? (
        <p className="muted" style={{ fontSize: 'var(--font-small)' }}>
          {t('aiPanel.staleHint')}
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
        {projectId && accountId && !notebookReady ? (
          <>
            <Button size="sm" variant="secondary" onClick={() => void openNotebookBrowser()}>
              {t('aiPanel.openNotebookBrowser')}
            </Button>
            <Button
              size="sm"
              variant={notebookAssisted ? 'secondary' : 'primary'}
              loading={notebookBusy}
              onClick={() => {
                void runNotebook(notebookAssisted ? 'resume' : 'provision');
              }}
            >
              {notebookAssisted ? t('aiPanel.resume') : t('aiPanel.provision')}
            </Button>
          </>
        ) : null}
      </div>
    </Card>
  );
}
