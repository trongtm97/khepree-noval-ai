import { useCallback, useEffect, useState } from 'react';
import { Button } from '../ui';
import { useT } from '../../i18n';
import { SettingsSection } from './SettingsSection';
import { SettingsStatus } from './SettingsStatus';
import { useSettingsFeedback } from './useSettingsFeedback';

/** Global default export directory settings (Settings → Lưu trữ). */
export function ExportSettingsPanel() {
  const t = useT();
  const { showSaved } = useSettingsFeedback();
  const [directory, setDirectory] = useState<string | null>(null);
  const [isConfigured, setIsConfigured] = useState(false);
  const [desktopNotify, setDesktopNotify] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const info = await window.khepreeNovelAI.portability.getDefaultExportDirectory();
    setDirectory(info.directory);
    setIsConfigured(info.isConfigured);
    const notify = await window.khepreeNovelAI.notify.getDesktopEnabled();
    setDesktopNotify(notify.enabled);
  }, []);

  useEffect(() => {
    void refresh().catch((err: unknown) => {
      setError(err instanceof Error ? err.message : t('errors.UNKNOWN.title'));
    });
  }, [refresh, t]);

  const pickDirectory = async () => {
    setBusy(true);
    setError(null);
    try {
      const pick = await window.khepreeNovelAI.portability.selectExportDirectory();
      if (pick.canceled || !pick.directory) return;
      const next = await window.khepreeNovelAI.portability.setDefaultExportDirectory({
        directory: pick.directory,
      });
      setDirectory(next.directory);
      setIsConfigured(next.isConfigured);
      showSaved(t('exportDirectory.defaultSaved', { path: next.directory ?? '' }));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('exportDirectory.saveFailed'));
    } finally {
      setBusy(false);
    }
  };

  const openDirectory = async () => {
    if (!directory) return;
    setBusy(true);
    setError(null);
    try {
      await window.khepreeNovelAI.portability.openDefaultExportDirectory();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('exportDirectory.openFailed'));
    } finally {
      setBusy(false);
    }
  };

  const toggleDesktopNotify = async (enabled: boolean) => {
    setBusy(true);
    setError(null);
    try {
      const next = await window.khepreeNovelAI.notify.setDesktopEnabled({ enabled });
      setDesktopNotify(next.enabled);
      showSaved(
        next.enabled
          ? t('exportDirectory.desktopNotifyOn')
          : t('exportDirectory.desktopNotifyOff'),
      );
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('errors.UNKNOWN.title'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <SettingsSection
      title={t('exportDirectory.sectionTitle')}
      description={t('exportDirectory.sectionHelp')}
    >
      {error ? <SettingsStatus tone="error">{error}</SettingsStatus> : null}
      <p>
        {isConfigured && directory
          ? directory
          : t('exportDirectory.notConfigured')}
      </p>
      <div className="btn-row">
        <Button variant="secondary" disabled={busy} onClick={() => void pickDirectory()}>
          {isConfigured ? t('exportDirectory.chooseFolder') : t('exportDirectory.chooseDefault')}
        </Button>
        {isConfigured && directory ? (
          <Button variant="secondary" disabled={busy} onClick={() => void openDirectory()}>
            {t('exportDirectory.openFolder')}
          </Button>
        ) : null}
      </div>
      <label
        style={{
          display: 'flex',
          gap: '0.5rem',
          alignItems: 'center',
          marginTop: '0.75rem',
        }}
      >
        <input
          type="checkbox"
          checked={desktopNotify}
          disabled={busy}
          onChange={(e) => void toggleDesktopNotify(e.target.checked)}
        />
        <span>{t('exportDirectory.desktopNotify')}</span>
      </label>
    </SettingsSection>
  );
}
