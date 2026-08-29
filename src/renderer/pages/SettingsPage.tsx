import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useT } from '../i18n';
import { friendlyError } from '../i18n/errors';
import { helpArticleForErrorCode } from '../features/help/content';
import { ErrorPanel, PageHeader, TabPanel } from '../components/ui';
import { HelpContextButton } from '../features/help/HelpContextButton';
import { AdvancedSettingsPanel } from '../components/settings/AdvancedSettingsPanel';
import { AiSettingsPanel } from '../components/settings/AiSettingsPanel';
import { StorageSettingsPanel } from '../components/settings/StorageSettingsPanel';
import { GeneralSettingsPanel } from '../components/settings/GeneralSettingsPanel';
import { LanguageSettingsPanel } from '../components/settings/LanguageSettingsPanel';
import { TranslationSettingsPanel } from '../components/settings/TranslationSettingsPanel';
import { SettingsNav } from '../components/settings/SettingsNav';
import {
  parseSettingsTab,
  settingsTabSearchParams,
  type SettingsTab,
} from '../components/settings/settings-tabs';

export function SettingsPage() {
  const t = useT();
  const [searchParams, setSearchParams] = useSearchParams();
  const [tab, setTab] = useState<SettingsTab>(() =>
    parseSettingsTab(searchParams.get('tab')),
  );
  const [tabLoadError, setTabLoadError] = useState<string | null>(null);

  useEffect(() => {
    setTab(parseSettingsTab(searchParams.get('tab')));
  }, [searchParams]);

  useEffect(() => {
    setTabLoadError(null);
  }, [tab]);

  const navItems = [
    { id: 'general' as const, label: t('settings.general') },
    { id: 'language' as const, label: t('settings.languageTabLabel') },
    { id: 'translation' as const, label: t('settings.translation') },
    { id: 'ai' as const, label: t('settings.ai') },
    { id: 'storage' as const, label: t('settings.storage') },
    { id: 'advanced' as const, label: t('settings.advanced') },
  ];

  const errInfo = tabLoadError ? friendlyError(tabLoadError) : null;

  return (
    <div className="settings-page">
      <PageHeader
        title={t('settings.title')}
        description={t('settings.subtitle')}
        actions={<HelpContextButton articleId="backup" />}
      />

      <div className="settings-workspace">
        <SettingsNav
          items={navItems}
          value={tab}
          onChange={(next) => {
            setTab(next);
            setSearchParams(settingsTabSearchParams(next));
          }}
        />

        <div className="settings-content">
          {errInfo && (tab === 'language' || tab === 'translation' || tab === 'ai') ? (
            <ErrorPanel
              title={errInfo.title}
              description={errInfo.description}
              technical={errInfo.technical}
              helpArticleId={helpArticleForErrorCode(errInfo.code)}
            />
          ) : null}

          <TabPanel active={tab === 'general'}>
            <GeneralSettingsPanel />
          </TabPanel>

          <TabPanel active={tab === 'language'}>
            <LanguageSettingsPanel onLoadError={setTabLoadError} />
          </TabPanel>

          <TabPanel active={tab === 'translation'}>
            <TranslationSettingsPanel onLoadError={setTabLoadError} />
          </TabPanel>

          <TabPanel active={tab === 'ai'}>
            <AiSettingsPanel onLoadError={setTabLoadError} />
          </TabPanel>

          <TabPanel active={tab === 'storage'}>
            <StorageSettingsPanel />
          </TabPanel>

          <TabPanel active={tab === 'advanced'}>
            <AdvancedSettingsPanel
              loadError={tabLoadError}
              onClearLoadError={() => {
                setTabLoadError(null);
              }}
            />
          </TabPanel>
        </div>
      </div>
    </div>
  );
}
