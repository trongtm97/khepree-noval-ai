import { useCallback, useEffect, useState } from 'react';
import type { AiAccountDto, AiProviderDto } from '@shared/schemas/ai-provider';
import { AI_PROVIDER_IDS } from '@shared/constants/ai-provider';
import { useT } from '../../i18n';
import {
  Badge,
  Button,
  Card,
  Input,
  SectionHeader,
} from '../ui';

type ProviderListState = {
  providers: AiProviderDto[];
  fallbackEnabled: boolean;
  workerInstalled: boolean;
  workerRunning: boolean;
  workerMessage: string | null;
};

export function AiProvidersSettingsPanel({
  onMessage,
  onError,
}: {
  onMessage: (msg: string | null) => void;
  onError: (msg: string | null) => void;
}) {
  const t = useT();
  const [state, setState] = useState<ProviderListState | null>(null);
  const [accounts, setAccounts] = useState<AiAccountDto[]>([]);
  const [busy, setBusy] = useState(false);
  const [psid, setPsid] = useState('');
  const [psidts, setPsidts] = useState('');
  const [email, setEmail] = useState('');
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const list = await window.novelTrans.aiProviders.list();
    setState({
      providers: list.providers,
      fallbackEnabled: list.fallbackEnabled,
      workerInstalled: list.workerInstalled,
      workerRunning: list.workerRunning,
      workerMessage: list.workerMessage,
    });
    const acc = await window.novelTrans.aiAccounts.list({
      providerId: AI_PROVIDER_IDS.GEMINI_WEB_API,
    });
    setAccounts(acc.accounts);
    if (!selectedAccountId && acc.accounts[0]) {
      setSelectedAccountId(acc.accounts[0].id);
    }
  }, [selectedAccountId]);

  useEffect(() => {
    void refresh().catch((err: unknown) => {
      onError(err instanceof Error ? err.message : t('errors.UNKNOWN.title'));
    });
  }, [refresh, onError, t]);

  const statusTone = (status: string): 'success' | 'warning' | 'error' | 'default' => {
    if (status === 'READY') return 'success';
    if (status === 'LOGIN_REQUIRED') return 'warning';
    if (status === 'ERROR' || status === 'DISABLED') return 'error';
    return 'default';
  };

  return (
    <>
      <Card as="section" style={{ marginTop: '1rem' }}>
        <SectionHeader title={t('settings.aiProvidersTitle')} />
        <p className="muted">{t('settings.aiProvidersBody')}</p>

        {!state?.workerInstalled ? (
          <div className="banner banner-warning" style={{ marginBottom: '0.75rem' }}>
            {state?.workerMessage ?? t('settings.aiWorkerMissing')}
            <div className="btn-row" style={{ marginTop: '0.5rem' }}>
              <Button
                variant="primary"
                disabled={busy}
                onClick={() => {
                  setBusy(true);
                  onError(null);
                  void window.novelTrans.aiProviders
                    .installWorker()
                    .then((result) => {
                      onMessage(result.message);
                      return refresh();
                    })
                    .catch((err: unknown) => {
                      onError(err instanceof Error ? err.message : t('errors.UNKNOWN.title'));
                    })
                    .finally(() => {
                      setBusy(false);
                    });
                }}
              >
                {t('settings.aiInstallWorker')}
              </Button>
            </div>
          </div>
        ) : (
          <p className="muted">
            {state.workerRunning
              ? t('settings.aiWorkerRunning')
              : t('settings.aiWorkerInstalled')}
          </p>
        )}

        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: '0.75rem 0' }}>
          <input
            type="checkbox"
            checked={state?.fallbackEnabled ?? true}
            onChange={(event) => {
              void window.novelTrans.aiProviders
                .setFallback({ enabled: event.target.checked })
                .then(() => refresh())
                .catch((err: unknown) => {
                  onError(err instanceof Error ? err.message : t('errors.UNKNOWN.title'));
                });
            }}
          />
          {t('settings.aiFallback')}
        </label>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {(state?.providers ?? []).map((provider, _index, all) => {
            const ordered = [...all].sort(
              (a, b) => a.priority - b.priority || a.name.localeCompare(b.name),
            );
            const isFirst = ordered[0]?.id === provider.id;
            return (
            <Card key={provider.id} as="div" style={{ padding: '0.75rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem' }}>
                <div>
                  <strong>{provider.name}</strong>
                  <div className="muted" style={{ fontSize: '0.85rem' }}>
                    {provider.type} · {t('settings.aiPriority')}: {provider.priority}
                    {isFirst && provider.enabled ? ` · ${t('settings.aiRunsFirst')}` : ''}
                  </div>
                  {provider.accountEmail ? (
                    <div className="muted" style={{ fontSize: '0.85rem' }}>
                      {provider.accountEmail}
                    </div>
                  ) : null}
                </div>
                <Badge tone={statusTone(provider.status)}>{provider.status}</Badge>
              </div>
              <div className="btn-row" style={{ marginTop: '0.5rem', flexWrap: 'wrap' }}>
                <Button
                  variant="secondary"
                  disabled={busy}
                  onClick={() => {
                    setBusy(true);
                    void window.novelTrans.aiProviders
                      .check({ providerId: provider.id })
                      .then((result) => {
                        onMessage(result.message);
                        return refresh();
                      })
                      .catch((err: unknown) => {
                        onError(err instanceof Error ? err.message : t('errors.UNKNOWN.title'));
                      })
                      .finally(() => {
                        setBusy(false);
                      });
                  }}
                >
                  {t('settings.aiCheck')}
                </Button>
                <Button
                  variant="secondary"
                  disabled={busy || isFirst}
                  onClick={() => {
                    void window.novelTrans.aiProviders
                      .setPriority({
                        providerId: provider.id,
                        promote: true,
                      })
                      .then(() => refresh());
                  }}
                >
                  {t('settings.aiPriorityUp')}
                </Button>
                <Button
                  variant="secondary"
                  disabled={busy}
                  onClick={() => {
                    void window.novelTrans.aiProviders
                      .setEnabled({
                        providerId: provider.id,
                        enabled: !provider.enabled,
                      })
                      .then(() => refresh());
                  }}
                >
                  {provider.enabled ? t('settings.aiDisable') : t('settings.aiEnable')}
                </Button>
              </div>
            </Card>
            );
          })}
        </div>
      </Card>

      <Card as="section" style={{ marginTop: '1rem' }}>
        <SectionHeader title={t('settings.aiAccountsTitle')} />
        <p className="muted">{t('settings.aiAccountsBody')}</p>

        <div className="btn-row" style={{ marginBottom: '0.75rem' }}>
          <Button
            variant="primary"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              void window.novelTrans.aiAccounts
                .create({
                  providerId: AI_PROVIDER_IDS.GEMINI_WEB_API,
                  googleEmail: email || null,
                })
                .then((result) => {
                  setSelectedAccountId(result.account.id);
                  onMessage(t('settings.aiAccountCreated'));
                  return refresh();
                })
                .catch((err: unknown) => {
                  onError(err instanceof Error ? err.message : t('errors.UNKNOWN.title'));
                })
                .finally(() => {
                  setBusy(false);
                });
            }}
          >
            {t('settings.aiAddAccount')}
          </Button>
        </div>

        {accounts.length > 0 ? (
          <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 1rem' }}>
            {accounts.map((account) => (
              <li
                key={account.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: '0.5rem',
                  padding: '0.35rem 0',
                  borderBottom: '1px solid var(--border, #333)',
                }}
              >
                <button
                  type="button"
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'inherit',
                    textAlign: 'left',
                    cursor: 'pointer',
                    flex: 1,
                  }}
                  onClick={() => {
                    setSelectedAccountId(account.id);
                  }}
                >
                  {account.googleEmail ?? account.id.slice(0, 8)}
                  {' · '}
                  <Badge tone={statusTone(account.status)}>{account.status}</Badge>
                </button>
                <div className="btn-row">
                  <Button
                    variant="secondary"
                    onClick={() => {
                      void window.novelTrans.aiAccounts
                        .check({ accountId: account.id })
                        .then((result) => {
                          onMessage(result.message ?? '');
                          return refresh();
                        });
                    }}
                  >
                    {t('settings.aiCheck')}
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => {
                      void window.novelTrans.aiAccounts
                        .disable({ accountId: account.id })
                        .then(() => refresh());
                    }}
                  >
                    {t('settings.aiDisable')}
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => {
                      if (!window.confirm(t('settings.aiDeleteConfirm'))) return;
                      void window.novelTrans.aiAccounts
                        .delete({ accountId: account.id })
                        .then(() => refresh());
                    }}
                  >
                    {t('settings.aiDelete')}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">{t('settings.aiNoAccounts')}</p>
        )}

        {(() => {
          const selected = accounts.find((a) => a.id === selectedAccountId);
          const needsManualConnect =
            !selected ||
            selected.status === 'LOGIN_REQUIRED' ||
            selected.status === 'ERROR';
          if (!needsManualConnect) {
            return (
              <p className="muted" style={{ marginTop: '0.75rem' }}>
                {t('settings.aiConnectBody')}
              </p>
            );
          }
          return (
            <>
              <SectionHeader title={t('settings.aiConnectTitle')} />
              <p className="muted">{t('settings.aiConnectBody')}</p>
              <div className="toolbar" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
                <label>
                  Email
                  <Input
                    type="email"
                    value={email}
                    onChange={(event) => {
                      setEmail(event.target.value);
                    }}
                  />
                </label>
                <label>
                  __Secure-1PSID
                  <Input
                    type="password"
                    value={psid}
                    onChange={(event) => {
                      setPsid(event.target.value);
                    }}
                    autoComplete="off"
                  />
                </label>
                <label>
                  __Secure-1PSIDTS
                  <Input
                    type="password"
                    value={psidts}
                    onChange={(event) => {
                      setPsidts(event.target.value);
                    }}
                    autoComplete="off"
                  />
                </label>
                <Button
                  variant="primary"
                  disabled={busy || !selectedAccountId || !psid}
                  onClick={() => {
                    if (!selectedAccountId) return;
                    setBusy(true);
                    onError(null);
                    void window.novelTrans.aiAccounts
                      .pasteCookies({
                        accountId: selectedAccountId,
                        secure1psid: psid,
                        secure1psidts: psidts || undefined,
                        googleEmail: email || undefined,
                      })
                      .then((result) => {
                        onMessage(result.message ?? t('settings.aiConnected'));
                        setPsid('');
                        setPsidts('');
                        return refresh();
                      })
                      .catch((err: unknown) => {
                        onError(err instanceof Error ? err.message : t('errors.UNKNOWN.title'));
                      })
                      .finally(() => {
                        setBusy(false);
                      });
                  }}
                >
                  {t('settings.aiConnect')}
                </Button>
              </div>
            </>
          );
        })()}
      </Card>
    </>
  );
}
