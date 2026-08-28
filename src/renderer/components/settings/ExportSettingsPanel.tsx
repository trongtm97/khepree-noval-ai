import { useCallback, useEffect, useState } from 'react';
import { Button, Card, SectionHeader } from '../ui';
import { useT } from '../../i18n';

/** Global default export directory settings (Settings → Xuất dữ liệu). */
export function ExportSettingsPanel() {
  const t = useT();
  const [directory, setDirectory] = useState<string | null>(null);
  const [isConfigured, setIsConfigured] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const info = await window.novelTrans.portability.getDefaultExportDirectory();
    setDirectory(info.directory);
    setIsConfigured(info.isConfigured);
  }, []);

  useEffect(() => {
    void refresh().catch((err: unknown) => {
      setError(err instanceof Error ? err.message : t('errors.UNKNOWN.title'));
    });
  }, [refresh, t]);

  const pickDirectory = async () => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const pick = await window.novelTrans.portability.selectExportDirectory();
      if (pick.canceled || !pick.directory) return;
      const next = await window.novelTrans.portability.setDefaultExportDirectory({
        directory: pick.directory,
      });
      setDirectory(next.directory);
      setIsConfigured(next.isConfigured);
      setMessage(t('exportDirectory.defaultSaved', { path: next.directory ?? '' }));
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
      await window.novelTrans.portability.openDefaultExportDirectory();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('exportDirectory.openFailed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card as="section">
      <SectionHeader title={t('exportDirectory.sectionTitle')} />
      <p className="muted">{t('exportDirectory.sectionHelp')}</p>
      {error ? <p className="banner banner-error">{error}</p> : null}
      {message ? <p className="banner banner-success">{message}</p> : null}
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
    </Card>
  );
}
