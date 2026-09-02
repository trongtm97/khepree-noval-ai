import { useCallback, useEffect, useState } from 'react';
import { useT } from '../../i18n';
import { Select, Switch } from '../ui';
import { SettingsGroup } from './SettingsGroup';
import { SettingsRow } from './SettingsRow';
import { SettingsSection } from './SettingsSection';
import { SettingsStatus } from './SettingsStatus';
import { useSettingsFeedback } from './useSettingsFeedback';

interface SchedulerSettingsState {
  perProjectMax: number;
  perProviderMax: number;
  parallelTranslationWaves: boolean;
  parallelWavesWarning: string;
}

export function AdvancedParallelSettingsPanel() {
  const t = useT();
  const { showSaved } = useSettingsFeedback();
  const [state, setState] = useState<SchedulerSettingsState | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const s = await window.khepreeNovelAI.jobs.schedulerStatus();
    setState({
      perProjectMax: s.perProjectMax,
      perProviderMax: s.perProviderMax,
      parallelTranslationWaves: s.parallelTranslationWaves,
      parallelWavesWarning: s.parallelWavesWarning,
    });
  }, []);

  useEffect(() => {
    void refresh().catch((err: unknown) => {
      setError(err instanceof Error ? err.message : String(err));
    });
  }, [refresh]);

  const save = async (patch: {
    perProjectMax?: number;
    perProviderMax?: number;
    parallelTranslationWaves?: boolean;
  }) => {
    setSaving(true);
    try {
      const next = await window.khepreeNovelAI.jobs.updateSchedulerSettings(patch);
      setState({
        perProjectMax: next.perProjectMax,
        perProviderMax: next.perProviderMax,
        parallelTranslationWaves: next.parallelTranslationWaves,
        parallelWavesWarning: next.parallelWavesWarning,
      });
      showSaved(t('settings.saved'));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  if (!state) return null;

  return (
    <SettingsSection
      title={t('settings.advancedParallelSection')}
      description={t('settings.advancedParallelHelp')}
    >
      {error ? <SettingsStatus tone="error">{error}</SettingsStatus> : null}
      <SettingsGroup>
        <SettingsRow
          label={t('settings.concurrencyPerProject')}
          control={
            <Select
              value={String(state.perProjectMax)}
              disabled={saving || !state.parallelTranslationWaves}
              aria-label={t('settings.concurrencyPerProject')}
              onChange={(event) => {
                void save({ perProjectMax: Number.parseInt(event.target.value, 10) });
              }}
            >
              {[1, 2, 3, 4].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </Select>
          }
        />
        <SettingsRow
          label={t('settings.concurrencyPerProvider')}
          control={
            <Select
              value={String(state.perProviderMax)}
              disabled={saving}
              aria-label={t('settings.concurrencyPerProvider')}
              onChange={(event) => {
                void save({ perProviderMax: Number.parseInt(event.target.value, 10) });
              }}
            >
              {[1, 2, 3, 4, 6, 8].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </Select>
          }
        />
        <SettingsRow
          label={t('settings.parallelWavesTitle')}
          description={t('settings.parallelWavesBody')}
          control={
            <Switch
              checked={state.parallelTranslationWaves}
              label={t('settings.parallelWavesTitle')}
              onChange={(checked) => {
                void save({ parallelTranslationWaves: checked });
              }}
            />
          }
        />
        {state.parallelTranslationWaves ? (
          <SettingsStatus tone="warn">
            {state.parallelWavesWarning || t('settings.parallelWavesWarning')}
          </SettingsStatus>
        ) : null}
      </SettingsGroup>
    </SettingsSection>
  );
}
