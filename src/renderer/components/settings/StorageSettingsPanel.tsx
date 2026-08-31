import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { AutoBackupConfig } from '@shared/schemas/portability';
import type { StorageHealthResult } from '@shared/schemas/portability';
import {
  DEFAULT_RETENTION_DAILY,
  DEFAULT_RETENTION_MONTHLY,
  DEFAULT_RETENTION_WEEKLY,
} from '@shared/constants/portability';
import { useT } from '../../i18n';
import { Button, Input, Switch } from '../ui';
import { confirmDangerous } from '../../utils/confirm-dangerous';
import { formatRelativeDate } from '../../utils/format-relative-date';
import { SettingsDisclosure } from './SettingsDisclosure';
import { SettingsSection } from './SettingsSection';
import { SettingsStatus } from './SettingsStatus';
import { StoragePathRow } from './StoragePathRow';
import { useSettingsFeedback } from './useSettingsFeedback';

type RestorePreview = {
  kind: string;
  projectTitle: string | null;
  compatible: boolean;
  warnings: string[];
  requiresOverwrite: boolean;
  backupDate: string;
};

export function StorageSettingsPanel() {
  const t = useT();
  const navigate = useNavigate();
  const { showSaved } = useSettingsFeedback();

  const [exportDirectory, setExportDirectory] = useState<string | null>(null);
  const [exportConfigured, setExportConfigured] = useState(false);
  const [backupDirectory, setBackupDirectory] = useState('');
  const [backupCustom, setBackupCustom] = useState(false);
  const [autoBackup, setAutoBackup] = useState<AutoBackupConfig | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [health, setHealth] = useState<StorageHealthResult | null>(null);
  const [restorePath, setRestorePath] = useState<string | null>(null);
  const [restorePreview, setRestorePreview] = useState<RestorePreview | null>(null);

  const refresh = useCallback(async () => {
    const [exportInfo, backupInfo, backupCfg] = await Promise.all([
      window.novelTrans.portability.getDefaultExportDirectory(),
      window.novelTrans.portability.getBackupDirectory(),
      window.novelTrans.portability.getAutoBackupConfig(),
    ]);
    setExportDirectory(exportInfo.directory);
    setExportConfigured(exportInfo.isConfigured);
    setBackupDirectory(backupInfo.directory);
    setBackupCustom(backupInfo.isCustom);
    setAutoBackup(backupCfg);
    setError(null);
  }, []);

  useEffect(() => {
    void refresh().catch((err: unknown) => {
      setError(err instanceof Error ? err.message : String(err));
    });
  }, [refresh]);

  const lastBackupLabel = () => {
    if (!autoBackup?.lastRunAt) return t('settings.storageLastBackupNever');
    const rel = formatRelativeDate(autoBackup.lastRunAt);
    return t(rel.key, rel.params);
  };

  const pickExportDirectory = async () => {
    setBusy(true);
    setError(null);
    try {
      const pick = await window.novelTrans.portability.selectExportDirectory();
      if (pick.canceled || !pick.directory) return;
      const next = await window.novelTrans.portability.setDefaultExportDirectory({
        directory: pick.directory,
      });
      setExportDirectory(next.directory);
      setExportConfigured(next.isConfigured);
      showSaved(t('exportDirectory.defaultSaved', { path: next.directory ?? '' }));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('exportDirectory.saveFailed'));
    } finally {
      setBusy(false);
    }
  };

  const setupStorageRoot = async () => {
    setBusy(true);
    setError(null);
    try {
      const pick = await window.novelTrans.portability.selectExportDirectory();
      if (pick.canceled || !pick.directory) return;
      const result = await window.novelTrans.portability.setupStorageRoot({
        root: pick.directory,
      });
      setExportDirectory(result.exportDirectory);
      setExportConfigured(true);
      setBackupDirectory(result.backupDirectory);
      setBackupCustom(true);
      showSaved(t('settings.storageRootSetupOk', { root: result.root }));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('settings.storageRootSetupFailed'));
    } finally {
      setBusy(false);
    }
  };

  const openExportDirectory = async () => {
    setBusy(true);
    try {
      await window.novelTrans.portability.openDefaultExportDirectory();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('exportDirectory.openFailed'));
    } finally {
      setBusy(false);
    }
  };

  const setAutoBackupEnabled = async (enabled: boolean) => {
    if (!autoBackup) return;
    setBusy(true);
    try {
      const next = await window.novelTrans.portability.setAutoBackupConfig({
        enabled,
        intervalHours: autoBackup.intervalHours,
        retentionDaily: autoBackup.retentionDaily,
        retentionWeekly: autoBackup.retentionWeekly,
        retentionMonthly: autoBackup.retentionMonthly,
      });
      setAutoBackup(next);
      showSaved(t('settings.saved'));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('portability.autoBackupSaveFailed'));
    } finally {
      setBusy(false);
    }
  };

  const saveRetention = async (patch: Partial<AutoBackupConfig>) => {
    if (!autoBackup) return;
    setBusy(true);
    try {
      const next = await window.novelTrans.portability.setAutoBackupConfig({
        enabled: autoBackup.enabled,
        intervalHours: autoBackup.intervalHours,
        retentionDaily: patch.retentionDaily ?? autoBackup.retentionDaily,
        retentionWeekly: patch.retentionWeekly ?? autoBackup.retentionWeekly,
        retentionMonthly: patch.retentionMonthly ?? autoBackup.retentionMonthly,
      });
      setAutoBackup(next);
      showSaved(t('portability.autoBackupSaved'));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('portability.autoBackupSaveFailed'));
    } finally {
      setBusy(false);
    }
  };

  const backupNow = async () => {
    setBusy(true);
    setError(null);
    try {
      await window.novelTrans.portability.backupNow();
      const cfg = await window.novelTrans.portability.getAutoBackupConfig();
      setAutoBackup(cfg);
      showSaved(t('settings.storageBackupNowOk'));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('settings.storageBackupNowFailed'));
    } finally {
      setBusy(false);
    }
  };

  const pickBackupDirectory = async () => {
    setBusy(true);
    try {
      const pick = await window.novelTrans.portability.selectBackupDirectory();
      if (pick.canceled || !pick.directory) return;
      const next = await window.novelTrans.portability.setBackupDirectory({
        directory: pick.directory,
      });
      setBackupDirectory(next.directory);
      setBackupCustom(next.isCustom);
      showSaved(t('settings.storageBackupDirSaved'));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('settings.storageBackupDirFailed'));
    } finally {
      setBusy(false);
    }
  };

  const resetBackupDirectory = async () => {
    setBusy(true);
    try {
      const next = await window.novelTrans.portability.setBackupDirectory({ directory: null });
      setBackupDirectory(next.directory);
      setBackupCustom(next.isCustom);
      showSaved(t('settings.storageBackupDirReset'));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('settings.storageBackupDirFailed'));
    } finally {
      setBusy(false);
    }
  };

  const checkStorageHealth = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await window.novelTrans.portability.checkStorageHealth();
      setHealth(result);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('settings.storageHealthFailed'));
    } finally {
      setBusy(false);
    }
  };

  const pickRestoreFile = async () => {
    setBusy(true);
    setRestorePreview(null);
    try {
      const pick = await window.novelTrans.portability.selectBackupPath();
      if (pick.canceled || !pick.filePath) return;
      setRestorePath(pick.filePath);
      const preview = await window.novelTrans.portability.previewRestore({
        archivePath: pick.filePath,
      });
      setRestorePreview({
        kind: preview.manifest.kind,
        projectTitle: preview.summary.projectTitle,
        compatible: preview.compatible,
        warnings: preview.warnings,
        requiresOverwrite: preview.requiresOverwrite,
        backupDate: preview.summary.backupDate,
      });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('portability.restoreFailed'));
    } finally {
      setBusy(false);
    }
  };

  const confirmRestore = async () => {
    if (!restorePath || !restorePreview) return;
    if (!restorePreview.compatible) {
      setError(t('portability.restoreIncompatible'));
      return;
    }
    if (!confirmDangerous(t('settings.storageRestoreConfirm'))) return;
    setBusy(true);
    try {
      const result = await window.novelTrans.portability.restoreBackup({
        archivePath: restorePath,
        confirmOverwrite: restorePreview.requiresOverwrite,
      });
      showSaved(t('portability.restoreOk', { message: result.message }));
      setRestorePath(null);
      setRestorePreview(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('portability.restoreFailed'));
    } finally {
      setBusy(false);
    }
  };

  const openAppDataFolder = async () => {
    setBusy(true);
    try {
      await window.novelTrans.openFolder('root');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('settings.storageOpenAppDataFailed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {error ? <SettingsStatus tone="error">{error}</SettingsStatus> : null}

      <SettingsSection
        title={t('exportDirectory.sectionTitle')}
        description={t('settings.storageExportHelp')}
      >
        {!exportConfigured ? (
          <div className="btn-row" style={{ marginBottom: '0.75rem' }}>
            <Button variant="primary" disabled={busy} onClick={() => { void setupStorageRoot(); }}>
              {t('settings.storageSetupRoot')}
            </Button>
          </div>
        ) : null}
        <StoragePathRow
          path={exportDirectory}
          notConfiguredLabel={t('exportDirectory.notConfigured')}
          changeLabel={t('settings.storageChangePath')}
          openLabel={t('exportDirectory.openFolder')}
          busy={busy}
          onChange={() => { void pickExportDirectory(); }}
          onOpen={exportConfigured ? () => { void openExportDirectory(); } : undefined}
        />
        <p className="muted" style={{ marginTop: '0.75rem' }}>
          {t('settings.storageProjectOverrideHint')}
        </p>
        <Button
          variant="secondary"
          disabled={busy}
          onClick={() => {
            navigate('/projects');
          }}
        >
          {t('settings.storageManageAtProject')}
        </Button>
      </SettingsSection>

      <SettingsSection title={t('settings.storageAutoBackupTitle')}>
        {autoBackup ? (
          <>
            <SettingsRowSwitch
              label={t('settings.storageAutoBackupTitle')}
              checked={autoBackup.enabled}
              disabled={busy}
              onChange={(enabled) => { void setAutoBackupEnabled(enabled); }}
            />
            <p className="muted" style={{ margin: '0.5rem 0' }}>
              {t('settings.storageLastBackup', { time: lastBackupLabel() })}
            </p>
            <p className="muted">{t('settings.storageRetentionSummary')}</p>
            <div className="btn-row" style={{ marginTop: '0.75rem' }}>
              <Button variant="primary" disabled={busy} onClick={() => { void backupNow(); }}>
                {t('settings.storageBackupNow')}
              </Button>
              <Button variant="secondary" disabled={busy} onClick={() => { void checkStorageHealth(); }}>
                {t('settings.storageHealthCheck')}
              </Button>
            </div>
            {health ? (
              <div style={{ marginTop: '0.75rem' }}>
                <SettingsStatus tone={health.ok ? 'success' : 'warn'}>
                  {health.title}
                </SettingsStatus>
                <p className="muted" style={{ margin: '0.35rem 0 0' }}>{health.message}</p>
              </div>
            ) : null}

            <SettingsDisclosure
              title={t('settings.storageBackupAdvanced')}
              description={t('settings.storageRetentionAdvancedHelp')}
            >
              <div className="form-row" style={{ flexWrap: 'wrap', gap: '0.75rem' }}>
                <label>
                  {t('settings.storageRetentionDaily')}
                  <Input
                    type="number"
                    min={1}
                    value={autoBackup.retentionDaily}
                    disabled={busy}
                    onChange={(event) => {
                      const retentionDaily = Number(event.target.value);
                      setAutoBackup({ ...autoBackup, retentionDaily });
                    }}
                    onBlur={() => {
                      void saveRetention({});
                    }}
                  />
                </label>
                <label>
                  {t('settings.storageRetentionWeekly')}
                  <Input
                    type="number"
                    min={1}
                    value={autoBackup.retentionWeekly}
                    disabled={busy}
                    onChange={(event) => {
                      const retentionWeekly = Number(event.target.value);
                      setAutoBackup({ ...autoBackup, retentionWeekly });
                    }}
                    onBlur={() => {
                      void saveRetention({});
                    }}
                  />
                </label>
                <label>
                  {t('settings.storageRetentionMonthly')}
                  <Input
                    type="number"
                    min={1}
                    value={autoBackup.retentionMonthly}
                    disabled={busy}
                    onChange={(event) => {
                      const retentionMonthly = Number(event.target.value);
                      setAutoBackup({ ...autoBackup, retentionMonthly });
                    }}
                    onBlur={() => {
                      void saveRetention({});
                    }}
                  />
                </label>
              </div>
              <p className="muted u-text-sm">
                {t('settings.storageRetentionDefaults', {
                  daily: DEFAULT_RETENTION_DAILY,
                  weekly: DEFAULT_RETENTION_WEEKLY,
                  monthly: DEFAULT_RETENTION_MONTHLY,
                })}
              </p>

              <div style={{ marginTop: '1rem' }}>
                <p className="muted">{t('settings.storageBackupDirHelp')}</p>
                <StoragePathRow
                  path={backupDirectory}
                  notConfiguredLabel={t('settings.storageBackupDirDefault')}
                  changeLabel={t('settings.storageBackupDirChange')}
                  openLabel={t('exportDirectory.openFolder')}
                  busy={busy}
                  onChange={() => { void pickBackupDirectory(); }}
                />
                {backupCustom ? (
                  <Button
                    variant="secondary"
                    disabled={busy}
                    style={{ marginTop: '0.5rem' }}
                    onClick={() => { void resetBackupDirectory(); }}
                  >
                    {t('settings.storageBackupDirReset')}
                  </Button>
                ) : null}
              </div>
            </SettingsDisclosure>
          </>
        ) : null}
      </SettingsSection>

      <SettingsSection title={t('settings.storageAppDataTitle')}>
        <p className="muted">{t('settings.storageAppDataBody')}</p>
        <Button variant="secondary" disabled={busy} onClick={() => { void openAppDataFolder(); }}>
          {t('settings.storageOpenAppData')}
        </Button>
      </SettingsSection>

      <SettingsDisclosure title={t('settings.storageRestoreSection')} defaultOpen={false}>
        <p className="muted">{t('portability.restoreHint')}</p>
        <div className="btn-row">
          <Button variant="secondary" disabled={busy} onClick={() => { void pickRestoreFile(); }}>
            {t('settings.storageRestorePick')}
          </Button>
          {restorePreview ? (
            <Button variant="primary" disabled={busy} onClick={() => { void confirmRestore(); }}>
              {t('settings.storageRestoreConfirmAction')}
            </Button>
          ) : null}
        </div>
        {restorePreview ? (
          <div className="muted u-text-sm" style={{ marginTop: '0.75rem' }}>
            <p>{t('portability.restorePreviewKind', { kind: restorePreview.kind })}</p>
            {restorePreview.projectTitle ? (
              <p>{t('portability.restorePreviewProject', { title: restorePreview.projectTitle })}</p>
            ) : null}
            <p>{t('portability.restorePreviewDate', { date: restorePreview.backupDate })}</p>
            {!restorePreview.compatible ? (
              <SettingsStatus tone="error">{t('portability.restoreIncompatible')}</SettingsStatus>
            ) : null}
            {restorePreview.warnings.length > 0 ? (
              <p>{t('portability.restoreWarnings', { warnings: restorePreview.warnings.join('; ') })}</p>
            ) : null}
          </div>
        ) : null}
      </SettingsDisclosure>
    </>
  );
}

function SettingsRowSwitch({
  label,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <Switch
      checked={checked}
      label={label}
      disabled={disabled}
      onChange={onChange}
    />
  );
}
