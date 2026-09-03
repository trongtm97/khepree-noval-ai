import { useCallback, useEffect, useState } from 'react';
import type { SystemHealthResult } from '@shared/schemas/system-health';
import { useNavigate } from 'react-router-dom';
import { useT } from '../../i18n';
import { Button } from '../ui';
import { SettingsDisclosure } from './SettingsDisclosure';
import { SettingsStatus } from './SettingsStatus';

export function SystemHealthPanel() {
  const t = useT();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<SystemHealthResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const health = await window.khepreeNovelAI.diagnostics.runSystemHealth();
      setResult(health);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void run().catch(() => undefined);
  }, [run]);

  const ctaForStep = (id: SystemHealthResult['steps'][number]['id']) => {
    switch (id) {
      case 'export':
      case 'backup':
        return { label: t('settings.advancedOpenStorage'), action: () => { navigate('/settings?tab=storage'); } };
      case 'ai':
        return { label: t('settings.advancedOpenAi'), action: () => { navigate('/settings?tab=ai'); } };
      default:
        return null;
    }
  };

  return (
    <div className="u-stack">
      {error ? <SettingsStatus tone="error">{error}</SettingsStatus> : null}
      <div className="btn-row">
        <Button variant="primary" disabled={busy} onClick={() => { void run(); }}>
          {busy ? t('settings.systemHealthRunning') : t('settings.systemHealthRun')}
        </Button>
      </div>
      {result ? (
        <>
          <SettingsStatus tone={result.ok ? 'success' : 'warn'}>{result.title}</SettingsStatus>
          <p className="muted" style={{ margin: 0 }}>{result.message}</p>
          <SettingsDisclosure title={t('settings.aiDetails')} defaultOpen={!result.ok}>
            <ul style={{ margin: 0, paddingLeft: '1.25rem' }}>
              {result.steps.map((step) => {
                const cta = !step.ok ? ctaForStep(step.id) : null;
                return (
                  <li key={step.id} style={{ marginBottom: '0.35rem' }}>
                    {step.ok ? '✓' : '✗'} {step.message}
                    {cta ? (
                      <>
                        {' '}
                        <button
                          type="button"
                          className="link-button"
                          onClick={cta.action}
                        >
                          {cta.label}
                        </button>
                      </>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </SettingsDisclosure>
        </>
      ) : null}
    </div>
  );
}
