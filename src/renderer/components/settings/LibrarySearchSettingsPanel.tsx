import { useCallback, useEffect, useState } from 'react';
import type { LibrarySearchSettingsDto } from '@shared/schemas/library-search';
import { useT } from '../../i18n';
import { Switch } from '../ui';
import { SettingsSection } from './SettingsSection';
import { useSettingsFeedback } from './useSettingsFeedback';

export function LibrarySearchSettingsPanel() {
  const t = useT();
  const { showSaved } = useSettingsFeedback();
  const [settings, setSettings] = useState<LibrarySearchSettingsDto | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const next = await window.khepreeNovelAI.librarySearch.getSettings();
    setSettings(next);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const update = async (patch: Partial<LibrarySearchSettingsDto>) => {
    setBusy(true);
    try {
      const next = await window.khepreeNovelAI.librarySearch.updateSettings(patch);
      setSettings(next);
      showSaved(t('settings.saved'));
      if (patch.indexSourceText !== undefined || patch.indexTranslationText !== undefined) {
        void window.khepreeNovelAI.librarySearch.startReindex({ force: true });
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <SettingsSection title={t('librarySearch.settingsTitle')} description={t('librarySearch.settingsDesc')}>
      {settings && (
        <>
          <Switch
            label={t('librarySearch.indexSource')}
            checked={settings.indexSourceText}
            disabled={busy}
            onChange={(checked) => void update({ indexSourceText: checked })}
          />
          <Switch
            label={t('librarySearch.indexTranslation')}
            checked={settings.indexTranslationText}
            disabled={busy}
            onChange={(checked) => void update({ indexTranslationText: checked })}
          />
          <p className="settings-hint">{t('librarySearch.localOnly')}</p>
          {settings.lastFullReindexAt && (
            <p className="settings-hint">
              {t('librarySearch.lastReindex', { at: settings.lastFullReindexAt })}
            </p>
          )}
        </>
      )}
    </SettingsSection>
  );
}
