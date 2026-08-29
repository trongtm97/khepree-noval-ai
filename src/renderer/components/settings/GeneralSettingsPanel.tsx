import { useState } from 'react';
import { useThemeStore, type ThemeMode } from '../../stores/theme-store';
import { useUiShellStore } from '../../stores/ui-shell-store';
import { useT } from '../../i18n';
import { Button } from '../ui';
import { SegmentedControl } from '../ui/SegmentedControl';
import { SettingsGroup } from './SettingsGroup';
import { SettingsRow } from './SettingsRow';
import { SettingsSection } from './SettingsSection';
import { useSettingsFeedback } from './useSettingsFeedback';

export function GeneralSettingsPanel() {
  const t = useT();
  const { showSaved, showInfo } = useSettingsFeedback();
  const mode = useThemeStore((s) => s.mode);
  const setMode = useThemeStore((s) => s.setMode);
  const density = useUiShellStore((s) => s.density);
  const setDensity = useUiShellStore((s) => s.setDensity);
  const setShowAdvancedTools = useUiShellStore((s) => s.setShowAdvancedTools);
  const setShowParagraphIds = useUiShellStore((s) => s.setShowParagraphIds);
  const [applyingRecommended, setApplyingRecommended] = useState(false);

  const handleThemeChange = (next: ThemeMode) => {
    setMode(next);
    showSaved(t('settings.saved'));
  };

  const handleDensityChange = (next: 'comfortable' | 'compact') => {
    setDensity(next);
    showSaved(t('settings.saved'));
  };

  const applyRecommended = async () => {
    setApplyingRecommended(true);
    try {
      setMode('system');
      setDensity('comfortable');
      setShowAdvancedTools(false);
      setShowParagraphIds(false);
      await window.novelTrans.jobs.updateSchedulerSettings({
        globalMaxWorkers: 'AUTO',
      });
      showInfo(t('settings.recommendedApplied'));
    } catch {
      showInfo(t('settings.recommendedPartial'));
    } finally {
      setApplyingRecommended(false);
    }
  };

  return (
    <>
      <SettingsSection
        title={t('settings.recommendedTitle')}
        description={t('settings.recommendedBody')}
      >
        <Button
          variant="secondary"
          disabled={applyingRecommended}
          onClick={() => {
            void applyRecommended();
          }}
        >
          {t('settings.recommendedApply')}
        </Button>
      </SettingsSection>

      <SettingsSection title={t('settings.appearanceSection')}>
        <SettingsGroup>
          <SettingsRow
            label={t('settings.theme')}
            description={t('settings.themeHelp')}
            control={
              <SegmentedControl
                aria-label={t('settings.theme')}
                value={mode}
                options={[
                  { value: 'system', label: t('settings.themeSystem') },
                  { value: 'light', label: t('settings.themeLight') },
                  { value: 'dark', label: t('settings.themeDark') },
                ]}
                onChange={handleThemeChange}
              />
            }
          />
          <SettingsRow
            label={t('settings.density')}
            description={t('settings.densityHelp')}
            control={
              <SegmentedControl
                aria-label={t('settings.density')}
                value={density}
                options={[
                  { value: 'comfortable', label: t('settings.densityComfortable') },
                  { value: 'compact', label: t('settings.densityCompact') },
                ]}
                onChange={handleDensityChange}
              />
            }
          />
        </SettingsGroup>
      </SettingsSection>
    </>
  );
}
