import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useThemeStore, type ThemeMode } from '../stores/theme-store';
import { useUiShellStore } from '../stores/ui-shell-store';
import { useT } from '../i18n';
import { friendlyError } from '../i18n/errors';
import { helpArticleForErrorCode } from '../features/help/content';
import {
  PageHeader,
  Button,
  Select,
  Tabs,
  TabPanel,
  Card,
  SectionHeader,
  ErrorPanel,
  Badge,
  Switch,
} from '../components/ui';
import { HelpContextButton } from '../features/help/HelpContextButton';

import { AiProvidersSettingsPanel } from '../components/settings/AiProvidersSettingsPanel';
import { AiDiagnosticsSettingsPanel } from '../components/settings/AiDiagnosticsSettingsPanel';
import { SchedulerConcurrencyPanel } from '../components/settings/SchedulerConcurrencyPanel';
import { TranslationSettingsPanel } from '../components/settings/TranslationSettingsPanel';
import { ExportSettingsPanel } from '../components/settings/ExportSettingsPanel';

type SettingsTab =
  | 'appearance'
  | 'language'
  | 'translation'
  | 'export'
  | 'aiProviders'
  | 'aiDiagnostics'
  | 'advanced';

const SETTINGS_TABS: SettingsTab[] = [
  'appearance',
  'language',
  'translation',
  'export',
  'aiProviders',
  'aiDiagnostics',
  'advanced',
];

function parseSettingsTab(raw: string | null): SettingsTab {
  if (raw && (SETTINGS_TABS as string[]).includes(raw)) {
    return raw as SettingsTab;
  }
  return 'appearance';
}

