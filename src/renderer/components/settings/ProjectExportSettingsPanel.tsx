import { useCallback, useEffect, useState } from 'react';
import { Button, Card, SectionHeader } from '../ui';
import { useT } from '../../i18n';

export interface ProjectExportSettingsPanelProps {
  projectId: string;
  projectTitle: string;
}

/** Per-project export directory override (Project → Xuất & sao lưu). */
export function ProjectExportSettingsPanel({
  projectId,
  projectTitle,
}: ProjectExportSettingsPanelProps) {
  const t = useT();
  const [useOverride, setUseOverride] = useState(false);
  const [projectDirectory, setProjectDirectory] = useState<string | null>(null);
  const [defaultDirectory, setDefaultDirectory] = useState<string | null>(null);
  const [resolvedDirectory, setResolvedDirectory] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const settings = await window.khepreeNovelAI.portability.getProjectExportSettings({ projectId });
    setUseOverride(settings.useProjectOverride);
    setProjectDirectory(settings.projectExportDirectory);
    setDefaultDirectory(settings.defaultExportDirectory);
    setResolvedDirectory(settings.resolvedDirectory);
  }, [projectId]);

  useEffect(() => {
    void refresh().catch((err: unknown) => {
      setError(err instanceof Error ? err.message : t('errors.UNKNOWN.title'));
    });
  }, [refresh, t]);

  const setOverrideMode = async (override: boolean) => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      if (!override) {
        await window.khepreeNovelAI.portability.setProjectExportDirectory({
          projectId,
          directory: null,
        });
      } else if (!projectDirectory) {
        const pick = await window.khepreeNovelAI.portability.selectExportDirectory();
        if (pick.canceled || !pick.directory) {
          return;
        }
        await window.khepreeNovelAI.portability.setProjectExportDirectory({
          projectId,
          directory: pick.directory,
        });
      }
      await refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('exportDirectory.saveFailed'));
    } finally {
      setBusy(false);
    }
  };

  const pickProjectDirectory = async () => {
    setBusy(true);
    setError(null);
    try {
      const pick = await window.khepreeNovelAI.portability.selectExportDirectory();
      if (pick.canceled || !pick.directory) return;
      await window.khepreeNovelAI.portability.setProjectExportDirectory({
        projectId,
        directory: pick.directory,
      });
      setUseOverride(true);
      await refresh();
      setMessage(t('exportDirectory.projectSaved', { path: pick.directory }));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('exportDirectory.saveFailed'));
    } finally {
      setBusy(false);
    }
  };

  const openResolved = async () => {
    setBusy(true);
    setError(null);
    try {
      await window.khepreeNovelAI.portability.openExportDirectory({ projectId });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('exportDirectory.openFailed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card as="section" style={{ marginTop: '1rem' }}>
      <SectionHeader title={t('exportDirectory.sectionTitle')} />
      <p className="muted">{t('exportDirectory.projectHelp')}</p>
      {error ? <p className="banner banner-error">{error}</p> : null}
      {message ? <p className="banner banner-success">{message}</p> : null}
      <fieldset className="export-directory-scope" disabled={busy}>
        <label>
          <input
            type="radio"
            name={`export-mode-${projectId}`}
            checked={!useOverride}
            onChange={() => void setOverrideMode(false)}
          />
          {t('exportDirectory.useDefault')}
          {defaultDirectory ? (
            <span className="muted export-directory-path"> {defaultDirectory}</span>
          ) : (
            <span className="muted"> ({t('exportDirectory.notConfigured')})</span>
          )}
        </label>
        <label>
          <input
            type="radio"
            name={`export-mode-${projectId}`}
            checked={useOverride}
            onChange={() => void setOverrideMode(true)}
          />
          {t('exportDirectory.useProjectOverride', { project: projectTitle })}
        </label>
      </fieldset>
      {useOverride ? (
        <p className="export-directory-path">{projectDirectory ?? t('exportDirectory.notConfigured')}</p>
      ) : null}
      {resolvedDirectory ? (
        <p className="muted">
          {t('exportDirectory.resolvedPath')}: {resolvedDirectory}
        </p>
      ) : null}
      <div className="btn-row">
        {useOverride ? (
          <Button variant="secondary" disabled={busy} onClick={() => void pickProjectDirectory()}>
            {t('exportDirectory.chooseFolder')}
          </Button>
        ) : null}
        {resolvedDirectory ? (
          <Button variant="secondary" disabled={busy} onClick={() => void openResolved()}>
            {t('exportDirectory.openFolder')}
          </Button>
        ) : null}
      </div>
    </Card>
  );
}
