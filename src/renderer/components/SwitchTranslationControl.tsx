import { useEffect, useId, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { formatLanguagePairLabel } from '@shared/constants/language-profile';
import { useT } from '../i18n';
import { Button, Select } from './ui';

interface LangOption {
  code: string;
  displayNameVi: string;
  displayNameNative: string;
}

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
  const [langs, setLangs] = useState<LangOption[]>([]);
  const [source, setSource] = useState(sourceLanguage);
  const [target, setTarget] = useState(targetLanguage);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setSource(sourceLanguage);
    setTarget(targetLanguage);
  }, [sourceLanguage, targetLanguage]);

  useEffect(() => {
    if (!open) return;
    void window.novelTrans.languages.list().then((res) => {
      setLangs(
        res.languages.map((l) => ({
          code: l.code,
          displayNameVi: l.displayNameVi,
          displayNameNative: l.displayNameNative,
        })),
      );
    });
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
    if (source === target) {
      setError(t('projectNav.languageMustDiffer'));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await window.novelTrans.projects.updateLanguages({
        projectId,
        sourceLanguage: source,
        targetLanguage: target,
      });
      onUpdated(res.project.sourceLanguage, res.project.targetLanguage);
      setOpen(false);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('errors.UNKNOWN.title'));
    } finally {
      setSaving(false);
    }
  };

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
          <Select
            value={source}
            aria-label={t('projectNav.sourceLanguage')}
            disabled={saving}
            onChange={(e) => {
              setSource(e.target.value);
            }}
          >
            {langs.map((l) => (
              <option key={l.code} value={l.code}>
                {l.displayNameNative}
              </option>
            ))}
          </Select>
          <label
            className="muted"
            style={{ display: 'block', margin: '0.5rem 0 0.25rem' }}
          >
            {t('projectNav.targetLanguage')}
          </label>
          <Select
            value={target}
            aria-label={t('projectNav.targetLanguage')}
            disabled={saving}
            onChange={(e) => {
              setTarget(e.target.value);
            }}
          >
            {langs.map((l) => (
              <option key={l.code} value={l.code}>
                {l.displayNameNative}
              </option>
            ))}
          </Select>
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
