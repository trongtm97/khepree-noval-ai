import { useCallback, useEffect, useState } from 'react';
import { useT } from '../../i18n';
import { useUiShellStore } from '../../stores/ui-shell-store';
import { SettingsRow } from './SettingsRow';
import { SettingsStatus } from './SettingsStatus';
import { useSettingsFeedback } from './useSettingsFeedback';

export function PreferNotebookPackToggle() {
  const t = useT();
  const { showSaved } = useSettingsFeedback();
  const projectId = useUiShellStore((s) => s.currentProjectId);
  const projectName = useUiShellStore((s) => s.currentProjectName);
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!projectId) {
      setEnabled(false);
      return;
    }
    const settings = await window.khepreeNovelAI.projects.getTranslatePackSettings(projectId);
    setEnabled(settings.preferNotebookPack);
    setError(null);
  }, [projectId]);

  useEffect(() => {
    void refresh().catch((err: unknown) => {
      setError(err instanceof Error ? err.message : String(err));
    });
  }, [refresh]);

  const onToggle = async (next: boolean) => {
    if (!projectId || busy) return;
    setBusy(true);
    setError(null);
    try {
      await window.khepreeNovelAI.projects.setPreferNotebookPack({
        projectId,
        preferNotebookPack: next,
      });
      setEnabled(next);
      showSaved(t('settings.preferNotebookPackSaved'));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  if (!projectId) {
    return (
      <SettingsStatus tone="warn">{t('settings.preferNotebookPackNoProject')}</SettingsStatus>
    );
  }

  return (
    <>
      {error ? <SettingsStatus tone="error">{error}</SettingsStatus> : null}
      <SettingsRow
        label={t('settings.preferNotebookPackLabel')}
        description={t('settings.preferNotebookPackHelp', { project: projectName ?? projectId })}
        control={
          <label className="settings-toggle">
            <input
              type="checkbox"
              checked={enabled}
              disabled={busy}
              onChange={(e) => {
                void onToggle(e.target.checked);
              }}
            />
            <span>
              {enabled ? t('settings.preferNotebookPackOn') : t('settings.preferNotebookPackOff')}
            </span>
          </label>
        }
      />
    </>
  );
}
