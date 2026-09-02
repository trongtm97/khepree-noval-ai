import { useCallback, useEffect, useState } from 'react';
import type { AiPreference } from '@shared/constants/ai-preference';
import { AI_PREFERENCES } from '@shared/constants/ai-preference';
import { useT } from '../../i18n';
import { Dialog } from '../ui';
import { useSettingsFeedback } from './useSettingsFeedback';

const GLOBAL_VALUE = '__global__';

function preferenceLabelKey(preference: AiPreference): string {
  switch (preference) {
    case 'AUTO':
      return 'settings.aiPreferenceAuto';
    case 'GEMINI':
      return 'settings.aiPreferenceGemini';
    case 'CHATGPT':
      return 'settings.aiPreferenceChatGpt';
    case 'META_AI':
      return 'settings.aiPreferenceMetaAi';
    default:
      return 'settings.aiPreferenceAuto';
  }
}

export interface ProjectAiPreferenceDialogProps {
  open: boolean;
  projectId: string;
  onClose: () => void;
}

export function ProjectAiPreferenceDialog({
  open,
  projectId,
  onClose,
}: ProjectAiPreferenceDialogProps) {
  const t = useT();
  const { showSaved } = useSettingsFeedback();
  const [selection, setSelection] = useState<string>(GLOBAL_VALUE);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const settings = await window.khepreeNovelAI.projects.getTranslatePackSettings(projectId);
    if (settings.useGlobalPreference || !settings.aiPreference) {
      setSelection(GLOBAL_VALUE);
    } else {
      setSelection(settings.aiPreference);
    }
    setError(null);
  }, [projectId]);

  useEffect(() => {
    if (!open) return;
    void refresh().catch((err: unknown) => {
      setError(err instanceof Error ? err.message : String(err));
    });
  }, [open, refresh]);

  const save = async (value: string) => {
    if (busy || value === selection) return;
    setBusy(true);
    setError(null);
    try {
      if (value === GLOBAL_VALUE) {
        await window.khepreeNovelAI.projects.setAiPreference({
          projectId,
          useGlobalPreference: true,
        });
      } else {
        await window.khepreeNovelAI.projects.setAiPreference({
          projectId,
          useGlobalPreference: false,
          aiPreference: value as AiPreference,
        });
      }
      setSelection(value);
      showSaved(t('settings.projectAiPreferenceSaved'));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;

  return (
    <Dialog
      open={open}
      title={t('settings.projectAiPreferenceTitle')}
      description={t('settings.projectAiPreferenceHelp')}
      confirmLabel={t('actions.close')}
      cancelLabel={t('actions.cancel')}
      busy={busy}
      onConfirm={onClose}
      onCancel={onClose}
    >
      <fieldset className="settings-ai-preference" disabled={busy}>
        <label className="settings-ai-preference__option">
          <input
            type="radio"
            name="project-ai-preference"
            value={GLOBAL_VALUE}
            checked={selection === GLOBAL_VALUE}
            onChange={() => {
              void save(GLOBAL_VALUE);
            }}
          />
          <span>{t('settings.projectAiPreferenceGlobal')}</span>
        </label>
        {AI_PREFERENCES.map((pref) => (
          <label key={pref} className="settings-ai-preference__option">
            <input
              type="radio"
              name="project-ai-preference"
              value={pref}
              checked={selection === pref}
              onChange={() => {
                void save(pref);
              }}
            />
            <span>{t(preferenceLabelKey(pref))}</span>
          </label>
        ))}
      </fieldset>
      {error ? <p className="settings-status settings-status--error">{error}</p> : null}
    </Dialog>
  );
}
