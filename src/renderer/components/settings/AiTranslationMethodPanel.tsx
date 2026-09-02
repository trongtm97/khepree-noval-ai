import { useCallback, useEffect, useMemo, useState } from 'react';
import type { AiProviderDto } from '@shared/schemas/ai-provider';
import { AI_PROVIDER_IDS } from '@shared/constants/ai-provider';
import { useT } from '../../i18n';
import { statusLabel } from '../../i18n/status';
import { Button } from '../ui';
import { SegmentedControl } from '../ui/SegmentedControl';
import { SettingsGroup } from './SettingsGroup';
import { SettingsRow } from './SettingsRow';
import { SettingsStatus } from './SettingsStatus';
import {
  applyTranslationMethod,
  detectTranslationMethod,
  providerForMethod,
  type AiTranslationMethod,
} from './ai-translation-method';
import { useSettingsFeedback } from './useSettingsFeedback';

export function AiTranslationMethodPanel() {
  const t = useT();
  const { showSaved } = useSettingsFeedback();
  const [providers, setProviders] = useState<AiProviderDto[]>([]);
  const [mode, setMode] = useState<AiTranslationMethod>('auto');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const list = await window.khepreeNovelAI.aiProviders.list();
    setProviders(list.providers);
    setMode(detectTranslationMethod(list.providers));
    setError(null);
  }, []);

  useEffect(() => {
    void refresh().catch((err: unknown) => {
      setError(err instanceof Error ? err.message : String(err));
    });
  }, [refresh]);

  const activeProvider = useMemo(() => {
    if (mode === 'auto') {
      const ordered = [...providers]
        .filter(
          (p) =>
            p.enabled &&
            (p.id === AI_PROVIDER_IDS.GEMINI_WEB_API ||
              p.id === AI_PROVIDER_IDS.PLAYWRIGHT_GEMINI),
        )
        .sort((a, b) => a.priority - b.priority);
      return ordered[0] ?? null;
    }
    const id = providerForMethod(mode);
    return providers.find((p) => p.id === id) ?? null;
  }, [mode, providers]);

  const webApi = providers.find((p) => p.id === AI_PROVIDER_IDS.GEMINI_WEB_API);
  const playwright = providers.find((p) => p.id === AI_PROVIDER_IDS.PLAYWRIGHT_GEMINI);

  const saveMode = async (next: AiTranslationMethod) => {
    if (next === mode || busy) return;
    setBusy(true);
    setError(null);
    try {
      await applyTranslationMethod(next);
      await refresh();
      setMode(next);
      showSaved(t('settings.aiMethodSaved'));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const checkActive = async () => {
    if (!activeProvider || busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await window.khepreeNovelAI.aiProviders.check({
        providerId: activeProvider.id,
      });
      showSaved(result.message);
      await refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <SettingsGroup>
      <SettingsRow
        label={t('settings.aiMethodLabel')}
        description={t('settings.aiMethodHelp')}
        control={
          <SegmentedControl
            aria-label={t('settings.aiMethodLabel')}
            value={mode}
            disabled={busy}
            options={[
              { value: 'web_api', label: t('settings.aiMethodWebApi') },
              { value: 'playwright', label: t('settings.aiMethodPlaywright') },
              { value: 'auto', label: t('settings.aiMethodAuto') },
            ]}
            onChange={(next) => {
              void saveMode(next);
            }}
          />
        }
      />

      {mode === 'auto' ? (
        <SettingsStatus tone="info">{t('settings.aiMethodAutoHint')}</SettingsStatus>
      ) : null}

      <div className="muted u-text-sm" style={{ display: 'grid', gap: '0.35rem' }}>
        {webApi ? (
          <span>
            {t('settings.aiMethodWebApi')}: {statusLabel(webApi.status)}
            {!webApi.enabled ? ` · ${t('settings.aiMethodOff')}` : ''}
          </span>
        ) : null}
        {playwright ? (
          <span>
            {t('settings.aiMethodPlaywright')}: {statusLabel(playwright.status)}
            {!playwright.enabled ? ` · ${t('settings.aiMethodOff')}` : ''}
          </span>
        ) : null}
      </div>

      <div className="btn-row">
        <Button variant="secondary" disabled={busy || !activeProvider} onClick={() => { void checkActive(); }}>
          {t('settings.aiMethodCheckActive')}
        </Button>
      </div>

      {error ? <SettingsStatus tone="error">{error}</SettingsStatus> : null}
    </SettingsGroup>
  );
}
