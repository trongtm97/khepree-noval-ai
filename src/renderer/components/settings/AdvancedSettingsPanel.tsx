import { useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useUiShellStore } from '../../stores/ui-shell-store';
import { useT } from '../../i18n';
import { friendlyError } from '../../i18n/errors';
import { helpArticleForErrorCode } from '../../features/help/content';
import { Button, ErrorPanel, Switch } from '../ui';
import { AiDiagnosticsSettingsPanel } from './AiDiagnosticsSettingsPanel';
import { AiProvidersSettingsPanel } from './AiProvidersSettingsPanel';
import { AiWebApiManualConnectPanel } from './AiWebApiManualConnectPanel';
import { PreferNotebookPackToggle } from './PreferNotebookPackToggle';
import { SettingsDisclosure } from './SettingsDisclosure';
import { SettingsGroup } from './SettingsGroup';
import { SettingsRow } from './SettingsRow';
import { SettingsSection } from './SettingsSection';
import { SettingsStatus } from './SettingsStatus';
import { SystemHealthPanel } from './SystemHealthPanel';
import { useSettingsFeedback } from './useSettingsFeedback';

export function AdvancedSettingsPanel({
  loadError,
  onClearLoadError,
}: {
  loadError: string | null;
  onClearLoadError: () => void;
}) {
  const t = useT();
  const navigate = useNavigate();
  const { showSaved } = useSettingsFeedback();
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [appVersion, setAppVersion] = useState<string | null>(null);
  const showAdvancedTools = useUiShellStore((s) => s.showAdvancedTools);
  const setShowAdvancedTools = useUiShellStore((s) => s.setShowAdvancedTools);
  const showParagraphIds = useUiShellStore((s) => s.showParagraphIds);
  const setShowParagraphIds = useUiShellStore((s) => s.setShowParagraphIds);

  useEffect(() => {
    void window.khepreeNovelAI.getVersion().then((v) => {
      setAppVersion(v.version);
    });
  }, []);

  const errInfo = loadError ? friendlyError(loadError) : null;

  return (
    <>
      {errInfo ? (
        <ErrorPanel
          title={errInfo.title}
          description={errInfo.description}
          technical={errInfo.technical}
          helpArticleId={helpArticleForErrorCode(errInfo.code)}
        />
      ) : null}

      <SettingsSection
        title={t('settings.advancedUiSection')}
        description={t('settings.advancedUiSectionHelp')}
      >
        <SettingsGroup>
          <SettingsRow
            label={t('settings.showAdvancedTools')}
            description={t('settings.showAdvancedToolsHelp')}
            control={
              <Switch
                checked={showAdvancedTools}
                label={t('settings.showAdvancedTools')}
                onChange={(v) => {
                  setShowAdvancedTools(v);
                  showSaved(t('settings.saved'));
                }}
              />
            }
          />
          <SettingsRow
            label={t('settings.showParagraphIds')}
            description={t('settings.showParagraphIdsHelp')}
            control={
              <Switch
                checked={showParagraphIds}
                label={t('settings.showParagraphIds')}
                onChange={(v) => {
                  setShowParagraphIds(v);
                  showSaved(t('settings.saved'));
                }}
              />
            }
          />
        </SettingsGroup>
      </SettingsSection>

      <SettingsSection
        title={t('settings.advancedAiSection')}
        description={t('settings.advancedAiSectionHelp')}
      >
        <SettingsDisclosure title={t('settings.aiProvidersTitle')}>
          <AiProvidersSettingsPanel />
        </SettingsDisclosure>
        <SettingsDisclosure title={t('settings.advancedWebApiManualTitle')}>
          <AiWebApiManualConnectPanel />
        </SettingsDisclosure>
        <SettingsDisclosure title={t('settings.legacyExperimentalSection')}>
          <PreferNotebookPackToggle />
        </SettingsDisclosure>
      </SettingsSection>

      <SettingsSection
        title={t('settings.advancedDiagnosticsSection')}
        description={t('settings.advancedDiagnosticsHelp')}
      >
        <SystemHealthPanel />
        <div style={{ marginTop: '1.25rem' }}>
          <AiDiagnosticsSettingsPanel embedded />
        </div>
      </SettingsSection>

      <SettingsSection title={t('settings.advancedLogsSection')}>
        <Button
          variant="secondary"
          onClick={() => {
            void window.khepreeNovelAI.logs.openDir();
          }}
        >
          {t('settings.openLogs')}
        </Button>
        <SettingsDisclosure title={t('settings.aiDetails')} defaultOpen={false}>
          <div className="btn-row">
            <Button
              variant="secondary"
              onClick={() => {
                navigate('/diagnostics');
              }}
            >
              {t('settings.openDiagnostics')}
            </Button>
          </div>
        </SettingsDisclosure>
      </SettingsSection>

      <SettingsSection title={t('settings.updatesTitle')}>
        {updateError ? <SettingsStatus tone="error">{updateError}</SettingsStatus> : null}
        {appVersion ? (
          <p className="muted">{t('settings.currentVersion', { version: appVersion })}</p>
        ) : null}
        <Button
          variant="secondary"
          onClick={() => {
            onClearLoadError();
            setUpdateError(null);
            void window.khepreeNovelAI
              .checkForUpdates()
              .then((result) => {
                showSaved(`${result.providerLabel}: ${result.message}`);
              })
              .catch((err: unknown) => {
                setUpdateError(
                  err instanceof Error ? err.message : t('errors.UNKNOWN.title'),
                );
              });
          }}
        >
          {t('settings.checkUpdates')}
        </Button>
        <SettingsDisclosure title={t('settings.aiDetails')} defaultOpen={false}>
          <p className="muted">{t('settings.updatesBody')}</p>
        </SettingsDisclosure>
      </SettingsSection>

      <SettingsSection
        title={t('settings.advancedMaintenanceSection')}
        description={t('settings.advancedMaintenanceHelp')}
      >
        <div className="btn-row">
          <Button
            variant="secondary"
            onClick={() => {
              navigate('/learning');
            }}
          >
            {t('settings.openLearning')}
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              navigate('/export');
            }}
          >
            {t('portability.novelExport')}
          </Button>
        </div>
      </SettingsSection>
    </>
  );
}
