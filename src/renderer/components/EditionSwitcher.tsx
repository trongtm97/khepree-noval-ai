import { useEffect, useState } from 'react';
import { useT } from '../i18n';
import { Button, Select } from './ui';

interface EditionOption {
  id: string;
  targetLanguage: string;
  name: string;
  isActive: boolean;
}

interface LangOption {
  code: string;
  displayNameNative: string;
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
  const [langs, setLangs] = useState<LangOption[]>([]);
  const [adding, setAdding] = useState(false);
  const [newLang, setNewLang] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = async () => {
    const res = await window.novelTrans.editions.list(projectId);
    setEditions(res.editions);
    const active = res.editions.find((e) => e.isActive) ?? res.editions[0];
    if (active) onChanged(active.targetLanguage, active.id);
  };

  useEffect(() => {
    void reload().catch((err: unknown) => {
      setError(err instanceof Error ? err.message : String(err));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  useEffect(() => {
    if (!adding) return;
    void window.novelTrans.languages.list().then((res) => {
      setLangs(
        res.languages.map((l) => ({
          code: l.code,
          displayNameNative: l.displayNameNative,
        })),
      );
    });
  }, [adding]);

  const active = editions.find((e) => e.isActive) ?? editions[0];
  const existingTargets = new Set(editions.map((e) => e.targetLanguage));
  const addable = langs.filter(
    (l) => l.code !== sourceLanguage && !existingTargets.has(l.code),
  );

  return (
    <div className="edition-switcher">
      <span className="muted" style={{ marginRight: '0.35rem' }}>
        {t('projectNav.editionLabel')}
      </span>
      <Select
        value={active?.id ?? ''}
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
          }}
        >
          {t('projectNav.addEdition')}
        </Button>
      ) : (
        <div className="edition-switcher-add">
          <Select
            value={newLang}
            aria-label={t('projectNav.addEdition')}
            disabled={busy}
            onChange={(event) => {
              setNewLang(event.target.value);
            }}
          >
            <option value="">{t('projectNav.pickLanguage')}</option>
            {addable.map((l) => (
              <option key={l.code} value={l.code}>
                {l.displayNameNative}
              </option>
            ))}
          </Select>
          <Button
            type="button"
            size="sm"
            disabled={busy || !newLang}
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
