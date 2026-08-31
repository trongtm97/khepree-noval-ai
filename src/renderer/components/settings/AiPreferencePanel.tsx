import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { AiPreference } from '@shared/constants/ai-preference';
import { AI_PREFERENCES } from '@shared/constants/ai-preference';
import type { AiProviderRoutingResponseSchema } from '@shared/schemas/ai-provider';
import type { z } from 'zod';
import { useT } from '../../i18n';
import { Button } from '../ui';
import { SettingsGroup } from './SettingsGroup';
import { SettingsStatus } from './SettingsStatus';
import { useSettingsFeedback } from './useSettingsFeedback';

type RoutingConfig = z.infer<typeof AiProviderRoutingResponseSchema>;

function preferenceLabelKey(preference: AiPreference): string {
  switch (preference) {
    case 'AUTO':
      return 'settings.aiPreferenceAuto';
    case 'GEMINI':
      return 'settings.aiPreferenceGemini';
    case 'CHATGPT':
      return 'settings.aiPreferenceChatGpt';
    case 'META_AI':
      return 'settings.aiPreferenceMetaAi';
    default:
      return 'settings.aiPreferenceAuto';
  }
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

export function AiPreferencePanel() {
  const t = useT();
  const navigate = useNavigate();
  const { showSaved } = useSettingsFeedback();
  const [routing, setRouting] = useState<RoutingConfig | null>(null);
  const [fallbackEnabled, setFallbackEnabled] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const [list, route] = await Promise.all([
      window.novelTrans.aiProviders.list(),
      window.novelTrans.aiProviders.getRouting(),
    ]);
    setRouting(route);
    setFallbackEnabled(list.fallbackEnabled);
    setError(null);
  }, []);

  useEffect(() => {
    void refresh().catch((err: unknown) => {
      setError(err instanceof Error ? err.message : String(err));
    });
  }, [refresh]);

  const savePreference = async (next: AiPreference) => {
    if (!routing || next === routing.aiPreference || busy) return;
    setBusy(true);
    setError(null);
    try {
      await window.novelTrans.aiProviders.setPreference({ preference: next });
      await refresh();
      showSaved(t('settings.aiPreferenceSaved'));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const toggleFallback = async (enabled: boolean) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await window.novelTrans.aiProviders.setFallback({ enabled });
      setFallbackEnabled(enabled);
      await refresh();
      showSaved(t('settings.aiPreferenceSaved'));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const checkAll = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await window.novelTrans.aiProviders.checkAll();
      showSaved(result.message);
      await refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const current = routing?.aiPreference ?? 'AUTO';

  return (
    <SettingsGroup>
      <fieldset className="settings-ai-preference" disabled={busy}>
        <legend className="settings-ai-preference__legend">{t('settings.aiMethodLabel')}</legend>
        {AI_PREFERENCES.map((pref) => (
          <label key={pref} className="settings-ai-preference__option">
            <input
              type="radio"
              name="ai-preference"
              value={pref}
              checked={current === pref}
              onChange={() => {
                void savePreference(pref);
              }}
            />
            <span>
              {t(preferenceLabelKey(pref))}
              {pref === 'AUTO' ? (
                <span className="muted u-text-sm"> — {t('settings.aiPreferenceRecommended')}</span>
              ) : null}
            </span>
          </label>
        ))}
      </fieldset>

      {routing?.providerHealth?.length ? (
        <ul className="settings-ai-health-list" aria-label={t('settings.aiProviderHealthLabel')}>
          {routing.providerHealth.map((row) => (
            <li key={row.preference}>
              <span>{t(healthLabelKey(row.preference))}</span>
              <span className={row.ok ? 'settings-ai-health-ok' : 'settings-ai-health-bad'}>
                {row.ok ? '✓' : '—'}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      <label className="settings-ai-fallback" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <input
          type="checkbox"
          checked={fallbackEnabled}
          disabled={busy}
          onChange={(event) => {
            void toggleFallback(event.target.checked);
          }}
        />
        {t('settings.aiFallbackAuto')}
      </label>

      <div className="btn-row">
        <Button variant="secondary" disabled={busy} onClick={() => { void checkAll(); }}>
          {t('settings.aiCheckAll')}
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
      </div>

      {error ? <SettingsStatus tone="error">{error}</SettingsStatus> : null}
    </SettingsGroup>
  );
}
