import { useCallback, useEffect, useState } from 'react';
import type { AiProviderDto } from '@shared/schemas/ai-provider';
import { useT } from '../../i18n';
import { statusLabel } from '../../i18n/status';
import { aiProviderTypeLabel } from '../../i18n/enums';
import { Badge, Button, Card } from '../ui';
import { SettingsStatus } from './SettingsStatus';
import { useSettingsFeedback } from './useSettingsFeedback';

interface ProviderListState {
  providers: AiProviderDto[];
  primaryProviderId: string | null;
  fallbackEnabled: boolean;
  workerInstalled: boolean;
  workerRunning: boolean;
  workerMessage: string | null;
}

export function AiProvidersSettingsPanel() {
  const t = useT();
  const { showSaved } = useSettingsFeedback();
  const [actionError, setActionError] = useState<string | null>(null);
  const [state, setState] = useState<ProviderListState | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const list = await window.novelTrans.aiProviders.list();
    setState({
      providers: list.providers,
      primaryProviderId: list.primaryProviderId,
      fallbackEnabled: list.fallbackEnabled,
      workerInstalled: list.workerInstalled,
      workerRunning: list.workerRunning,
      workerMessage: list.workerMessage,
    });
  }, []);

  useEffect(() => {
    void refresh().catch((err: unknown) => {
      setActionError(err instanceof Error ? err.message : String(err));
    });
  }, [refresh]);

  const statusTone = (status: string): 'success' | 'warning' | 'error' | 'default' => {
    if (status === 'READY') return 'success';
    if (status === 'LOGIN_REQUIRED') return 'warning';
    if (status === 'ERROR' || status === 'DISABLED') return 'error';
    return 'default';
  };

  return (
    <>
      <p className="muted">{t('settings.aiProvidersBody')}</p>
      {actionError ? <SettingsStatus tone="error">{actionError}</SettingsStatus> : null}

      {!state?.workerInstalled ? (
        <div className="banner banner-warning" style={{ marginBottom: '0.75rem' }}>
          {state?.workerMessage ?? t('settings.aiWorkerMissing')}
          <div className="btn-row" style={{ marginTop: '0.5rem' }}>
            <Button
              variant="primary"
              disabled={busy}
              onClick={() => {
                setBusy(true);
                setActionError(null);
                void window.novelTrans.aiProviders
                  .installWorker()
                  .then((installResult) => {
                    showSaved(installResult.message);
                    return refresh();
                  })
                  .catch((err: unknown) => {
                    setActionError(
                      err instanceof Error ? err.message : String(err),
                    );
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
                setActionError(
                  err instanceof Error ? err.message : String(err),
                );
              });
          }}
        />
        {t('settings.aiFallbackAuto')}
      </label>

      <div className="u-stack">
        {(state?.providers ?? []).map((provider, _index, all) => {
          const ordered = [...all].sort(
            (a, b) => a.priority - b.priority || a.name.localeCompare(b.name),
          );
          const isPrimary =
            provider.enabled &&
            (state?.primaryProviderId === provider.id ||
              (!state?.primaryProviderId && ordered[0]?.id === provider.id));
          const isFallback = provider.enabled && !isPrimary;
          return (
            <Card key={provider.id} as="div" className="u-pad-compact">
              <div className="u-row u-row--between">
                <div>
                  <strong>{provider.name}</strong>
                  <div className="muted u-text-sm">
                    {aiProviderTypeLabel(provider.type)} · {t('settings.aiPriority')}:{' '}
                    {provider.priority}
                    {isPrimary ? ` · ${t('settings.aiBadgePrimary')}` : ''}
                    {isFallback ? ` · ${t('settings.aiBadgeFallback')}` : ''}
                  </div>
                  {provider.accountEmail ? (
                    <div className="muted u-text-sm">{provider.accountEmail}</div>
                  ) : null}
                </div>
                <Badge tone={statusTone(provider.status)}>{statusLabel(provider.status)}</Badge>
              </div>
              <div className="btn-row u-mt-2">
                <Button
                  variant="secondary"
                  disabled={busy}
                  onClick={() => {
                    setBusy(true);
                    void window.novelTrans.aiProviders
                      .check({ providerId: provider.id })
                      .then((checkResult) => {
                        showSaved(checkResult.message);
                        return refresh();
                      })
                      .catch((err: unknown) => {
                        setActionError(
                          err instanceof Error ? err.message : String(err),
                        );
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
                  disabled={busy || isPrimary}
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
    </>
  );
}
