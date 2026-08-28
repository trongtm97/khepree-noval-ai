import { useEffect, useMemo, useState } from 'react';
import type { LanguageProfileDto } from '@shared/schemas/language-profile';
import type { DefaultTargetLanguageSettings } from '@shared/schemas/translation-settings';
import { getLanguageProfile } from '@shared/constants/language-profile';
import { useT } from '../../i18n';
import { LanguagePicker } from '../LanguagePicker';
import { Button, Card, SectionHeader } from '../ui';

export function TranslationSettingsPanel(props: {
  onMessage: (msg: string) => void;
  onError: (msg: string) => void;
}) {
  const t = useT();
  const [settings, setSettings] = useState<DefaultTargetLanguageSettings | null>(
    null,
  );
  const [languages, setLanguages] = useState<LanguageProfileDto[]>([]);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void Promise.all([
      window.novelTrans.translationSettings.get(),
      window.novelTrans.languages.list(),
    ])
      .then(([next, langRes]) => {
        setSettings(next);
        setDraft(next.defaultTargetLanguage);
        setLanguages(langRes.languages);
      })
      .catch((err: unknown) => {
        props.onError(err instanceof Error ? err.message : String(err));
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedProfile = useMemo(
    () => (draft ? getLanguageProfile(draft) : null),
    [draft],
  );

  const showExperimental =
    selectedProfile?.aiSupportTier === 'EXPERIMENTAL' &&
    !settings?.invalidPersisted;

  if (!settings) return null;

  const save = async () => {
    setSaving(true);
    try {
      const next = await window.novelTrans.translationSettings.setDefaultTarget({
        defaultTargetLanguage: draft,
      });
      setSettings(next);
      setDraft(next.defaultTargetLanguage);
      props.onMessage(t('settings.defaultTargetLanguageSaved'));
    } catch (err: unknown) {
      props.onError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const dirty = draft !== settings.defaultTargetLanguage;

  return (
    <Card as="section" style={{ marginTop: '1rem' }}>
      <SectionHeader title={t('settings.translation')} />
      <SectionHeader title={t('settings.defaultTargetLanguageSection')} />
      <label className="muted" style={{ display: 'block', marginBottom: '0.35rem' }}>
        {t('settings.defaultTargetLanguageLabel')}
      </label>
      <LanguagePicker
        value={draft}
        labelVariant="stacked"
        aria-label={t('settings.defaultTargetLanguageLabel')}
        languages={languages}
        onChange={setDraft}
      />
      <p className="muted" style={{ marginTop: '0.5rem' }}>
        {t('settings.defaultTargetLanguageHelp')}
      </p>
      {settings.invalidPersisted ? (
        <p className="banner banner-warn" style={{ marginTop: '0.75rem' }}>
          {t('settings.defaultTargetLanguageInvalid')}
        </p>
      ) : null}
      {showExperimental ? (
        <p className="banner banner-warn" style={{ marginTop: '0.75rem' }}>
          {t('settings.defaultTargetLanguageExperimental')}
        </p>
      ) : null}
      <div className="btn-row" style={{ marginTop: '0.75rem' }}>
        <Button
          variant="primary"
          disabled={saving || !dirty || !draft}
          onClick={() => {
            void save();
          }}
        >
          {t('actions.save')}
        </Button>
      </div>
    </Card>
  );
}
