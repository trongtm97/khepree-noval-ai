import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { AiAutoSetupResult, AiStatusSnapshot } from '@shared/schemas/ai-auto-setup';
import { useT } from '../../i18n';
import { Button } from '../ui';
import { SettingsDisclosure } from './SettingsDisclosure';
import { SettingsSection } from './SettingsSection';
import { SettingsStatus } from './SettingsStatus';
import { AiPreferencePanel } from './AiPreferencePanel';
import { accountsRouteForProvider } from '../../features/accounts/ai-account-view-model';
import type { AiAccountProviderKind } from '../../features/accounts/ai-account-view-model';

function formatTechnical(technical: AiAutoSetupResult['technical']): string {
  if (!technical) return '';
  return Object.entries(technical)
    .map(([key, value]) => `${key}: ${String(value)}`)
    .join('\n');
}

function loginTargetToProviderKind(
  target: 'GEMINI' | 'CHATGPT' | 'META_AI',
): AiAccountProviderKind {
  if (target === 'CHATGPT') return 'chatgpt';
  if (target === 'META_AI') return 'meta';
  return 'gemini';
}

function healthLabelKey(preference: 'GEMINI' | 'CHATGPT' | 'META_AI'): string {
  switch (preference) {
    case 'GEMINI':
      return 'settings.aiPreferenceGemini';
    case 'CHATGPT':
      return 'settings.aiPreferenceChatGpt';
    case 'META_AI':
      return 'settings.aiPreferenceMetaAi';
  }
}

export function AiSettingsPanel({
  onLoadError,
}: {
  onLoadError: (msg: string | null) => void;
}) {
  const t = useT();
  const navigate = useNavigate();
  const [status, setStatus] = useState<AiStatusSnapshot | null>(null);
  const [result, setResult] = useState<AiAutoSetupResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const refreshStatus = useCallback(async () => {
    const snap = await window.khepreeNovelAI.aiProviders.autoSetupStatus();
    setStatus(snap);
    onLoadError(null);
  }, [onLoadError]);

  useEffect(() => {
    void refreshStatus().catch((err: unknown) => {
      onLoadError(err instanceof Error ? err.message : String(err));
    });
  }, [refreshStatus, onLoadError]);

  useEffect(() => {
    const onFocus = () => {
      void refreshStatus().catch(() => undefined);
    };
    window.addEventListener('focus', onFocus);
    return () => {
      window.removeEventListener('focus', onFocus);
    };
  }, [refreshStatus]);

  const runAutoSetup = async () => {
    setBusy(true);
    setActionError(null);
    setResult(null);
    try {
      const setupResult = await window.khepreeNovelAI.aiProviders.autoSetupRun();
      setResult(setupResult);
      await refreshStatus();
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const loginTarget = result?.loginTarget ?? status?.loginRequired ?? null;

  return (
    <>
      <SettingsSection title={t('settings.ai')} description={t('settings.aiTabBody')}>
        {actionError ? <SettingsStatus tone="error">{actionError}</SettingsStatus> : null}

        {status ? (
          <div className="settings-ai-status u-stack" style={{ marginBottom: '1rem' }}>
            <SettingsStatus tone={status.ready ? 'info' : 'warn'}>
              {status.ready ? `✓ ${t('settings.aiStatusReady')}` : t('settings.aiStatusNeedsSetup')}
            </SettingsStatus>
            {status.providerHealth.length > 0 ? (
              <ul className="settings-ai-health-list">
                {(Array.isArray(status.providerHealth) ? status.providerHealth : []).map((row) => (
                  <li key={row.preference}>
                    <span>{t(healthLabelKey(row.preference))}</span>
                    <span className={row.ok ? 'settings-ai-health-ok' : 'settings-ai-health-bad'}>
                      {row.ok ? '✓' : '—'}
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
            {status.loginRequired ? (
              <SettingsStatus tone="warn">{t('settings.aiNeedAccountLogin')}</SettingsStatus>
            ) : null}
          </div>
        ) : null}

        {result ? (
          <div className="settings-ai-result u-stack" style={{ marginBottom: '1rem' }}>
            <SettingsStatus
              tone={
                result.outcome === 'ready'
                  ? 'info'
                  : result.outcome === 'action_required'
                    ? 'warn'
                    : 'error'
              }
            >
              {result.title}
            </SettingsStatus>
            <p className="muted" style={{ margin: 0 }}>
              {result.message}
            </p>
          </div>
        ) : null}

        <div className="btn-row" style={{ flexWrap: 'wrap', gap: '0.5rem' }}>
          <Button variant="primary" disabled={busy} onClick={() => { void runAutoSetup(); }}>
            {busy ? t('settings.aiAutoSetupRunning') : t('settings.aiAutoSetup')}
          </Button>
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() => {
              navigate('/accounts');
            }}
          >
            {t('settings.aiManageAccounts')}
          </Button>
          {result?.action === 'login' || result?.action === 'add_account' ? (
            <Button
              variant="secondary"
              onClick={() => {
                if (loginTarget) {
                  navigate(accountsRouteForProvider(loginTargetToProviderKind(loginTarget)));
                } else {
                  navigate('/accounts');
                }
              }}
            >
              {loginTarget
                ? t('settings.aiLoginTarget', {
                    provider: t(healthLabelKey(loginTarget)),
                  })
                : result.action === 'login'
                  ? t('settings.aiLogin')
                  : t('settings.aiManageAccounts')}
            </Button>
          ) : null}
          {result?.outcome === 'failed' ? (
            <Button variant="secondary" disabled={busy} onClick={() => { void runAutoSetup(); }}>
              {t('settings.aiRetryFix')}
            </Button>
          ) : null}
        </div>

        {result?.outcome === 'failed' ? (
          <SettingsDisclosure
            title={t('settings.advancedSection')}
            description={t('settings.advancedSectionHelp')}
            defaultOpen
          >
            <p className="field-help muted">{t('errors.technicalDetails')}</p>
            <pre
              className="muted"
              style={{
                whiteSpace: 'pre-wrap',
                fontSize: '0.85rem',
                margin: 0,
                maxHeight: '14rem',
                overflow: 'auto',
              }}
            >
              {formatTechnical(result.technical)}
              {result.steps.length > 0
                ? `${result.technical && Object.keys(result.technical).length > 0 ? '\n\n' : ''}${result.steps.map((s) => `${s.ok ? '✓' : '✗'} ${s.message}`).join('\n')}`
                : ''}
            </pre>
          </SettingsDisclosure>
        ) : null}

        <AiPreferencePanel />
      </SettingsSection>
    </>
  );
}
