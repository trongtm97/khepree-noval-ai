import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { AiProviderDto } from '@shared/schemas/ai-provider';
import { AI_PROVIDER_IDS } from '@shared/constants/ai-provider';
import {
  TRANSLATION_AI_PROVIDER_IDS,
  type TranslationAiProviderId,
} from '@shared/constants/translation-ai-providers';
import { useT } from '../../i18n';
import { statusLabel } from '../../i18n/status';
import { Button } from '../ui';
import { SegmentedControl } from '../ui/SegmentedControl';
import { SettingsGroup } from './SettingsGroup';
import { SettingsRow } from './SettingsRow';
import { SettingsStatus } from './SettingsStatus';
import { useSettingsFeedback } from './useSettingsFeedback';
import {
  accountsRouteForProvider,
  providerKindFromTranslationProviderId,
} from '../../features/accounts/ai-account-view-model';

function primaryLabelKey(id: TranslationAiProviderId): string {
  switch (id) {
    case AI_PROVIDER_IDS.GEMINI_WEB_API:
      return 'settings.primaryProviderGeminiWeb';
    case AI_PROVIDER_IDS.PLAYWRIGHT_GEMINI:
      return 'settings.primaryProviderGeminiBrowser';
    case AI_PROVIDER_IDS.PLAYWRIGHT_CHATGPT:
      return 'settings.primaryProviderChatGpt';
    case AI_PROVIDER_IDS.PLAYWRIGHT_META_AI:
      return 'settings.primaryProviderMetaAi';
    default:
      return 'settings.primaryProviderGeminiWeb';
  }
}

function needsAccountsLink(id: TranslationAiProviderId): boolean {
  return (
    id === AI_PROVIDER_IDS.PLAYWRIGHT_GEMINI ||
    id === AI_PROVIDER_IDS.PLAYWRIGHT_CHATGPT ||
    id === AI_PROVIDER_IDS.PLAYWRIGHT_META_AI
  );
}

function accountsLinkForPrimary(id: TranslationAiProviderId): string {
  const kind = providerKindFromTranslationProviderId(id);
  return accountsRouteForProvider(kind);
}

export function PrimaryTranslationProviderPanel() {
  const t = useT();
  const navigate = useNavigate();
  const { showSaved } = useSettingsFeedback();
  const [providers, setProviders] = useState<AiProviderDto[]>([]);
  const [primaryId, setPrimaryId] = useState<TranslationAiProviderId>(
    AI_PROVIDER_IDS.GEMINI_WEB_API,
  );
  const [fallbackEnabled, setFallbackEnabled] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const [list, routing] = await Promise.all([
      window.novelTrans.aiProviders.list(),
      window.novelTrans.aiProviders.getRouting(),
    ]);
    setProviders(list.providers);
    setFallbackEnabled(list.fallbackEnabled);
    const resolved = routing.primaryProviderId;
    if (
      resolved &&
      (TRANSLATION_AI_PROVIDER_IDS as readonly string[]).includes(resolved)
    ) {
      setPrimaryId(resolved as TranslationAiProviderId);
    } else if (
      list.primaryProviderId &&
      (TRANSLATION_AI_PROVIDER_IDS as readonly string[]).includes(list.primaryProviderId)
    ) {
      setPrimaryId(list.primaryProviderId as TranslationAiProviderId);
    }
    setError(null);
  }, []);

  useEffect(() => {
    void refresh().catch((err: unknown) => {
      setError(err instanceof Error ? err.message : String(err));
    });
  }, [refresh]);

  const primaryProvider = useMemo(
    () => providers.find((p) => p.id === primaryId) ?? null,
    [providers, primaryId],
  );

  const segmentedOptions = useMemo(
    () =>
      TRANSLATION_AI_PROVIDER_IDS.map((id) => ({
        value: id,
        label: t(primaryLabelKey(id)),
      })),
    [t],
  );

  const savePrimary = async (next: TranslationAiProviderId) => {
    if (next === primaryId || busy) return;
    setBusy(true);
    setError(null);
    try {
      await window.novelTrans.aiProviders.setPrimary({ providerId: next });
      await refresh();
      setPrimaryId(next);
      showSaved(t('settings.primaryProviderSaved'));
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
      showSaved(t('settings.primaryProviderSaved'));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const checkPrimary = async () => {
    if (!primaryProvider || busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await window.novelTrans.aiProviders.check({
        providerId: primaryProvider.id,
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
        label={t('settings.primaryProviderLabel')}
        description={t('settings.primaryProviderHelp')}
        control={
          <SegmentedControl
            aria-label={t('settings.primaryProviderLabel')}
            value={primaryId}
            disabled={busy}
            options={segmentedOptions}
            onChange={(next) => {
              void savePrimary(next as TranslationAiProviderId);
            }}
          />
        }
      />

      <SettingsStatus tone="info">{t('settings.primaryProviderNotebookNote')}</SettingsStatus>

      {primaryProvider ? (
        <div className="muted u-text-sm">
          {t(primaryLabelKey(primaryId))}: {statusLabel(primaryProvider.status)}
          {!primaryProvider.enabled ? ` · ${t('settings.aiMethodOff')}` : ''}
        </div>
      ) : null}

      {needsAccountsLink(primaryId) ? (
        <Button
          variant="secondary"
          disabled={busy}
          onClick={() => {
            navigate(accountsLinkForPrimary(primaryId));
          }}
        >
          {t('settings.primaryProviderManageAccounts')}
        </Button>
      ) : null}

      <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
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
        <Button variant="secondary" disabled={busy || !primaryProvider} onClick={() => { void checkPrimary(); }}>
          {t('settings.primaryProviderCheck')}
        </Button>
      </div>

      {error ? <SettingsStatus tone="error">{error}</SettingsStatus> : null}
    </SettingsGroup>
  );
}
