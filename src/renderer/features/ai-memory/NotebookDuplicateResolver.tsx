import { useCallback, useEffect, useState } from 'react';
import { Button } from '../../components/ui';
import { useT } from '../../i18n';

export interface NotebookDuplicateCandidate {
  id: string;
  projectId: string;
  notebookId: string | null;
  notebookName: string | null;
  resourceUrl: string | null;
  role: string;
  status: string;
  lastVerifiedAt: string | null;
  updatedAt: string;
  locallyBound: boolean;
  deprecatedAt: string | null;
}

interface NotebookDuplicateResolverProps {
  projectId: string;
  onResolved?: () => void;
}

/**
 * User picks one primary Notebook binding for a story.
 * Never deletes remote NotebookLM projects.
 */
export function NotebookDuplicateResolver({
  projectId,
  onResolved,
}: NotebookDuplicateResolverProps) {
  const t = useT();
  const [candidates, setCandidates] = useState<NotebookDuplicateCandidate[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await window.khepreeNovelAI.notebook.listDuplicateCandidates({
        projectId,
      });
      setCandidates(res.candidates);
      setError(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [projectId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const active = candidates.filter((c) => c.locallyBound);
  if (done || active.length < 2) {
    return null;
  }

  return (
    <section
      className="card notebook-duplicate-resolver"
      aria-labelledby="notebook-dup-heading"
    >
      <h3 id="notebook-dup-heading">{t('aiMemory.notebookDuplicateTitle')}</h3>
      <p className="field-help">{t('aiMemory.notebookDuplicateHelp')}</p>
      {error ? <p className="error-text">{error}</p> : null}
      <ul className="notebook-dup-list">
        {candidates.map((c) => (
          <li key={c.id}>
            <div>
              <strong>
                {c.notebookName && c.notebookName.trim().length > 0
                  ? c.notebookName.trim()
                  : t('aiMemory.notebookUnnamed')}
              </strong>
              <p className="muted">
                {c.locallyBound
                  ? t('aiMemory.notebookLocallyBound')
                  : t('aiMemory.notebookInactiveLocal')}
                {c.lastVerifiedAt
                  ? ` · ${t('aiMemory.notebookLastUsed')}: ${c.lastVerifiedAt}`
                  : ` · ${t('aiMemory.notebookUpdated')}: ${c.updatedAt}`}
              </p>
              {c.resourceUrl ? (
                <a href={c.resourceUrl} target="_blank" rel="noreferrer">
                  {t('aiMemory.openOtherNotebook')}
                </a>
              ) : null}
            </div>
            {c.locallyBound ? (
              <Button
                size="sm"
                disabled={busy}
                onClick={() => {
                  setBusy(true);
                  void window.khepreeNovelAI.notebook
                    .resolvePrimaryBinding({
                      projectId,
                      primaryRowId: c.id,
                    })
                    .then(() => {
                      setDone(true);
                      onResolved?.();
                      return refresh();
                    })
                    .catch((err: unknown) => {
                      setError(err instanceof Error ? err.message : String(err));
                    })
                    .finally(() => {
                      setBusy(false);
                    });
                }}
              >
                {t('aiMemory.choosePrimaryNotebook')}
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
