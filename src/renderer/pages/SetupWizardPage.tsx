import { useCallback, useEffect, useRef, useState } from 'react';
import {
  SETUP_WIZARD_STEPS,
  type SetupWizardStep,
} from '@shared/constants/setup';
import type { SetupStatus } from '@shared/schemas/setup';
import type { GoogleAccountDto } from '@shared/schemas/account';
import type { FolderPreviewDto } from '@shared/schemas/source-folder';
import {
  GOOGLE_CLOUD_CONSOLE_URL,
  GOOGLE_CLOUD_CREDENTIALS_URL,
} from '@shared/constants/drive';
import { useT } from '../i18n';
import {
  PageHeader,
  Button,
  Card,
  ErrorPanel,
  Spinner,
  Input,
  Badge,
} from '../components/ui';

const STEP_TITLE_KEYS: Record<SetupWizardStep, string> = {
  welcome: 'setup.welcome',
  storage: 'setup.storage',
  drive: 'setup.drive',
  googleAccount: 'setup.googleAccount',
  importNovel: 'setup.importNovel',
  notebook: 'setup.notebook',
  testGemini: 'setup.testGemini',
  ready: 'setup.ready',
};

const LOGIN_POLL_MS = 2500;
const LOGIN_POLL_MAX = 48;

interface SetupWizardPageProps {
  onComplete: () => void;
}

