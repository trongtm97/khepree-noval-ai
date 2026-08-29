import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { AiAutoSetupResult, AiStatusSnapshot } from '@shared/schemas/ai-auto-setup';
import { useT } from '../../i18n';
import { Button } from '../ui';
import { SettingsDisclosure } from './SettingsDisclosure';
import { SettingsSection } from './SettingsSection';
import { SettingsStatus } from './SettingsStatus';
import { PrimaryTranslationProviderPanel } from './PrimaryTranslationProviderPanel';
import { PreferNotebookPackToggle } from './PreferNotebookPackToggle';
import { ProjectPrimaryProviderPanel } from './ProjectPrimaryProviderPanel';

function formatTechnical(technical: AiAutoSetupResult['technical']): string {
  if (!technical) return '';
  return Object.entries(technical)
    .map(([key, value]) => `${key}: ${String(value)}`)
    .join('\n');
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
    const snap = await window.novelTrans.aiProviders.autoSetupStatus();
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
      const setupResult = await window.novelTrans.aiProviders.autoSetupRun();
      setResult(setupResult);
      await refreshStatus();
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <SettingsSection title={t('settings.ai')} description={t('settings.aiTabBody')}>
      {actionError ? <SettingsStatus tone="error">{actionError}</SettingsStatus> : null}

      {status ? (
        <div className="settings-ai-status u-stack" style={{ marginBottom: '1rem' }}>
          <SettingsStatus tone={status.ready ? 'success' : 'warning'}>
            {status.ready ? `✓ ${t('settings.aiStatusReady')}` : status.statusLine}
          </SettingsStatus>
          <p className="muted" style={{ margin: '0.35rem 0 0' }}>
            {t('settings.aiUsableAccounts', { count: status.usableAccountCount })}
          </p>
          {status.detailLine ? (
            <p className="muted" style={{ margin: '0.25rem 0 0' }}>
              {status.detailLine}
            </p>
          ) : null}
        </div>
      ) : null}

      {result ? (
        <div className="settings-ai-result u-stack" style={{ marginBottom: '1rem' }}>
          <SettingsStatus
            tone={
              result.outcome === 'ready'
                ? 'success'
                : result.outcome === 'action_required'
                  ? 'warning'
                  : 'error'
            }
          >
            {result.title}
          </SettingsStatus>
          <p className="muted" style={{ margin: 0 }}>
            {result.message}
          </p>
          {result.action === 'login' ? (
            <SettingsStatus tone="warning">{t('settings.aiNeedGoogleLogin')}</SettingsStatus>
          ) : null}
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
          {t('settings.aiManageGoogleAccounts')}
        </Button>
        {result?.action === 'login' || result?.action === 'add_account' ? (
          <Button
            variant="secondary"
            onClick={() => {
              navigate('/accounts');
            }}
          >
            {result.action === 'login' ? t('settings.aiLogin') : t('settings.aiManageGoogleAccounts')}
          </Button>
        ) : null}
        {result?.outcome === 'failed' ? (
          <>
            <Button variant="secondary" disabled={busy} onClick={() => { void runAutoSetup(); }}>
              {t('settings.aiRetryFix')}
            </Button>
          </>
        ) : null}
      </div>

      {result && result.outcome === 'failed' ? (
        <SettingsDisclosure
          title={t('settings.aiDetails')}
          defaultOpen
        >
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
      </SettingsSection>

      <SettingsSection
        title={t('settings.primaryProviderSection')}
        description={t('settings.primaryProviderSectionHelp')}
      >
        <PrimaryTranslationProviderPanel />
      </SettingsSection>

      <SettingsSection
        title={t('settings.projectPrimaryProviderSection')}
        description={t('settings.projectPrimaryProviderSectionHelp')}
      >
        <ProjectPrimaryProviderPanel />
      </SettingsSection>

      <SettingsSection
        title={t('settings.aiBrowserAccountsSection')}
        description={t('settings.aiBrowserAccountsSectionHelp')}
      >
        <Button
          variant="secondary"
          onClick={() => {
            navigate('/accounts');
          }}
        >
          {t('settings.aiBrowserAccountsManageLink')}
        </Button>
      </SettingsSection>

      <SettingsSection
        title={t('settings.preferNotebookPackSection')}
        description={t('settings.preferNotebookPackSectionHelp')}
      >
        <PreferNotebookPackToggle />
      </SettingsSection>
    </>
  );
}