export function SettingsPage() {
  const t = useT();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const mode = useThemeStore((state) => state.mode);
  const setMode = useThemeStore((state) => state.setMode);
  const density = useUiShellStore((state) => state.density);
  const setDensity = useUiShellStore((state) => state.setDensity);
  const showAdvancedTools = useUiShellStore((state) => state.showAdvancedTools);
  const setShowAdvancedTools = useUiShellStore((state) => state.setShowAdvancedTools);
  const showParagraphIds = useUiShellStore((state) => state.showParagraphIds);
  const setShowParagraphIds = useUiShellStore((state) => state.setShowParagraphIds);
  const [tab, setTab] = useState<SettingsTab>(() =>
    parseSettingsTab(searchParams.get('tab')),
  );
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setTab(parseSettingsTab(searchParams.get('tab')));
  }, [searchParams]);

  const errInfo = error ? friendlyError(error) : null;

  return (
    <div>
      <PageHeader
        title={t('settings.title')}
        description={t('settings.subtitle')}
        actions={<HelpContextButton articleId="backup" />}
      />

      <Tabs
        items={[
          { id: 'appearance', label: t('settings.appearance') },
          { id: 'language', label: t('settings.language') },
          { id: 'translation', label: t('settings.translation') },
          { id: 'export', label: t('settings.exportData') },
          { id: 'aiProviders', label: t('settings.aiProviders') },
          { id: 'aiDiagnostics', label: t('settings.aiDiagnostics') },
          { id: 'advanced', label: t('settings.advanced') },
        ]}
        value={tab}
        onChange={(id) => {
          const next = id as SettingsTab;
          setTab(next);
          setSearchParams(next === 'appearance' ? {} : { tab: next });
        }}
      />

      {errInfo ? (
        <ErrorPanel
          title={errInfo.title}
          description={errInfo.description}
          technical={errInfo.technical}
          helpArticleId={helpArticleForErrorCode(errInfo.code)}
        />
      ) : null}
      {message ? (
        <div className="banner banner-info" style={{ marginTop: '0.75rem' }}>
          {message}
        </div>
      ) : null}

      <TabPanel active={tab === 'appearance'}>
        <Card as="section" style={{ marginTop: '1rem' }}>
          <SectionHeader title={t('settings.theme')} />
          <label className="muted" style={{ display: 'block', marginBottom: '0.35rem' }}>
            {t('settings.theme')}
          </label>
          <Select
            value={mode}
            aria-label={t('settings.theme')}
            onChange={(event) => {
              setMode(event.target.value as ThemeMode);
            }}
          >
            <option value="system">{t('settings.themeSystem')}</option>
            <option value="light">{t('settings.themeLight')}</option>
            <option value="dark">{t('settings.themeDark')}</option>
          </Select>

          <SectionHeader title={t('settings.density')} />
          <label className="muted" style={{ display: 'block', marginBottom: '0.35rem' }}>
            {t('settings.density')}
          </label>
          <Select
            value={density}
            aria-label={t('settings.density')}
            onChange={(event) => {
              setDensity(event.target.value === 'compact' ? 'compact' : 'comfortable');
            }}
          >
            <option value="comfortable">{t('settings.densityComfortable')}</option>
            <option value="compact">{t('settings.densityCompact')}</option>
          </Select>

          <SectionHeader title={t('settings.advancedUiSection')} />
          <div className="settings-toggle-row">
            <div>
              <strong>{t('settings.showAdvancedTools')}</strong>
              <p className="muted" style={{ margin: '0.25rem 0 0' }}>
                {t('settings.showAdvancedToolsHelp')}
              </p>
            </div>
            <Switch
              checked={showAdvancedTools}
              label={t('settings.showAdvancedTools')}
              onChange={setShowAdvancedTools}
            />
          </div>
          <div className="settings-toggle-row">
            <div>
              <strong>{t('settings.showParagraphIds')}</strong>
              <p className="muted" style={{ margin: '0.25rem 0 0' }}>
                {t('settings.showParagraphIdsHelp')}
              </p>
            </div>
            <Switch
              checked={showParagraphIds}
              label={t('settings.showParagraphIds')}
              onChange={setShowParagraphIds}
            />
          </div>
        </Card>
      </TabPanel>

      <TabPanel active={tab === 'language'}>
        <Card as="section" style={{ marginTop: '1rem' }}>
          <SectionHeader title={t('settings.language')} />
          <p style={{ margin: '0 0 0.5rem' }}>
            <Badge tone="accent">{t('settings.languageVi')}</Badge>
          </p>
          <p className="muted">{t('settings.languageNote')}</p>
        </Card>
      </TabPanel>

      <TabPanel active={tab === 'translation'}>
        <TranslationSettingsPanel onMessage={setMessage} onError={setError} />
      </TabPanel>

      <TabPanel active={tab === 'export'}>
        <ExportSettingsPanel />
      </TabPanel>

      <TabPanel active={tab === 'aiProviders'}>
        <AiProvidersSettingsPanel
          onMessage={setMessage}
          onError={setError}
        />
      </TabPanel>

      <TabPanel active={tab === 'aiDiagnostics'}>
        <AiDiagnosticsSettingsPanel
          onMessage={setMessage}
          onError={setError}
        />
      </TabPanel>

      <TabPanel active={tab === 'advanced'}>
        <SchedulerConcurrencyPanel onMessage={setMessage} onError={setError} />

        <Card as="section" style={{ marginTop: '1rem' }}>
          <SectionHeader title={t('settings.developerTools')} />
          <div className="btn-row">
            <Button
              variant="secondary"
              onClick={() => {
                navigate('/diagnostics');
              }}
            >
              {t('settings.openDiagnostics')}
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                navigate('/logs');
              }}
            >
              {t('settings.openLogs')}
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                navigate('/learning');
              }}
            >
              {t('settings.openLearning')}
            </Button>
          </div>
        </Card>

        <Card as="section" style={{ marginTop: '1rem' }}>
          <SectionHeader title={t('settings.backup')} />
          <div className="btn-row">
            <Button
              variant="secondary"
              onClick={() => {
                navigate('/export');
              }}
            >
              {t('settings.openExport')}
            </Button>
          </div>
        </Card>

        <Card as="section" style={{ marginTop: '1rem' }}>
          <SectionHeader title={t('settings.updatesTitle')} />
          <p className="muted">{t('settings.updatesBody')}</p>
          <Button
            variant="secondary"
            onClick={() => {
              setError(null);
              setMessage(null);
              void window.novelTrans
                .checkForUpdates()
                .then((result) => {
                  setMessage(`${result.providerLabel}: ${result.message}`);
                })
                .catch((err: unknown) => {
                  setError(err instanceof Error ? err.message : t('errors.UNKNOWN.title'));
                });
            }}
          >
            {t('settings.checkUpdates')}
          </Button>
        </Card>
      </TabPanel>
    </div>
  );
}
