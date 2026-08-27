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
  Input,
  ErrorPanel,
  Badge,
} from '../components/ui';
import { HelpContextButton } from '../features/help/HelpContextButton';

import { AiProvidersSettingsPanel } from '../components/settings/AiProvidersSettingsPanel';
import { AiDiagnosticsSettingsPanel } from '../components/settings/AiDiagnosticsSettingsPanel';

type SettingsTab =
  | 'appearance'
  | 'language'
  | 'googleAi'
  | 'aiProviders'
  | 'aiDiagnostics'
  | 'advanced';

const SETTINGS_TABS: SettingsTab[] = [
  'appearance',
  'language',
  'googleAi',
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
  const [tab, setTab] = useState<SettingsTab>(() =>
    parseSettingsTab(searchParams.get('tab')),
  );
  const [oauthConfigured, setOauthConfigured] = useState(false);
  const [clientIdHint, setClientIdHint] = useState<string | null>(null);
  const [redirectUri, setRedirectUri] = useState('http://127.0.0.1:18766');
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setTab(parseSettingsTab(searchParams.get('tab')));
  }, [searchParams]);

  useEffect(() => {
    void window.novelTrans.drive
      .oauthStatus()
      .then((result) => {
        setOauthConfigured(result.configured);
        setClientIdHint(result.clientIdHint);
        setRedirectUri(result.redirectUri);
      })
      .catch(() => {
        setOauthConfigured(false);
        setClientIdHint(null);
      });
  }, []);

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
          { id: 'googleAi', label: t('settings.googleAi') },
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

      <TabPanel active={tab === 'googleAi'}>
        <Card as="section" style={{ marginTop: '1rem' }}>
          <SectionHeader title={t('settings.oauthTitle')} />
          <p className="muted">{t('settings.oauthBody')}</p>
          <div className="btn-row" style={{ marginBottom: '0.75rem' }}>
            <Button
              variant="primary"
              onClick={() => {
                setError(null);
                void window.novelTrans
                  .openGuide('drive-oauth-setup')
                  .then(() => {
                    setMessage(t('settings.oauthGuideOpened'));
                  })
                  .catch((err: unknown) => {
                    setError(err instanceof Error ? err.message : t('errors.UNKNOWN.title'));
                  });
              }}
            >
              {t('settings.oauthOpenGuide')}
            </Button>
          </div>
          <p>
            <Badge tone={oauthConfigured ? 'success' : 'warning'}>
              {oauthConfigured
                ? t('settings.oauthConfigured')
                : t('settings.oauthNotConfigured')}
            </Badge>
            {clientIdHint ? (
              <span className="muted" style={{ marginLeft: '0.5rem' }}>
                {t('settings.oauthSavedHint', { hint: clientIdHint })}
              </span>
            ) : null}
          </p>
          <div className="oauth-setup" style={{ margin: '0.75rem 0 1rem' }}>
            <p style={{ margin: '0 0 0.35rem', fontWeight: 600 }}>{t('settings.oauthStepsTitle')}</p>
            <ol className="oauth-setup-steps muted">
              <li>{t('settings.oauthStepShort1')}</li>
              <li>{t('settings.oauthStepShort2')}</li>
              <li>
                {t('settings.oauthStepShort3')}{' '}
                <code>{redirectUri}</code>
              </li>
              <li>{t('settings.oauthStepShort4')}</li>
              <li>{t('settings.oauthStepShort5')}</li>
            </ol>
            <p className="muted" style={{ marginTop: '0.5rem' }}>
              {t('settings.oauthGuideHint')}
            </p>
          </div>
          <div className="toolbar" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
            <label>
              {t('settings.clientId')}
              <Input
                type="text"
                value={clientId}
                onChange={(event) => {
                  setClientId(event.target.value);
                }}
                placeholder={clientIdHint ?? 'xxxx.apps.googleusercontent.com'}
              />
            </label>
            <label>
              {t('settings.clientSecret')}
              <Input
                type="password"
                value={clientSecret}
                onChange={(event) => {
                  setClientSecret(event.target.value);
                }}
              />
            </label>
            <Button
              variant="primary"
              disabled={!clientId.trim()}
              onClick={() => {
                setError(null);
                setMessage(null);
                const idToSave = clientId.trim();
                if (!idToSave) {
                  setError(t('settings.clientIdRequired'));
                  return;
                }
                void window.novelTrans.drive
                  .setOAuthClient({
                    clientId: idToSave,
                    clientSecret: clientSecret || undefined,
                  })
                  .then(() => window.novelTrans.drive.oauthStatus())
                  .then((status) => {
                    setOauthConfigured(status.configured);
                    setClientIdHint(status.clientIdHint);
                    setRedirectUri(status.redirectUri);
                    setMessage(t('settings.oauthSaved'));
                    setClientSecret('');
                  })
                  .catch((err: unknown) => {
                    setError(err instanceof Error ? err.message : t('errors.UNKNOWN.title'));
                  });
              }}
            >
              {t('settings.saveOauth')}
            </Button>
          </div>
        </Card>
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
        <Card as="section" style={{ marginTop: '1rem' }}>
          <SectionHeader title={t('settings.backup')} />
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
                navigate('/export');
              }}
            >
              {t('settings.openExport')}
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
