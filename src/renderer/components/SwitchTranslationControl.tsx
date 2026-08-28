import { useEffect, useId, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import {
  formatLanguagePairLabel,
  formatLanguagePickerStacked,
  getLanguageProfile,
} from '@shared/constants/language-profile';
import type { LanguageProfileDto } from '@shared/schemas/language-profile';
import { useT } from '../i18n';
import { LanguagePicker } from './LanguagePicker';
import {
  loadRecentLanguagePairs,
  saveRecentLanguagePair,
} from '../services/language-recent-pairs';
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
  const rootRef = useRef<HTMLDivElement>(null);
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
    void window.novelTrans.languages.list().then((res) => {
      setLangs(res.languages);
    });
    setRecentPairs(loadRecentLanguagePairs());
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => {
      document.removeEventListener('mousedown', onDoc);
    };
  }, [open]);

  const save = async () => {
    if (sourceLanguage === target) {
      setError(t('projectNav.languageMustDiffer'));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await window.novelTrans.projects.updateLanguages({
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
    <div className="switch-translation" ref={rootRef}>
      <Button
        type="button"
        size="sm"
        variant="secondary"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => {
          setOpen((v) => !v);
        }}
      >
        {t('projectNav.switchTranslation')}
        <ChevronDown size={14} aria-hidden />
      </Button>
      {open ? (
        <div id={menuId} className="switch-translation-menu" role="dialog">
          <p className="muted" style={{ margin: '0 0 0.5rem', fontSize: 'var(--font-small)' }}>
            {formatLanguagePairLabel(sourceLanguage, targetLanguage)}
          </p>
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
        </div>
      ) : null}
    </div>
  );
}
