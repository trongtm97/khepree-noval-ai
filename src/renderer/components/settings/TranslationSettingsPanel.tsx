import { useCallback, useEffect, useState } from 'react';
import type { EditorFontPreset } from '../../stores/translation-workspace-store';
import { useTranslationWorkspaceStore } from '../../stores/translation-workspace-store';
import { useT } from '../../i18n';
import { Button, SegmentedControl, Select, Switch } from '../ui';
import { SettingsGroup } from './SettingsGroup';
import { SettingsRow } from './SettingsRow';
import { SettingsSection } from './SettingsSection';
import { SettingsStatus } from './SettingsStatus';
import {
  automationModeFromGlobalMax,
  CUSTOM_CONCURRENT_JOB_OPTIONS,
  customConcurrentValue,
  RECOMMENDED_TRANSLATION_SCHEDULER_PATCH,
  type TranslationAutomationMode,
} from './translation-automation';
import { useSettingsFeedback } from './useSettingsFeedback';

type GlobalMaxMode = 'AUTO' | number;

interface SchedulerSettingsState {
  globalMaxMode: GlobalMaxMode;
  perProjectMax: number;
  perProviderMax: number;
  maxConcurrent: number;
  parallelTranslationWaves: boolean;
  parallelWavesWarning: string;
}

