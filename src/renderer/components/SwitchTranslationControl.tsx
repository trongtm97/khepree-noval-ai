import { useEffect, useId, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import {
  formatLanguagePickerStacked,
  getLanguageProfile,
} from '@shared/constants/language-profile';
import type { LanguageProfileDto } from '@shared/schemas/language-profile';
import { useT } from '../i18n';
import { LanguagePicker } from './LanguagePicker';
import { LanguagePairLabel } from './LanguagePairLabel';
import {
  loadRecentLanguagePairs,
  saveRecentLanguagePair,
} from '../services/language-recent-pairs';
import { DropdownMenu } from './overlay';
import { Button } from './ui';

export function SwitchTranslationControl({
  projectId,
  sourceLanguage,
  targetLanguage,
  onUpdated,
}: {
  projectId: string;
  sourceLanguage: string;
  targetLanguage: string;
  onUpdated: (source: string, target: string) => void;
}) {
  const t = useT();
  const menuId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [langs, setLangs] = useState<LanguageProfileDto[]>([]);
  const [recentPairs, setRecentPairs] = useState(loadRecentLanguagePairs());
  const [target, setTarget] = useState(targetLanguage);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sourceProfile = getLanguageProfile(sourceLanguage);
  const sourceStacked = formatLanguagePickerStacked({
    internationalName: sourceProfile.internationalName,
    nativeName: sourceProfile.nativeName,
    code: sourceLanguage,
  });

  useEffect(() => {
    setTarget(targetLanguage);
  }, [targetLanguage]);

  useEffect(() => {
    if (!open) return;
    void window.khepreeNovelAI.languages.list().then((res) => {
      setLangs(res.languages);
    });
    setRecentPairs(loadRecentLanguagePairs());
  }, [open]);

  const save = async () => {
    if (sourceLanguage === target) {
      setError(t('projectNav.languageMustDiffer'));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await window.khepreeNovelAI.projects.updateLanguages({
        projectId,
        sourceLanguage,
        targetLanguage: target,
      });
      saveRecentLanguagePair(res.project.sourceLanguage, res.project.targetLanguage);
      onUpdated(res.project.sourceLanguage, res.project.targetLanguage);
      setOpen(false);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('errors.UNKNOWN.title'));
    } finally {
      setSaving(false);
    }
  };

  const recentTargets = recentPairs.map((p) => p.targetCode);

  return (
    <div className="switch-translation">
      <Button
        ref={triggerRef}
        type="button"
        size="sm"
        variant="secondary"
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls={menuId}
        onClick={() => {
          setOpen((v) => !v);
        }}
      >
        {t('projectNav.switchTranslation')}
        <ChevronDown size={14} aria-hidden />
      </Button>
      <DropdownMenu
        open={open}
        onOpenChange={setOpen}
        anchorRef={triggerRef}
        id={menuId}
        className="switch-translation-menu"
        placement="bottom-start"
        minWidth={280}
        role="dialog"
      >
        <div style={{ margin: '0 0 0.5rem' }}>
          <LanguagePairLabel
            sourceLanguage={sourceLanguage}
            targetLanguage={targetLanguage}
          />
        </div>
        <label className="muted" style={{ display: 'block', marginBottom: '0.25rem' }}>
          {t('projectNav.sourceLanguage')}
        </label>
        <div
          className="source-language-readonly"
          aria-label={t('projectNav.sourceLanguage')}
          style={{ marginBottom: '0.5rem' }}
        >
          <span className="language-picker-intl">{sourceStacked.internationalName}</span>
          <br />
          <span className="language-picker-native">{sourceStacked.nativeLine}</span>
          <p className="muted" style={{ margin: '0.35rem 0 0', fontSize: 'var(--font-small)' }}>
            {t('projectNav.sourceLanguageDetected')}
          </p>
        </div>
        <label
          className="muted"
          style={{ display: 'block', margin: '0.5rem 0 0.25rem' }}
        >
          {t('projectNav.targetLanguage')}
        </label>
        <LanguagePicker
          value={target}
          aria-label={t('projectNav.targetLanguage')}
          languages={langs}
          recentCodes={recentTargets}
          disabled={saving}
          onChange={setTarget}
        />
        {error ? <p className="error-text">{error}</p> : null}
        <div className="btn-row" style={{ marginTop: '0.65rem' }}>
          <Button size="sm" disabled={saving} onClick={() => void save()}>
            {t('actions.save')}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={saving}
            onClick={() => {
              setOpen(false);
            }}
          >
            {t('actions.cancel')}
          </Button>
        </div>
      </DropdownMenu>
    </div>
  );
}
