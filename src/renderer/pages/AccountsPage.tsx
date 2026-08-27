import { useCallback, useEffect, useState } from 'react';
import { Users } from 'lucide-react';
import type { GoogleAccountDto } from '@shared/schemas/account';
import {
  GOOGLE_ACCOUNT_PLANS,
  type GoogleAccountPlan,
} from '@shared/constants/google-account';
import { useT } from '../i18n';
import { friendlyError } from '../i18n/errors';
import { statusLabel } from '../i18n/status';
import { helpArticleForErrorCode } from '../features/help/content';
import {
  PageHeader,
  Button,
  Card,
  EmptyState,
  StatusBadge,
  Dialog,
  Select,
  Skeleton,
  ErrorPanel,
  Input,
  Badge,
} from '../components/ui';
import { HelpContextButton } from '../features/help/HelpContextButton';

export function AccountsPage() {
  const t = useT();
  const [accounts, setAccounts] = useState<GoogleAccountDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [emailDraft, setEmailDraft] = useState<Record<string, string>>({});
  const [removeTarget, setRemoveTarget] = useState<GoogleAccountDto | null>(null);
  const [renameTarget, setRenameTarget] = useState<GoogleAccountDto | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [driveAuthDraft, setDriveAuthDraft] = useState<Record<string, string>>({});

  const refresh = useCallback(async () => {
    const result = await window.novelTrans.accounts.list();
    setAccounts(result.accounts);
  }, []);

  useEffect(() => {
    void refresh()
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : t('errors.UNKNOWN.title'));
      })
      .finally(() => {
        setLoading(false);
      });
  }, [refresh, t]);

  const run = async (accountId: string | null, action: () => Promise<void>) => {
    setError(null);
    setMessage(null);
    setBusyId(accountId ?? 'global');
    try {
      await action();
      await refresh();
    } catch (err: unknown) {
      const raw =
        err instanceof Error
          ? err.message
          : typeof err === 'string'
            ? err
            : err && typeof err === 'object' && 'message' in err
              ? String((err as { message: unknown }).message)
              : t('errors.UNKNOWN.title');
      setError(raw || t('errors.UNKNOWN.title'));
    } finally {
      setBusyId(null);
    }
  };

  const addAccount = () => {
    void run(null, async () => {
      const result = await window.novelTrans.accounts.add({});
      setMessage(
        `${t('accounts.loggedIn')} · ${result.account.id.slice(0, 8)}… · ${t('actions.openBrowser')}`,
      );
      // Best-effort auto-finish after browser login (no email required when probe works)
      try {
        await window.novelTrans.accounts.completeLogin(result.account.id, {});
        setMessage(t('accounts.loggedIn'));
      } catch {
        // User still finishing browser login — they can click Signed in later
      }
    });
  };

  const confirmRemove = () => {
    if (!removeTarget) return;
    const account = removeTarget;
    setRemoveTarget(null);
    void run(account.id, async () => {
      await window.novelTrans.accounts.remove(account.id);
      setMessage(t('accounts.deleteAccount'));
    });
  };

  const confirmRename = () => {
    if (!renameTarget) return;
    const label = renameDraft.trim();
    if (!label) return;
    const account = renameTarget;
    setRenameTarget(null);
    void run(account.id, async () => {
      await window.novelTrans.accounts.rename(account.id, label);
    });
  };

  if (loading) {
    return (
      <div>
        <PageHeader title={t('accounts.title')} description={t('accounts.subtitle')} />
        <div className="account-list">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} height={180} />
          ))}
        </div>
      </div>
    );
  }

  const errInfo = error ? friendlyError(error) : null;

  return (
    <div>
      <PageHeader
        title={t('accounts.title')}
        description={t('accounts.subtitle')}
        actions={
          <>
            <HelpContextButton articleId="google-accounts" />
            <Button variant="primary" disabled={busyId !== null} onClick={addAccount}>
              {t('actions.addGoogleAccount')}
            </Button>
          </>
        }
      />

      {errInfo ? (
        <ErrorPanel
          title={errInfo.title}
          description={errInfo.description}
          technical={errInfo.technical}
          helpArticleId={helpArticleForErrorCode(errInfo.code)}
          actions={[{ label: t('actions.retry'), onClick: () => void refresh(), primary: true }]}
        />
      ) : null}
      {message ? <div className="banner banner-info">{message}</div> : null}

      {accounts.length === 0 ? (
        <EmptyState
          icon={<Users />}
          title={t('accounts.emptyTitle')}
          description={t('accounts.emptyDesc')}
          actionLabel={t('actions.addGoogleAccount')}
          onAction={addAccount}
        />
      ) : (
        <div className="account-list">
          {accounts.map((account) => {
            const busy = busyId === account.id || busyId === 'global';
            return (
              <Card key={account.id} className="account-card">
                <header className="account-card-header">
                  <div className="account-identity">
                    {account.avatarUrl ? (
                      <img
                        className="account-avatar"
                        src={account.avatarUrl}
                        alt=""
                        width={40}
                        height={40}
                      />
                    ) : (
                      <div className="account-avatar placeholder" aria-hidden>
                        {(account.displayName || '?').slice(0, 1).toUpperCase()}
                      </div>
                    )}
                    <div>
                      <h3 style={{ margin: 0 }}>{account.displayName || account.label}</h3>
                      <p className="muted" style={{ margin: '0.15rem 0 0' }}>
                        {account.email ??
                          (account.status === 'READY' || account.status === 'BUSY'
                            ? t('accounts.emailMissing')
                            : t('status.loginRequired'))}
                      </p>
                    </div>
                  </div>
                  <div className="account-badges btn-row">
                    <StatusBadge status={account.status} />
                    <Badge tone="accent">{account.plan}</Badge>
                    {account.driveConnected ? (
                      <Badge tone="success">{t('accounts.drive')}</Badge>
                    ) : (
                      <Badge>{t('status.disconnected')}</Badge>
                    )}
                    {!account.workerEnabled ? (
                      <Badge tone="warning">{t('status.paused')}</Badge>
                    ) : (
                      <Badge tone="success">{t('accounts.ready')}</Badge>
                    )}
                  </div>
                </header>

                <dl className="account-meta">
                  <div>
                    <dt>{t('accounts.gemini')}</dt>
                    <dd title={account.browserProfilePath}>
                      <code>{account.browserProfilePath}</code>
                    </dd>
                  </div>
                  <div>
                    <dt>{t('accounts.projects', { count: account.assignedProjects.length })}</dt>
                    <dd>
                      {account.assignedProjects.length > 0
                        ? account.assignedProjects.join(', ')
                        : t('common.noData')}
                    </dd>
                  </div>
                  <div>
                    <dt>{t('jobs.started')}</dt>
                    <dd>{account.lastSeenAt ?? '—'}</dd>
                  </div>
                  <div>
                    <dt>{t('jobs.duration')}</dt>
                    <dd>{account.lastUsedAt ?? '—'}</dd>
                  </div>
                </dl>

                {account.notes ? <p className="account-notes">{account.notes}</p> : null}

                {account.profileLease ? (
                  <p className="account-lease-busy" role="status">
                    {t('accounts.profileInUseBy', { label: account.profileLease.label })}
                  </p>
                ) : null}

                <div className="account-controls btn-row" style={{ flexWrap: 'wrap' }}>
                  <label className="inline-field">
                    {t('aiPanel.plan')}
                    <Select
                      value={account.plan}
                      disabled={busy}
                      onChange={(event) => {
                        const plan = event.target.value as GoogleAccountPlan;
                        void run(account.id, async () => {
                          await window.novelTrans.accounts.setPlan(account.id, plan);
                        });
                      }}
                    >
                      {GOOGLE_ACCOUNT_PLANS.map((plan) => (
                        <option key={plan} value={plan}>
                          {plan}
                        </option>
                      ))}
                    </Select>
                  </label>

                  <Button
                    size="sm"
                    disabled={busy}
                    onClick={() => {
                      setRenameDraft(account.label);
                      setRenameTarget(account);
                    }}
                  >
                    {t('actions.edit')}
                  </Button>

                  <Button
                    size="sm"
                    disabled={busy}
                    onClick={() => {
                      void run(account.id, async () => {
                        try {
                          await window.novelTrans.accounts.openBrowser(account.id, 'gemini');
                          setMessage(t('actions.openBrowser'));
                        } catch (err: unknown) {
                          const msg = err instanceof Error ? err.message : String(err);
                          if (/PROFILE_BUSY/i.test(msg)) {
                            setError(msg.replace(/^PROFILE_BUSY:\s*/i, ''));
                            return;
                          }
                          throw err;
                        }
                      });
                    }}
                  >
                    {t('actions.openBrowser')}
                  </Button>

                  <Button
                    size="sm"
                    disabled={busy}
                    onClick={() => {
                      void run(account.id, async () => {
                        const result = await window.novelTrans.accounts.testSession(account.id);
                        setMessage(
                          result.usable
                            ? `${t('accounts.ready')}${result.email ? ` (${result.email})` : ''}`
                            : `${statusLabel(result.reason ?? 'LOGIN_REQUIRED')}${result.reason && result.reason !== 'BUSY' ? `: ${result.reason}` : ''}`,
                        );
                      });
                    }}
                  >
                    {t('actions.check')}
                  </Button>

                  <div className="complete-login-row btn-row">
                    {account.status !== 'READY' && !account.email ? (
                      <Input
                        type="email"
                        placeholder={t('accounts.emailPlaceholder')}
                        value={emailDraft[account.id] ?? ''}
                        disabled={busy}
                        onChange={(event) => {
                          setEmailDraft((prev) => ({
                            ...prev,
                            [account.id]: event.target.value,
                          }));
                        }}
                      />
                    ) : null}
                    {account.status !== 'READY' ? (
                      <Button
                        size="sm"
                        disabled={busy}
                        onClick={() => {
                          void run(account.id, async () => {
                            const draft = emailDraft[account.id];
                            const email = typeof draft === 'string' ? draft.trim() : '';
                            try {
                              await window.novelTrans.accounts.completeLogin(account.id, {
                                email:
                                  email.length > 0
                                    ? email
                                    : account.email ?? undefined,
                              });
                              setMessage(t('accounts.loggedIn'));
                            } catch (err: unknown) {
                              if (!email && !account.email) {
                                throw new Error(t('accounts.emailRequiredToFinish'));
                              }
                              throw err;
                            }
                          });
                        }}
                      >
                        {t('accounts.loggedIn')}
                      </Button>
                    ) : null}
                  </div>

                  {account.driveConnected ? (
                    <Button
                      size="sm"
                      disabled={busy}
                      onClick={() => {
                        void run(account.id, async () => {
                          await window.novelTrans.accounts.disconnectDrive(account.id);
                          setMessage(`${t('accounts.drive')} · ${t('status.disconnected')}`);
                        });
                      }}
                    >
                      {t('accounts.disconnectDrive')}
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="primary"
                      disabled={busy}
                      onClick={() => {
                        void run(account.id, async () => {
                          setMessage(t('accounts.driveOAuthPending'));
                          await window.novelTrans.accounts.connectDrive(account.id);
                          setMessage(`${t('accounts.drive')} · ${t('status.connected')}`);
                        });
                      }}
                    >
                      {t('accounts.connectDrive')}
                    </Button>
                  )}

                  {!account.driveConnected ? (
                    <details className="drive-oauth-fallback" style={{ width: '100%' }}>
                      <summary className="muted" style={{ cursor: 'pointer' }}>
                        {t('accounts.driveOAuthFallbackTitle')}
                      </summary>
                      <p className="muted" style={{ margin: '0.5rem 0' }}>
                        {t('accounts.driveOAuthFallbackBody')}
                      </p>
                      <div className="btn-row" style={{ alignItems: 'flex-end', flexWrap: 'wrap' }}>
                        <label className="inline-field" style={{ flex: '1 1 280px' }}>
                          URL OAuth
                          <Input
                            value={driveAuthDraft[account.id] ?? ''}
                            disabled={busy}
                            placeholder={t('accounts.driveOAuthFallbackPlaceholder')}
                            onChange={(event) => {
                              const value = event.target.value;
                              setDriveAuthDraft((prev) => ({ ...prev, [account.id]: value }));
                            }}
                          />
                        </label>
                        <Button
                          size="sm"
                          disabled={busy || !(driveAuthDraft[account.id]?.trim().length ?? 0)}
                          onClick={() => {
                            const payload = driveAuthDraft[account.id]?.trim() ?? '';
                            void run(account.id, async () => {
                              await window.novelTrans.accounts.connectDriveWithAuth(
                                account.id,
                                payload,
                              );
                              setDriveAuthDraft((prev) => {
                                const next = { ...prev };
                                delete next[account.id];
                                return next;
                              });
                              setMessage(t('accounts.driveOAuthFallbackSuccess'));
                            });
                          }}
                        >
                          {t('accounts.driveOAuthFallbackSubmit')}
                        </Button>
                      </div>
                    </details>
                  ) : null}

                  {account.workerEnabled ? (
                    <Button
                      size="sm"
                      disabled={busy}
                      onClick={() => {
                        void run(account.id, async () => {
                          await window.novelTrans.accounts.disable(account.id);
                        });
                      }}
                    >
                      {t('actions.pause')}
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      disabled={busy}
                      onClick={() => {
                        void run(account.id, async () => {
                          await window.novelTrans.accounts.enable(account.id);
                        });
                      }}
                    >
                      {t('actions.resume')}
                    </Button>
                  )}

                  <Button
                    size="sm"
                    variant="danger"
                    disabled={busy}
                    onClick={() => { setRemoveTarget(account); }}
                  >
                    {t('accounts.deleteAccount')}
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog
        open={removeTarget !== null}
        title={t('accounts.deleteConfirmTitle', {
          email: removeTarget?.email ?? removeTarget?.label ?? '',
        })}
        description={t('accounts.deleteConfirmBody')}
        confirmLabel={t('accounts.deleteAccount')}
        cancelLabel={t('actions.cancel')}
        danger
        busy={busyId !== null}
        onConfirm={confirmRemove}
        onCancel={() => { setRemoveTarget(null); }}
      />

      <Dialog
        open={renameTarget !== null}
        title={t('actions.edit')}
        confirmLabel={t('actions.confirm')}
        cancelLabel={t('actions.cancel')}
        busy={busyId !== null}
        onConfirm={confirmRename}
        onCancel={() => { setRenameTarget(null); }}
      >
        <Input
          value={renameDraft}
          onChange={(e) => { setRenameDraft(e.target.value); }}
          autoFocus
          onKeyDown={(e) => {
            if (e.key === 'Enter') confirmRename();
          }}
        />
      </Dialog>
    </div>
  );
}