export function TranslationSettingsPanel(props: {
  onLoadError: (msg: string | null) => void;
}) {
  const t = useT();
  const { showSaved } = useSettingsFeedback();
  const [state, setState] = useState<SchedulerSettingsState | null>(null);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);

  const autoAdvanceAfterTranslate = useTranslationWorkspaceStore((s) => s.autoAdvanceAfterTranslate);
  const setAutoAdvanceAfterTranslate = useTranslationWorkspaceStore(
    (s) => s.setAutoAdvanceAfterTranslate,
  );
  const editorFontPreset = useTranslationWorkspaceStore((s) => s.editorFontPreset);
  const setEditorFontPreset = useTranslationWorkspaceStore((s) => s.setEditorFontPreset);

  const refresh = useCallback(async () => {
    const s = await window.novelTrans.jobs.schedulerStatus();
    setState({
      globalMaxMode: s.globalMaxMode,
      perProjectMax: s.perProjectMax,
      perProviderMax: s.perProviderMax,
      maxConcurrent: s.maxConcurrent,
      parallelTranslationWaves: s.parallelTranslationWaves,
      parallelWavesWarning: s.parallelWavesWarning,
    });
    props.onLoadError(null);
  }, [props]);

  useEffect(() => {
    void refresh().catch((err: unknown) => {
      props.onLoadError(err instanceof Error ? err.message : String(err));
    });
  }, [refresh, props]);

  useEffect(() => {
    const onFocus = () => {
      void refresh().catch(() => undefined);
    };
    window.addEventListener('focus', onFocus);
    return () => {
      window.removeEventListener('focus', onFocus);
    };
  }, [refresh]);

  if (!state) return null;

  const mode = automationModeFromGlobalMax(state.globalMaxMode);
  const customConcurrent = customConcurrentValue(state.globalMaxMode, state.maxConcurrent);

  const saveScheduler = async (
    patch: {
      globalMaxWorkers?: GlobalMaxMode;
      perProjectMax?: number;
      perProviderMax?: number;
      parallelTranslationWaves?: boolean;
    },
    successMessage?: string,
  ) => {
    setSaving(true);
    try {
      const next = await window.novelTrans.jobs.updateSchedulerSettings(patch);
      setState({
        globalMaxMode: next.globalMaxMode,
        perProjectMax: next.perProjectMax,
        perProviderMax: next.perProviderMax,
        maxConcurrent: next.maxConcurrent,
        parallelTranslationWaves: next.parallelTranslationWaves,
        parallelWavesWarning: next.parallelWavesWarning,
      });
      props.onLoadError(null);
      showSaved(successMessage ?? t('settings.saved'));
    } catch (err: unknown) {
      props.onLoadError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const applyRecommended = async () => {
    setResetting(true);
    try {
      await saveScheduler(
        RECOMMENDED_TRANSLATION_SCHEDULER_PATCH,
        t('settings.translationRecommendedApplied'),
      );
    } finally {
      setResetting(false);
    }
  };

  const setMode = (next: TranslationAutomationMode) => {
    if (next === mode) return;
    if (next === 'AUTO') {
      void saveScheduler({ globalMaxWorkers: 'AUTO' });
      return;
    }
    void saveScheduler({ globalMaxWorkers: customConcurrent });
  };

  return (
    <>
      <SettingsSection
        title={t('settings.translationAutomationTitle')}
        description={t('settings.translationAutomationBody')}
      >
        <fieldset className="settings-mode-fieldset">
          <legend className="settings-mode-fieldset__legend">{t('settings.translationModeLabel')}</legend>
          <div className="settings-mode-cards">
            <label
              className={`settings-mode-card${mode === 'AUTO' ? ' is-active' : ''}`}
            >
              <input
                type="radio"
                name="translation-automation-mode"
                checked={mode === 'AUTO'}
                disabled={saving || resetting}
                onChange={() => {
                  setMode('AUTO');
                }}
              />
              <span className="settings-mode-card__title">
                {t('settings.translationModeAutoTitle')}
              </span>
              <span className="settings-mode-card__desc muted">
                {t('settings.translationModeAutoBody')}
              </span>
            </label>
            <label
              className={`settings-mode-card${mode === 'CUSTOM' ? ' is-active' : ''}`}
            >
              <input
                type="radio"
                name="translation-automation-mode"
                checked={mode === 'CUSTOM'}
                disabled={saving || resetting}
                onChange={() => {
                  setMode('CUSTOM');
                }}
              />
              <span className="settings-mode-card__title">
                {t('settings.translationModeCustomTitle')}
              </span>
            </label>
          </div>
        </fieldset>

        {mode === 'AUTO' ? (
          <SettingsGroup>
            <SettingsStatus tone="info" live="polite">
              {t('settings.translationAutoSummary', { n: state.maxConcurrent })}
            </SettingsStatus>
            <div className="btn-row">
              <Button
                variant="secondary"
                disabled={saving || resetting}
                onClick={() => {
                  void applyRecommended();
                }}
              >
                {t('settings.translationOptimize')}
              </Button>
            </div>
          </SettingsGroup>
        ) : (
          <SettingsGroup>
            <SettingsRow
              label={t('settings.translationConcurrentJobs')}
              description={t('settings.translationConcurrentJobsHelp')}
              control={
                <Select
                  value={String(customConcurrent)}
                  aria-label={t('settings.translationConcurrentJobs')}
                  disabled={saving || resetting}
                  onChange={(event) => {
                    const n = Number.parseInt(event.target.value, 10);
                    void saveScheduler({ globalMaxWorkers: n });
                  }}
                >
                  {CUSTOM_CONCURRENT_JOB_OPTIONS.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </Select>
              }
            />

          </SettingsGroup>
        )}

        <div className="btn-row" style={{ marginTop: '0.75rem' }}>
          <Button
            variant="secondary"
            disabled={saving || resetting}
            onClick={() => {
              void applyRecommended();
            }}
          >
            {t('settings.translationResetRecommended')}
          </Button>
        </div>
      </SettingsSection>

      <SettingsSection title={t('settings.translationEditorSection')}>
        <SettingsGroup>
          <SettingsRow
            label={t('translation.autoAdvanceAfterTranslate')}
            control={
              <Switch
                checked={autoAdvanceAfterTranslate}
                label={t('translation.autoAdvanceAfterTranslate')}
                onChange={(checked) => {
                  setAutoAdvanceAfterTranslate(checked);
                  showSaved(t('settings.saved'));
                }}
              />
            }
          />
          <SettingsRow
            label={t('translation.editorFontSize')}
            description={t('settings.translationEditorFontHelp')}
            control={
              <SegmentedControl
                aria-label={t('translation.editorFontSize')}
                value={editorFontPreset}
                options={(
                  ['sm', 'md', 'lg'] as const satisfies readonly EditorFontPreset[]
                ).map((preset) => ({
                  value: preset,
                  label: t(`translation.editorFontPreset.${preset}`),
                }))}
                onChange={(preset) => {
                  setEditorFontPreset(preset);
                  showSaved(t('settings.saved'));
                }}
              />
            }
          />
        </SettingsGroup>
      </SettingsSection>
    </>
  );
}
