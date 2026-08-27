import { useCallback, useEffect, useRef, useState } from 'react';
import {
  SETUP_WIZARD_STEPS,
  type SetupWizardStep,
} from '@shared/constants/setup';
import type { SetupStatus } from '@shared/schemas/setup';
import type { GoogleAccountDto } from '@shared/schemas/account';
import { useT } from '../i18n';
import { statusLabel } from '../i18n/status';
import {
  PageHeader,
  Button,
  Card,
  ErrorPanel,
  Spinner,
  Badge,
} from '../components/ui';
import { CreateProjectWizard } from '../components/CreateProjectWizard';

const LOGIN_POLL_MS = 2500;
const LOGIN_POLL_MAX = 48;

interface SetupWizardPageProps {
  onComplete: () => void;
  onExplore: () => void;
}

function stepIndex(step: SetupWizardStep): number {
  return SETUP_WIZARD_STEPS.indexOf(step);
}

export function SetupWizardPage({ onComplete, onExplore }: SetupWizardPageProps) {
  const t = useT();
  const [status, setStatus] = useState<SetupStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [testMessage, setTestMessage] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<GoogleAccountDto[]>([]);
  const [loginHint, setLoginHint] = useState<string | null>(null);
  const [pendingAccountId, setPendingAccountId] = useState<string | null>(null);
  const [showCreateProject, setShowCreateProject] = useState(false);
  const [projectHint, setProjectHint] = useState<string | null>(null);
  const pollAbort = useRef<AbortController | null>(null);

  const refreshAccounts = useCallback(async () => {
    const result = await window.novelTrans.accounts.list();
    setAccounts(result.accounts);
    return result.accounts;
  }, []);

  const refresh = useCallback(async () => {
    const [next, accountList] = await Promise.all([
      window.novelTrans.setup.getStatus(),
      window.novelTrans.accounts.list(),
    ]);
    setStatus(next);
    setAccounts(accountList.accounts);
  }, []);

  useEffect(() => {
    void refresh().catch((err: unknown) => {
      setError(err instanceof Error ? err.message : t('errors.UNKNOWN.title'));
    });
    return () => {
      pollAbort.current?.abort();
    };
  }, [refresh, t]);

  const readyAccounts = accounts.filter((a) => a.status === 'READY');
  const geminiReady = accounts.some((a) => a.status === 'READY' && a.workerEnabled);

  const go = async (step: SetupWizardStep) => {
    setBusy(true);
    setError(null);
    try {
      const next = await window.novelTrans.setup.setStep({ step });
      setStatus(next);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const finish = async () => {
    setBusy(true);
    setError(null);
    try {
      await window.novelTrans.setup.complete({ confirm: true });
      onComplete();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const explore = async () => {
    setBusy(true);
    setError(null);
    try {
      await window.novelTrans.setup.explore({ confirm: true });
      onExplore();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const finishGoogleLogin = async (accountId: string): Promise<boolean> => {
    setLoginHint(t('setup.finishingLogin'));
    try {
      const completed = await window.novelTrans.accounts.completeLogin(accountId, {});
      if (completed.account.status === 'READY') {
        await refresh();
        return true;
      }
    } catch {
      // probe may fail until user finishes browser login
    }

    const probed = await window.novelTrans.accounts.testSession(accountId);
    if (probed.usable && probed.account.status === 'READY') {
      await refresh();
      return true;
    }
    if (probed.reason === 'NEEDS_ATTENTION') {
      setLoginHint(t('setup.googleAccountNeedsAttention'));
    } else {
      setLoginHint(t('setup.googleAccountWaiting'));
    }
    await refreshAccounts();
    return false;
  };

  const pollUntilReady = async (accountId: string) => {
    const ac = new AbortController();
    pollAbort.current = ac;
    setPendingAccountId(accountId);
    setLoginHint(t('setup.googleAccountWaiting'));
    for (let i = 0; i < LOGIN_POLL_MAX; i += 1) {
      if (ac.signal.aborted) return;
      try {
        const ok = await finishGoogleLogin(accountId);
        if (ok) {
          setPendingAccountId(null);
          return;
        }
      } catch (err: unknown) {
        if (i === LOGIN_POLL_MAX - 1) {
          setError(err instanceof Error ? err.message : String(err));
        }
      }
      await new Promise((resolve) => {
        window.setTimeout(resolve, LOGIN_POLL_MS);
      });
    }
    setPendingAccountId(null);
  };

  const addAccount = async () => {
    setBusy(true);
    setError(null);
    setLoginHint(null);
    try {
      const result = await window.novelTrans.accounts.add({});
      await refreshAccounts();
      void pollUntilReady(result.account.id);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  if (!status) {
    return (
      <div className="setup-wizard">
        <Spinner />
        <p className="muted">{t('setup.loading')}</p>
      </div>
    );
  }

  const current = stepIndex(status.step);
  const total = SETUP_WIZARD_STEPS.length;

  return (
    <div className="setup-wizard">
      <PageHeader
        title={t('app.name')}
        description={t('setup.stepOf', { current: current + 1, total })}
      />

      {error ? (
        <ErrorPanel title={t('errors.UNKNOWN.title')} description={error} />
      ) : null}

      <Card as="section" className="setup-wizard-card">
        {status.step === 'welcome' ? (
          <>
            <h2>{t('setup.welcome')}</h2>
            <p>{t('setup.welcomeBody')}</p>
            <p className="muted">{t('setup.welcomeNotebookNote')}</p>
            <div className="btn-row">
              <Button
                variant="primary"
                disabled={busy}
                onClick={() => {
                  void go('googleAccount');
                }}
              >
                {t('setup.next')}
              </Button>
              <Button
                variant="ghost"
                disabled={busy}
                onClick={() => {
                  void explore();
                }}
              >
                {t('setup.skipExplore')}
              </Button>
            </div>
          </>
        ) : null}

        {status.step === 'googleAccount' ? (
          <>
            <h2>{t('setup.googleAccount')}</h2>
            <p>
              {t('setup.googleAccountBody', {
                ready: String(readyAccounts.length),
                count: String(accounts.length),
              })}
            </p>
            {loginHint ? <p className="muted">{loginHint}</p> : null}
            {pendingAccountId ? (
              <p className="muted">
                <Spinner /> {t('setup.googleAccountWaiting')}
              </p>
            ) : null}
            <ul className="setup-account-list">
              {accounts.map((a) => (
                <li key={a.id}>
                  <span>{a.label || a.email || a.id.slice(0, 8)}</span>
                  <Badge tone={a.status === 'READY' ? 'success' : 'default'}>
                    {statusLabel(a.status)}
                  </Badge>
                </li>
              ))}
            </ul>
            <div className="btn-row">
              <Button
                variant="secondary"
                disabled={busy}
                onClick={() => {
                  void addAccount();
                }}
              >
                {t('actions.addGoogleAccount')}
              </Button>
              <Button
                variant="secondary"
                disabled={busy}
                onClick={() => {
                  void refresh();
                }}
              >
                {t('setup.refresh')}
              </Button>
              <Button
                variant="primary"
                disabled={busy || accounts.length < 1}
                onClick={() => {
                  void go('testGemini');
                }}
              >
                {t('setup.next')}
              </Button>
              <Button
                variant="ghost"
                disabled={busy}
                onClick={() => {
                  void go('welcome');
                }}
              >
                {t('setup.back')}
              </Button>
              <Button
                variant="ghost"
                disabled={busy}
                onClick={() => {
                  void explore();
                }}
              >
                {t('setup.skipExplore')}
              </Button>
            </div>
          </>
        ) : null}

        {status.step === 'testGemini' ? (
          <>
            <h2>{t('setup.testGemini')}</h2>
            <p>{t('setup.testGeminiBody')}</p>
            <p className="muted">
              {geminiReady ? t('setup.geminiReadyHint') : t('setup.geminiNotReadyHint')}
            </p>
            {testMessage ? <p className="success-text">{testMessage}</p> : null}
            <div className="btn-row">
              <Button
                variant="secondary"
                disabled={busy || accounts.length < 1}
                onClick={() => {
                  void (async () => {
                    setBusy(true);
                    setError(null);
                    try {
                      const id =
                        accounts.find((a) => a.status === 'READY')?.id ?? accounts[0]?.id;
                      if (!id) return;
                      const result = await window.novelTrans.diagnostics.connectionTest({
                        kind: 'browserProfile',
                        accountId: id,
                      });
                      setTestMessage(
                        `${result.ok ? t('setup.testOk') : t('setup.testFail')}: ${result.message}`,
                      );
                      await refresh();
                    } catch (err: unknown) {
                      setError(err instanceof Error ? err.message : String(err));
                    } finally {
                      setBusy(false);
                    }
                  })();
                }}
              >
                {t('setup.testBrowser')}
              </Button>
              <Button
                variant="primary"
                disabled={busy}
                onClick={() => {
                  void go('createProject');
                }}
              >
                {t('setup.next')}
              </Button>
              <Button
                variant="ghost"
                disabled={busy}
                onClick={() => {
                  void go('googleAccount');
                }}
              >
                {t('setup.back')}
              </Button>
              <Button
                variant="ghost"
                disabled={busy}
                onClick={() => {
                  void explore();
                }}
              >
                {t('setup.skipExplore')}
              </Button>
            </div>
          </>
        ) : null}

        {status.step === 'createProject' ? (
          <>
            <h2>{t('setup.createProject')}</h2>
            <p>{t('setup.createProjectBody', { count: String(status.projectCount) })}</p>
            <p className="muted">{t('setup.createProjectNotebookNote')}</p>
            {projectHint ? <p className="success-text">{projectHint}</p> : null}

            {showCreateProject ? (
              <CreateProjectWizard
                onCancel={() => {
                  setShowCreateProject(false);
                }}
                onError={(message) => {
                  setError(message);
                }}
                onComplete={async (result) => {
                  setShowCreateProject(false);
                  setProjectHint(
                    t('setup.createProjectDone', {
                      title: result.project.title,
                      chapters: String(result.chapterCount),
                    }),
                  );
                  await refresh();
                }}
              />
            ) : (
              <div className="btn-row">
                <Button
                  variant="secondary"
                  disabled={busy}
                  onClick={() => {
                    setShowCreateProject(true);
                  }}
                >
                  {t('actions.createProject')}
                </Button>
                <Button
                  variant="primary"
                  disabled={busy}
                  onClick={() => {
                    void finish();
                  }}
                >
                  {t('setup.finish')}
                </Button>
                <Button
                  variant="ghost"
                  disabled={busy}
                  onClick={() => {
                    void go('testGemini');
                  }}
                >
                  {t('setup.back')}
                </Button>
                <Button
                  variant="ghost"
                  disabled={busy}
                  onClick={() => {
                    void explore();
                  }}
                >
                  {t('setup.skipExplore')}
                </Button>
              </div>
            )}
          </>
        ) : null}
      </Card>
    </div>
  );
}
