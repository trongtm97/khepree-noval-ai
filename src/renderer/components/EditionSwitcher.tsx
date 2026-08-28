import { useEffect, useMemo, useState } from 'react';
import type { LanguageProfileDto } from '@shared/schemas/language-profile';
import { getLanguageProfile } from '@shared/constants/language-profile';
import { resolveEditionDefaultTarget } from '@shared/constants/translation-settings';
import { useT } from '../i18n';
import { LanguagePicker } from './LanguagePicker';
import { Button, Select } from './ui';

interface EditionOption {
  id: string;
  targetLanguage: string;
  name: string;
  isActive: boolean;
}

/**
 * Project header edition switcher.
 * Switch / add target language — never re-imports source.
 */
export function EditionSwitcher({
  projectId,
  sourceLanguage,
  onChanged,
}: {
  projectId: string;
  sourceLanguage: string;
  onChanged: (targetLanguage: string, activeEditionId: string) => void;
}) {
  const t = useT();
  const [editions, setEditions] = useState<EditionOption[]>([]);
  const [langs, setLangs] = useState<LanguageProfileDto[]>([]);
  const [adding, setAdding] = useState(false);
  const [newLang, setNewLang] = useState('');
  const [duplicateDefaultWarning, setDuplicateDefaultWarning] = useState(false);
  const [defaultTargetLanguage, setDefaultTargetLanguage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = async () => {
    const res = await window.novelTrans.editions.list(projectId);
    setEditions(res.editions);
    const activeEdition =
      res.editions.find((e) => e.isActive) ?? (res.editions.length > 0 ? res.editions[0] : null);
    if (activeEdition) onChanged(activeEdition.targetLanguage, activeEdition.id);
  };

  useEffect(() => {
    void reload().catch((err: unknown) => {
      setError(err instanceof Error ? err.message : String(err));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  useEffect(() => {
    if (!adding) return;
    void Promise.all([
      window.novelTrans.languages.list(),
      window.novelTrans.translationSettings.get(),
    ])
      .then(([langRes, settings]) => {
        setLangs(langRes.languages);
        const existingTargets = editions.map((e) => e.targetLanguage);
        const addableLangs = langRes.languages.filter(
          (l) => l.code !== sourceLanguage && !existingTargets.includes(l.code),
        );
        const resolved = resolveEditionDefaultTarget({
          defaultTargetLanguage: settings.defaultTargetLanguage,
          sourceLanguage,
          existingTargets,
          addableCodes: addableLangs.map((l) => l.code),
        });
        setDefaultTargetLanguage(settings.defaultTargetLanguage);
        setDuplicateDefaultWarning(resolved.duplicateDefault);
        setNewLang(resolved.suggestedTarget);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : String(err));
      });
  }, [adding, editions, sourceLanguage]);

  const active =
    editions.find((e) => e.isActive) ?? (editions.length > 0 ? editions[0] : null);
  const existingTargets = new Set(editions.map((e) => e.targetLanguage));
  const addableLangs = useMemo(
    () =>
      langs.filter(
        (l) => l.code !== sourceLanguage && !existingTargets.has(l.code),
      ),
    [langs, sourceLanguage, existingTargets],
  );

  const duplicateSelection =
    !!newLang && (existingTargets.has(newLang) || newLang === sourceLanguage);

  const defaultDuplicateLabel = useMemo(() => {
    if (!duplicateDefaultWarning || !defaultTargetLanguage) return null;
    const profile = getLanguageProfile(defaultTargetLanguage);
    return t('projectNav.editionDuplicateWarning', {
      language: profile.displayNameVi || profile.nativeName,
    });
  }, [defaultTargetLanguage, duplicateDefaultWarning, t]);

  return (
    <div className="edition-switcher">
      <span className="muted" style={{ marginRight: '0.35rem' }}>
        {t('projectNav.editionLabel')}
      </span>
      <Select
        value={active ? active.id : ''}
        aria-label={t('projectNav.editionLabel')}
        disabled={busy || editions.length === 0}
        onChange={(event) => {
          const editionId = event.target.value;
          setBusy(true);
          setError(null);
          void window.novelTrans.editions
            .switch({ projectId, editionId })
            .then((res) => {
              setEditions(res.editions);
              onChanged(res.edition.targetLanguage, res.edition.id);
            })
            .catch((err: unknown) => {
              setError(err instanceof Error ? err.message : String(err));
            })
            .finally(() => {
              setBusy(false);
            });
        }}
      >
        {editions.map((e) => (
          <option key={e.id} value={e.id}>
            {e.name}
          </option>
        ))}
      </Select>

      {!adding ? (
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={busy}
          onClick={() => {
            setAdding(true);
            setNewLang('');
            setDuplicateDefaultWarning(false);
          }}
        >
          {t('projectNav.addEdition')}
        </Button>
      ) : (
        <div className="edition-switcher-add">
          {defaultDuplicateLabel ? (
            <p className="banner banner-warn edition-switcher-warn">{defaultDuplicateLabel}</p>
          ) : null}
          <LanguagePicker
            value={newLang || addableLangs[0]?.code || ''}
            aria-label={t('projectNav.pickLanguage')}
            languages={addableLangs}
            disabled={busy || addableLangs.length === 0}
            onChange={(code) => {
              setNewLang(code);
              setDuplicateDefaultWarning(false);
            }}
          />
          <Button
            type="button"
            size="sm"
            disabled={busy || !newLang || duplicateSelection}
            onClick={() => {
              setBusy(true);
              setError(null);
              void window.novelTrans.editions
                .create({
                  projectId,
                  targetLanguage: newLang,
                  activate: true,
                })
                .then((res) => {
                  setEditions(res.editions);
                  onChanged(res.edition.targetLanguage, res.edition.id);
                  setAdding(false);
                })
                .catch((err: unknown) => {
                  setError(err instanceof Error ? err.message : String(err));
                })
                .finally(() => {
                  setBusy(false);
                });
            }}
          >
            {t('actions.add')}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={busy}
            onClick={() => {
              setAdding(false);
            }}
          >
            {t('actions.cancel')}
          </Button>
        </div>
      )}
      {error ? <p className="error-text">{error}</p> : null}
    </div>
  );
}
