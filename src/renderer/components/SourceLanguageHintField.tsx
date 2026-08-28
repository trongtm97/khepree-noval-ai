import { useState } from 'react';
import type { LanguageProfileDto } from '@shared/schemas/language-profile';
import { LanguagePicker } from './LanguagePicker';
import { Button } from './ui';
import { useT } from '../i18n';

export function SourceLanguageHintField({
  languages,
  hint,
  onHintChange,
}: {
  languages: LanguageProfileDto[];
  hint: string | null;
  onHintChange: (code: string | null) => void;
}) {
  const t = useT();
  const [advancedOpen, setAdvancedOpen] = useState(false);

  return (
    <div className="source-language-hint-field">
      <label className="muted" style={{ display: 'block', marginBottom: '0.35rem' }}>
        {t('createProjectWizard.sourceLanguage')}
      </label>
      <p className="muted" style={{ margin: '0 0 0.5rem' }}>
        {t('createProjectWizard.sourceAutoHelp')}
      </p>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => {
          setAdvancedOpen((v) => !v);
        }}
      >
        {advancedOpen
          ? t('createProjectWizard.sourceAdvancedHide')
          : t('createProjectWizard.sourceAdvancedShow')}
      </Button>
      {advancedOpen ? (
        <div style={{ marginTop: '0.5rem' }}>
          <label className="muted" style={{ display: 'block', marginBottom: '0.35rem' }}>
            {t('createProjectWizard.sourceHintLabel')}
          </label>
          <LanguagePicker
            value={hint ?? ''}
            placeholder={t('createProjectWizard.sourceHintNone')}
            aria-label={t('createProjectWizard.sourceHintLabel')}
            languages={languages}
            onChange={(code) => {
              onHintChange(code || null);
            }}
          />
          <p className="muted" style={{ marginTop: '0.35rem' }}>
            {t('createProjectWizard.sourceHintHelp')}
          </p>
          {hint ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                onHintChange(null);
              }}
            >
              {t('createProjectWizard.sourceHintClear')}
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
