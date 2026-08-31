import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { LanguageProfileDto } from '@shared/schemas/language-profile';
import type { DefaultTargetLanguageSettings } from '@shared/schemas/translation-settings';
import type { UiLocalePreference } from '@shared/types/ui-locale';
import {
  getLanguageProfile,
  isExperimentalTranslationLanguage,
} from '@shared/constants/language-profile';
import { useLocaleStore, useT } from '../../i18n';
import { LanguagePicker } from '../LanguagePicker';
import { UiLocalePicker } from '../UiLocalePicker';
import { SettingsGroup } from './SettingsGroup';
import { SettingsRow } from './SettingsRow';
import { SettingsSection } from './SettingsSection';
import { SettingsStatus } from './SettingsStatus';
import { useSettingsFeedback } from './useSettingsFeedback';

export function LanguageSettingsPanel(props: {
  onLoadError: (msg: string | null) => void;
}) {
  const t = useT();
  const { showSaved } = useSettingsFeedback();
  const preference = useLocaleStore((s) => s.preference);
  const setPreference = useLocaleStore((s) => s.setPreference);

  const [uiLocaleError, setUiLocaleError] = useState<string | null>(null);
  const [settings, setSettings] = useState<DefaultTargetLanguageSettings | null>(null);
  const [languages, setLanguages] = useState<LanguageProfileDto[]>([]);
  const [targetSaving, setTargetSaving] = useState(false);
  const [targetError, setTargetError] = useState<string | null>(null);

  useEffect(() => {
    void Promise.all([
      window.novelTrans.translationSettings.get(),
      window.novelTrans.languages.list(),
    ])
      .then(([next, langRes]) => {
        setSettings(next);
        setLanguages(langRes.languages);
        props.onLoadError(null);
      })
      .catch((err: unknown) => {
        props.onLoadError(err instanceof Error ? err.message : String(err));
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const targetCode = settings?.defaultTargetLanguage ?? '';

  const selectedTargetProfile = useMemo(
    () => (targetCode ? getLanguageProfile(targetCode) : null),
    [targetCode],
  );

  const showExperimental =
    Boolean(
      selectedTargetProfile &&
        isExperimentalTranslationLanguage(selectedTargetProfile) &&
        !settings?.invalidPersisted,
    ) || settings?.experimental === true;

  const handleUiLocaleChange = (next: UiLocalePreference) => {
    if (next === preference) return;
    setUiLocaleError(null);
    try {
      setPreference(next);
      showSaved(t('settings.saved'));
    } catch {
      setUiLocaleError(t('settings.uiLocaleChangeFailed'));
    }
  };

  const handleTargetChange = (code: string) => {
    if (!settings || !code || code === settings.defaultTargetLanguage || targetSaving) return;
    setTargetSaving(true);
    setTargetError(null);
    void window.novelTrans.translationSettings
      .setDefaultTarget({ defaultTargetLanguage: code })
      .then((next) => {
        setSettings(next);
        showSaved(t('settings.defaultTargetLanguageSaved'));
      })
      .catch((err: unknown) => {
        setTargetError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        setTargetSaving(false);
      });
  };

  return (
    <>
      <SettingsSection title={t('settings.uiLocaleSection')}>
        <SettingsGroup>
          <SettingsRow
            label={t('settings.uiLocaleLabel')}
            description={t('settings.uiLocaleHelp')}
            control={
              <UiLocalePicker
                value={preference}
                aria-label={t('settings.uiLocaleLabel')}
                disabled={targetSaving}
                onChange={handleUiLocaleChange}
              />
            }
          />
          {uiLocaleError ? <SettingsStatus tone="error">{uiLocaleError}</SettingsStatus> : null}
        </SettingsGroup>
      </SettingsSection>

      <SettingsSection title={t('settings.defaultTargetLanguageSection')}>
        {settings ? (
          <SettingsGroup>
            <SettingsRow
              label={t('settings.defaultTargetLanguageLabel')}
              description={t('settings.defaultTargetLanguageHelp')}
              control={
                <LanguagePicker
                  value={targetCode}
                  labelVariant="stacked"
                  aria-label={t('settings.defaultTargetLanguageLabel')}
                  languages={languages}
                  disabled={targetSaving}
                  onChange={handleTargetChange}
                />
              }
            />
            <SettingsStatus tone="info">
              {t('settings.defaultTargetExistingProjectsHelp')}
            </SettingsStatus>
            {settings.invalidPersisted ? (
              <SettingsStatus tone="warn">
                {t('settings.defaultTargetLanguageInvalid')}
              </SettingsStatus>
            ) : null}
            {showExperimental ? (
              <SettingsStatus tone="warn">
                {t('settings.defaultTargetLanguageExperimental')}
              </SettingsStatus>
            ) : null}
            {targetError ? <SettingsStatus tone="error">{targetError}</SettingsStatus> : null}
          </SettingsGroup>
        ) : null}
      </SettingsSection>

      <SettingsSection title={t('settings.sourceLanguageSection')}>
        <SettingsStatus tone="info" live="polite">
          ✓ {t('settings.sourceLanguageAuto')}
        </SettingsStatus>
        <p className="muted" style={{ margin: '0.5rem 0 0' }}>
          {t('settings.sourceLanguageHelp')}
        </p>
        <p style={{ margin: '0.75rem 0 0' }}>
          <Link to="/help/source-language-detection" className="ext-link">
            {t('settings.sourceLanguageLearnLink')}
          </Link>
        </p>
      </SettingsSection>
    </>
  );
}
