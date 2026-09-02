import { useCallback, useEffect, useState } from 'react';
import {
  TRANSLATION_AI_PROVIDER_IDS,
  type TranslationAiProviderId,
} from '@shared/constants/translation-ai-providers';
import { AI_PROVIDER_IDS } from '@shared/constants/ai-provider';
import { useT } from '../../i18n';
import { useUiShellStore } from '../../stores/ui-shell-store';
import { SettingsRow } from './SettingsRow';
import { SettingsStatus } from './SettingsStatus';
import { useSettingsFeedback } from './useSettingsFeedback';

const GLOBAL_VALUE = '__global__';

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

export function ProjectPrimaryProviderPanel() {
  const t = useT();
  const { showSaved } = useSettingsFeedback();
  const projectId = useUiShellStore((s) => s.currentProjectId);
  const projectName = useUiShellStore((s) => s.currentProjectName);
  const [selection, setSelection] = useState<string>(GLOBAL_VALUE);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!projectId) {
      setSelection(GLOBAL_VALUE);
      return;
    }
    const settings = await window.khepreeNovelAI.projects.getTranslatePackSettings(projectId);
    if (settings.useGlobalPrimary || !settings.primaryProviderId) {
      setSelection(GLOBAL_VALUE);
    } else {
      setSelection(settings.primaryProviderId);
    }
    setError(null);
  }, [projectId]);

  useEffect(() => {
    void refresh().catch((err: unknown) => {
      setError(err instanceof Error ? err.message : String(err));
    });
  }, [refresh]);

  const onChange = async (value: string) => {
    if (!projectId || busy || value === selection) return;
    setBusy(true);
    setError(null);
    try {
      if (value === GLOBAL_VALUE) {
        await window.khepreeNovelAI.projects.setPrimaryProvider({
          projectId,
          useGlobalPrimary: true,
        });
      } else {
        await window.khepreeNovelAI.projects.setPrimaryProvider({
          projectId,
          useGlobalPrimary: false,
          primaryProviderId: value,
        });
      }
      setSelection(value);
      showSaved(t('settings.projectPrimaryProviderSaved'));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  if (!projectId) {
    return (
      <SettingsStatus tone="warn">{t('settings.projectPrimaryProviderNoProject')}</SettingsStatus>
    );
  }

  return (
    <>
      {error ? <SettingsStatus tone="error">{error}</SettingsStatus> : null}
      <SettingsRow
        label={t('settings.projectPrimaryProviderLabel')}
        description={t('settings.projectPrimaryProviderHelp', {
          project: projectName ?? projectId,
        })}
        control={
          <select
            className="settings-select"
            value={selection}
            disabled={busy}
            onChange={(e) => {
              void onChange(e.target.value);
            }}
          >
            <option value={GLOBAL_VALUE}>{t('settings.projectPrimaryProviderGlobal')}</option>
            {TRANSLATION_AI_PROVIDER_IDS.map((id) => (
              <option key={id} value={id}>
                {t(primaryLabelKey(id))}
              </option>
            ))}
          </select>
        }
      />
    </>
  );
}
