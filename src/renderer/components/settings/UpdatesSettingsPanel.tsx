import { useNavigate } from 'react-router-dom';
import { useT } from '../../i18n';
import { formatReleaseNotesForDisplay, useUpdateStatus } from '../../hooks/useUpdateStatus';
import { Button } from '../ui';
import { SettingsGroup } from './SettingsGroup';
import { SettingsRow } from './SettingsRow';
import { SettingsSection } from './SettingsSection';
import { SettingsStatus } from './SettingsStatus';

function phaseLabel(t: ReturnType<typeof useT>, phase: string): string {
  switch (phase) {
    case 'checking':
      return t('updates.phaseChecking');
    case 'downloading':
      return t('updates.phaseDownloading');
    case 'downloaded':
      return t('updates.phaseDownloaded');
    case 'installing':
      return t('updates.phaseInstalling');
    case 'up-to-date':
      return t('updates.phaseUpToDate');
    case 'available':
      return t('updates.phaseAvailable');
    case 'error':
      return t('updates.phaseError');
    case 'unavailable':
      return t('updates.phaseUnavailable');
    default:
      return t('updates.phaseIdle');
  }
}

export function UpdatesSettingsPanel() {
  const t = useT();
  const navigate = useNavigate();
  const { status, loading, checkNow, installAndRestart, postpone } = useUpdateStatus();

  const busy =
    loading || status?.phase === 'checking' || status?.phase === 'downloading' || status?.phase === 'installing';
  const canCheck = status?.canCheck ?? !busy;
  const releaseNotes = formatReleaseNotesForDisplay(status?.releaseNotes ?? null);

  return (
    <SettingsSection
      title={t('settings.updatesTitle')}
      description={t('settings.updatesSectionHelp')}
    >
      <SettingsGroup>
        <SettingsRow
          label={t('settings.currentVersionLabel')}
          description={
            status
              ? t('settings.currentVersion', { version: status.currentVersion })
              : t('settings.currentVersionLoading')
          }
          control={<span aria-hidden />}
        />
        <SettingsRow
          label={t('updates.releaseChannel')}
          description={status?.releaseChannel ?? 'stable'}
          control={<span aria-hidden />}
        />
        <SettingsRow
          label={t('updates.lastChecked')}
          description={
            status?.lastCheckedAt
              ? new Date(status.lastCheckedAt).toLocaleString()
              : t('updates.neverChecked')
          }
          control={<span aria-hidden />}
        />
        <SettingsRow
          label={t('updates.statusLabel')}
          description={status ? phaseLabel(t, status.phase) : t('updates.phaseIdle')}
          control={<span aria-hidden />}
        />
        {status?.latestVersion && status.latestVersion !== status.currentVersion ? (
          <SettingsRow
            label={t('updates.latestVersionLabel')}
            description={status.latestVersion}
            control={<span aria-hidden />}
          />
        ) : null}
      </SettingsGroup>

      {status?.mandatoryUpdate ? (
        <SettingsStatus tone="warn">{t('updates.mandatoryNotice')}</SettingsStatus>
      ) : null}

      {status?.errorMessage ? (
        <SettingsStatus tone="error">{status.errorMessage}</SettingsStatus>
      ) : null}

      {status?.jobsRunning != null && status.jobsRunning > 0 ? (
        <SettingsStatus tone="warn">
          {t('updates.jobsRunningWarning', { count: status.jobsRunning })}
        </SettingsStatus>
      ) : null}

      {status?.phase === 'downloading' && status.downloadProgress != null ? (
        <div
          className="settings-progress"
          role="progressbar"
          aria-valuenow={status.downloadProgress}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={t('updates.downloadProgressLabel')}
        >
          <div className="settings-progress__bar" style={{ width: `${status.downloadProgress}%` }} />
          <span className="muted">{t('updates.downloadProgress', { percent: status.downloadProgress })}</span>
        </div>
      ) : null}

      {releaseNotes ? (
        <div className="settings-release-notes" aria-label={t('updates.releaseNotesLabel')}>
          <strong>{t('updates.releaseNotesLabel')}</strong>
          <pre className="settings-release-notes__body">{releaseNotes}</pre>
        </div>
      ) : null}

      <div className="btn-row">
        <Button
          variant="secondary"
          disabled={!canCheck}
          aria-label={t('settings.checkUpdates')}
          onClick={() => {
            void checkNow();
          }}
        >
          {busy ? t('updates.checking') : t('settings.checkUpdates')}
        </Button>
        {status?.phase === 'downloaded' ? (
          <Button
            variant="primary"
            disabled={!status.canInstall}
            aria-label={t('updates.restartAndUpdate')}
            onClick={() => {
              void installAndRestart().then((result) => {
                if (!result.ok && result.reason === 'jobs_running') {
                  navigate('/jobs');
                }
              });
            }}
          >
            {t('updates.restartAndUpdate')}
          </Button>
        ) : null}
        {status?.latestVersion && !status.mandatoryUpdate && status.phase !== 'downloaded' ? (
          <Button
            variant="ghost"
            aria-label={t('updates.later')}
            onClick={() => {
              void postpone();
            }}
          >
            {t('updates.later')}
          </Button>
        ) : null}
      </div>

      {status?.manualDownloadUrl && (status.phase === 'error' || status.phase === 'unavailable') ? (
        <p className="muted">
          <a href={status.manualDownloadUrl} target="_blank" rel="noreferrer">
            {t('updates.manualDownload')}
          </a>
        </p>
      ) : null}
    </SettingsSection>
  );
}