export function SetupWizardPage({ onComplete }: SetupWizardPageProps) {
  const t = useT();
  const [status, setStatus] = useState<SetupStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [testMessage, setTestMessage] = useState<string | null>(null);
  const [oauthConfigured, setOauthConfigured] = useState(false);
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [accounts, setAccounts] = useState<GoogleAccountDto[]>([]);
  const [loginHint, setLoginHint] = useState<string | null>(null);
  const [pendingAccountId, setPendingAccountId] = useState<string | null>(null);
  const [folderPath, setFolderPath] = useState<string | null>(null);
  const [preview, setPreview] = useState<FolderPreviewDto | null>(null);
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const pollAbort = useRef(false);

  const refreshAccounts = useCallback(async () => {
    const result = await window.novelTrans.accounts.list();
    setAccounts(result.accounts);
    return result.accounts;
  }, []);

  const refresh = useCallback(async () => {
    const [next, oauth, accountList] = await Promise.all([
      window.novelTrans.setup.getStatus(),
      window.novelTrans.drive.oauthStatus(),
      window.novelTrans.accounts.list(),
    ]);
    setStatus(next);
    setOauthConfigured(oauth.configured);
    setAccounts(accountList.accounts);
  }, []);

  useEffect(() => {
    void refresh().catch((err: unknown) => {
      setError(err instanceof Error ? err.message : t('errors.UNKNOWN.title'));
    });
    return () => {
      pollAbort.current = true;
    };
  }, [refresh, t]);

  useEffect(() => {
    if (!status) return;
    if (
      (status.step === 'googleAccount' || status.step === 'importNovel') &&
      !oauthConfigured
    ) {
      void go('drive');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-home when oauth missing
  }, [status?.step, oauthConfigured]);

  const readyAccounts = accounts.filter((a) => a.status === 'READY');
  const readyWithDrive = readyAccounts.filter((a) => a.driveConnected);
  const googleStepReady = readyWithDrive.length > 0;

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

  const saveOauth = async () => {
    setBusy(true);
    setError(null);
    try {
      await window.novelTrans.drive.setOAuthClient({
        clientId: clientId.trim(),
        clientSecret: clientSecret.trim() || undefined,
      });
      await window.novelTrans.setup.skipDrive({ skip: false });
      setOauthConfigured(true);
      setClientSecret('');
      setLoginHint(t('setup.driveSaved'));
      await refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const ensureDriveConnected = async (account: GoogleAccountDto): Promise<GoogleAccountDto> => {
    if (account.driveConnected) return account;
    setLoginHint(t('setup.connectingDrive'));
    const result = await window.novelTrans.accounts.connectDrive(account.id);
    setLoginHint(t('setup.driveConnected'));
    return result.account;
  };

  const finishGoogleLogin = async (accountId: string): Promise<boolean> => {
    setLoginHint(t('setup.finishingLogin'));
    try {
      const completed = await window.novelTrans.accounts.completeLogin(accountId, {});
      if (completed.account.status === 'READY') {
        await ensureDriveConnected(completed.account);
        await refresh();
        return true;
      }
    } catch {
      // probe may fail until user finishes browser login — fall through to testSession
    }

    const probed = await window.novelTrans.accounts.testSession(accountId);
    if (probed.usable && probed.account.status === 'READY') {
      await ensureDriveConnected(probed.account);
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
    pollAbort.current = false;
    setPendingAccountId(accountId);
    setLoginHint(t('setup.googleAccountWaiting'));
    for (let i = 0; i < LOGIN_POLL_MAX; i += 1) {
      if (pollAbort.current) return;
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
        setTimeout(resolve, LOGIN_POLL_MS);
      });
    }
    setPendingAccountId(null);
  };

  const addGoogleAccount = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await window.novelTrans.accounts.add({});
      await refresh();
      setBusy(false);
      void pollUntilReady(result.account.id);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  };

  const pickAndScanFolder = async () => {
    setBusy(true);
    setError(null);
    setImportMessage(null);
    try {
      const selected = await window.novelTrans.sourceFolder.selectFolder();
      if (selected.canceled || !selected.folderPath) return;
      setFolderPath(selected.folderPath);
      const { preview: next } = await window.novelTrans.sourceFolder.scanPreview({
        folderPath: selected.folderPath,
      });
      setPreview(next);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const importFolder = async () => {
    if (!preview || !folderPath) {
      setError(t('setup.importNoFolder'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const parts = folderPath.replace(/[/\\]+$/, '').split(/[/\\]/);
      const folderName = parts.at(-1) ?? t('createProjectWizard.defaultTitle');
      const accountId = readyWithDrive[0]?.id ?? readyAccounts[0]?.id ?? null;
      const result = await window.novelTrans.sourceFolder.import({
        previewId: preview.previewId,
        projectTitle: folderName,
        genre: null,
        chineseTitle: null,
        accountId,
        styleConfig: { preset: 'balanced' },
        expectedStartChapter: null,
        expectedEndChapter: null,
      });
      setImportMessage(
        t('setup.importDone', { chapters: String(result.chapterCount) }),
      );
      await refresh();
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
        <p>{t('setup.loading')}</p>
      </div>
    );
  }

  const stepIndex = SETUP_WIZARD_STEPS.indexOf(status.step);

  return (
    <div className="setup-wizard page">
      <PageHeader
        title={t('app.name')}
        description={t('setup.stepOf', {
          current: stepIndex + 1,
          total: SETUP_WIZARD_STEPS.length,
        })}
      />

      <ol className="setup-steps">
        {SETUP_WIZARD_STEPS.map((id, i) => (
          <li
            key={id}
            className={i === stepIndex ? 'active' : i < stepIndex ? 'done' : ''}
          >
            {t(STEP_TITLE_KEYS[id])}
          </li>
        ))}
      </ol>

      {error ? (
        <ErrorPanel title={t('errors.UNKNOWN.title')} description={error} technical={error} />
      ) : null}

      <Card as="section" className="setup-panel">
        {status.step === 'welcome' ? (
          <>
            <h2>{t('setup.welcome')}</h2>
            <p>{t('setup.welcomeBody')}</p>
            <Button
              variant="primary"
              disabled={busy}
              onClick={() => {
                void go('storage');
              }}
            >
              {t('setup.next')}
            </Button>
          </>
        ) : null}

        {status.step === 'storage' ? (
          <>
            <h2>{t('setup.storage')}</h2>
            <p>{t('setup.storageBody')}</p>
            <code className="code-block">{status.storageRoot}</code>
            <div className="btn-row">
              <Button
                variant="secondary"
                onClick={() => {
                  void window.novelTrans.openFolder('root');
                }}
              >
                {t('setup.openFolder')}
              </Button>
              <Button
                variant="primary"
                disabled={busy}
                onClick={() => {
                  void go('drive');
                }}
              >
                {t('setup.next')}
              </Button>
            </div>
          </>
        ) : null}

        {status.step === 'drive' ? (
          <>
            <h2>{t('setup.drive')}</h2>
            <p>{t('setup.driveBody')}</p>
            <p>
              <Badge tone={oauthConfigured ? 'success' : 'warning'}>
                {oauthConfigured
                  ? t('settings.oauthConfigured')
                  : t('settings.oauthNotConfigured')}
              </Badge>
            </p>
            <ol className="oauth-setup-steps muted">
              <li>
                {t('settings.oauthStepConsole')}{' '}
                <a
                  className="ext-link"
                  href={GOOGLE_CLOUD_CONSOLE_URL}
                  target="_blank"
                  rel="noreferrer"
                >
                  {t('settings.oauthLinkConsole')}
                </a>
              </li>
              <li>{t('settings.oauthStepEnableApi')}</li>
              <li>{t('settings.oauthStepConsent')}</li>
              <li>
                {t('settings.oauthStepCredentials')}{' '}
                <a
                  className="ext-link"
                  href={GOOGLE_CLOUD_CREDENTIALS_URL}
                  target="_blank"
                  rel="noreferrer"
                >
                  {t('settings.oauthLinkCredentials')}
                </a>
              </li>
              <li>{t('settings.oauthStepPaste')}</li>
            </ol>
            <div className="toolbar" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
              <label>
                {t('settings.clientId')}
                <Input
                  type="text"
                  value={clientId}
                  onChange={(event) => {
                    setClientId(event.target.value);
                  }}
                  placeholder="xxxx.apps.googleusercontent.com"
                />
              </label>
              <label>
                {t('settings.clientSecret')}
                <Input
                  type="password"
                  value={clientSecret}
                  onChange={(event) => {
                    setClientSecret(event.target.value);
                  }}
                />
              </label>
              <div className="btn-row">
                <Button
                  variant="secondary"
                  disabled={busy || !clientId.trim()}
                  onClick={() => {
                    void saveOauth();
                  }}
                >
                  {t('settings.saveOauth')}
                </Button>
                <Button
                  variant="primary"
                  disabled={busy || !oauthConfigured}
                  onClick={() => {
                    void go('googleAccount');
                  }}
                >
                  {t('setup.next')}
                </Button>
              </div>
            </div>
            {loginHint && status.step === 'drive' ? (
              <p className="success-text">{loginHint}</p>
            ) : null}
          </>
        ) : null}

        {status.step === 'googleAccount' ? (
          <>
            <h2>{t('setup.googleAccount')}</h2>
            <p>
              {t('setup.googleAccountBody', {
                count: accounts.length,
                ready: readyAccounts.length,
              })}
            </p>
            <p className="muted">{t('setup.driveConnectHint')}</p>
            {loginHint ? <p className="success-text">{loginHint}</p> : null}
            {pendingAccountId ? <p className="muted">{t('setup.googleAccountWaiting')}</p> : null}
            <div className="btn-row">
              <Button
                variant="secondary"
                disabled={busy || pendingAccountId !== null}
                onClick={() => {
                  void addGoogleAccount();
                }}
              >
                {t('actions.addGoogleAccount')}
              </Button>
              <Button
                variant="secondary"
                disabled={busy}
                onClick={() => {
                  void (async () => {
                    setBusy(true);
                    setError(null);
                    try {
                      const list = await refreshAccounts();
                      const target =
                        list.find((a) => a.status !== 'READY' || !a.driveConnected) ??
                        list[0];
                      if (target) {
                        await finishGoogleLogin(target.id);
                      }
                      await refresh();
                    } catch (err: unknown) {
                      setError(err instanceof Error ? err.message : String(err));
                    } finally {
                      setBusy(false);
                    }
                  })();
                }}
              >
                {t('setup.refresh')}
              </Button>
              <Button
                variant="primary"
                disabled={busy || !googleStepReady}
                onClick={() => {
                  void go('importNovel');
                }}
              >
                {t('setup.next')}
              </Button>
            </div>
          </>
        ) : null}

        {status.step === 'importNovel' ? (
          <>
            <h2>{t('setup.importNovel')}</h2>
            <p>{t('setup.importNovelBody', { count: status.projectCount })}</p>
            <p className="muted">{folderPath ?? t('setup.importNoFolder')}</p>
            {preview ? (
              <p className="muted">
                {preview.scanResult.recognizedFiles} / {preview.scanResult.filesTotal} files
              </p>
            ) : null}
            {importMessage ? <p className="success-text">{importMessage}</p> : null}
            <div className="btn-row">
              <Button
                variant="secondary"
                disabled={busy}
                onClick={() => {
                  void pickAndScanFolder();
                }}
              >
                {busy && !preview ? t('setup.importScanning') : t('setup.importChooseFolder')}
              </Button>
              <Button
                variant="secondary"
                disabled={busy || !preview}
                onClick={() => {
                  void importFolder();
                }}
              >
                {t('setup.importConfirm')}
              </Button>
              <Button
                variant="primary"
                disabled={busy}
                onClick={() => {
                  void go('notebook');
                }}
              >
                {t('setup.next')}
              </Button>
            </div>
          </>
        ) : null}

        {status.step === 'notebook' ? (
          <>
            <h2>{t('setup.notebook')}</h2>
            <p>{t('setup.notebookBody', { count: status.notebookReadyCount })}</p>
            <div className="btn-row">
              <Button
                variant="secondary"
                disabled={busy}
                onClick={() => {
                  void (async () => {
                    setBusy(true);
                    setError(null);
                    try {
                      const [projects, accountList] = await Promise.all([
                        window.novelTrans.projects.list(),
                        window.novelTrans.accounts.list(),
                      ]);
                      const projectId = projects.projects[0]?.id;
                      const accountId =
                        accountList.accounts.find((a) => a.status === 'READY')?.id ??
                        accountList.accounts[0]?.id;
                      if (!projectId || !accountId) {
                        setError(t('setup.provisionNeedProjectAccount'));
                        return;
                      }
                      await window.novelTrans.notebook.provision({ projectId, accountId });
                      await refresh();
                    } catch (err: unknown) {
                      setError(err instanceof Error ? err.message : String(err));
                    } finally {
                      setBusy(false);
                    }
                  })();
                }}
              >
                {t('setup.provisionNotebook')}
              </Button>
              <Button
                variant="primary"
                disabled={busy}
                onClick={() => {
                  void go('testGemini');
                }}
              >
                {t('setup.next')}
              </Button>
            </div>
          </>
        ) : null}

        {status.step === 'testGemini' ? (
          <>
            <h2>{t('setup.testGemini')}</h2>
            <p>{t('setup.testGeminiBody')}</p>
            {testMessage ? <p className="success-text">{testMessage}</p> : null}
            <div className="btn-row">
              <Button
                variant="secondary"
                disabled={busy || accounts.length < 1}
                onClick={() => {
                  void (async () => {
                    setBusy(true);
                    try {
                      const id = accounts[0]?.id;
                      if (!id) return;
                      const result = await window.novelTrans.diagnostics.connectionTest({
                        kind: 'browserProfile',
                        accountId: id,
                      });
                      setTestMessage(
                        `${result.ok ? t('setup.testOk') : t('setup.testFail')}: ${result.message}`,
                      );
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
                  void go('ready');
                }}
              >
                {t('setup.next')}
              </Button>
            </div>
          </>
        ) : null}

        {status.step === 'ready' ? (
          <>
            <h2>{t('setup.ready')}</h2>
            <p>{t('setup.readyBody')}</p>
            <Button
              variant="primary"
              disabled={busy}
              onClick={() => {
                void finish();
              }}
            >
              {t('setup.enterApp')}
            </Button>
          </>
        ) : null}
      </Card>
    </div>
  );
}
