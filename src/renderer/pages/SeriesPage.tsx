import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Button } from '../components/ui';
import { useT } from '../i18n';

type SeriesDto = Awaited<
  ReturnType<typeof window.khepreeNovelAI.fictionSeries.list>
>['series'][number];
type VolumeDto = Awaited<
  ReturnType<typeof window.khepreeNovelAI.fictionSeries.listVolumes>
>['volumes'][number];
type ConflictPreview = Awaited<
  ReturnType<typeof window.khepreeNovelAI.fictionSeries.previewMembership>
>;

export function SeriesPage() {
  const t = useT();
  const { seriesId } = useParams<{ seriesId?: string }>();
  const [seriesList, setSeriesList] = useState<SeriesDto[]>([]);
  const [volumes, setVolumes] = useState<VolumeDto[]>([]);
  const [projects, setProjects] = useState<{ id: string; title: string }[]>([]);
  const [newTitle, setNewTitle] = useState('');
  const [assignProjectId, setAssignProjectId] = useState('');
  const [conflicts, setConflicts] = useState<ConflictPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refreshList = useCallback(async () => {
    const { series } = await window.khepreeNovelAI.fictionSeries.list();
    setSeriesList(series);
  }, []);

  const refreshDetail = useCallback(async (id: string) => {
    const { volumes: vols } = await window.khepreeNovelAI.fictionSeries.listVolumes(id);
    setVolumes(vols);
  }, []);

  useEffect(() => {
    void refreshList().catch((err: unknown) => {
      setError(err instanceof Error ? err.message : String(err));
    });
    void window.khepreeNovelAI.projects.list().then((r) => {
      setProjects(r.projects.map((p) => ({ id: p.id, title: p.title })));
    });
  }, [refreshList]);

  useEffect(() => {
    if (!seriesId) {
      setVolumes([]);
      return;
    }
    void refreshDetail(seriesId).catch((err: unknown) => {
      setError(err instanceof Error ? err.message : String(err));
    });
  }, [seriesId, refreshDetail]);

  const createSeries = async () => {
    if (!newTitle.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await window.khepreeNovelAI.fictionSeries.create({ title: newTitle.trim() });
      setNewTitle('');
      await refreshList();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const previewAssign = async () => {
    if (!seriesId || !assignProjectId) return;
    setBusy(true);
    setError(null);
    try {
      const preview = await window.khepreeNovelAI.fictionSeries.previewMembership({
        projectId: assignProjectId,
        toSeriesId: seriesId,
      });
      setConflicts(preview);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const confirmAssign = async (force = false) => {
    if (!seriesId || !assignProjectId) return;
    setBusy(true);
    setError(null);
    try {
      await window.khepreeNovelAI.fictionSeries.assignProject({
        seriesId,
        projectId: assignProjectId,
        force,
      });
      setConflicts(null);
      setAssignProjectId('');
      await refreshDetail(seriesId);
      await refreshList();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const removeVolume = async (projectId: string) => {
    if (!seriesId) return;
    setBusy(true);
    try {
      await window.khepreeNovelAI.fictionSeries.removeVolume({ seriesId, projectId });
      await refreshDetail(seriesId);
      await refreshList();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const exportKnowledge = async () => {
    if (!seriesId) return;
    setBusy(true);
    try {
      const data = await window.khepreeNovelAI.fictionSeries.exportKnowledge({ seriesId });
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `series-${seriesId}-knowledge.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page-stack">
      <header>
        <h1>{t('series.title')}</h1>
        <p className="muted">{t('series.subtitle')}</p>
      </header>

      {error ? <p className="error-text">{error}</p> : null}

      <section className="card">
        <h2>{t('series.create')}</h2>
        <div className="btn-row">
          <input
            type="text"
            value={newTitle}
            placeholder={t('series.namePlaceholder')}
            onChange={(e) => setNewTitle(e.target.value)}
          />
          <Button disabled={busy} onClick={() => void createSeries()}>
            {t('series.createButton')}
          </Button>
        </div>
      </section>

      <section className="card">
        <h2>{t('series.listTitle')}</h2>
        {seriesList.length === 0 ? (
          <p className="muted">{t('series.empty')}</p>
        ) : (
          <ul>
            {seriesList.map((s) => (
              <li key={s.id}>
                <Link to={`/series/${s.id}`}>{s.title}</Link>
                <span className="muted"> — {s.volumeCount} volume(s)</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {seriesId ? (
        <section className="card">
          <div className="btn-row" style={{ marginBottom: '0.75rem' }}>
            <h2 style={{ flex: 1 }}>{t('series.volumesTitle')}</h2>
            <Button variant="secondary" disabled={busy} onClick={() => void exportKnowledge()}>
              {t('series.exportKnowledge')}
            </Button>
          </div>

          {volumes.length === 0 ? (
            <p className="muted">{t('series.noVolumes')}</p>
          ) : (
            <ol>
              {volumes.map((v) => (
                <li key={v.id}>
                  #{v.volumeOrder} {v.projectTitle}
                  {v.volumeLabel ? ` (${v.volumeLabel})` : ''}
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy}
                    onClick={() => void removeVolume(v.projectId)}
                  >
                    {t('series.removeVolume')}
                  </Button>
                </li>
              ))}
            </ol>
          )}

          <h3>{t('series.assignProject')}</h3>
          <div className="btn-row">
            <select
              value={assignProjectId}
              onChange={(e) => setAssignProjectId(e.target.value)}
            >
              <option value="">{t('series.pickProject')}</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.title}</option>
              ))}
            </select>
            <Button variant="secondary" disabled={busy || !assignProjectId} onClick={() => void previewAssign()}>
              {t('series.previewConflicts')}
            </Button>
            <Button disabled={busy || !assignProjectId} onClick={() => void confirmAssign(false)}>
              {t('series.assign')}
            </Button>
          </div>

          {conflicts && conflicts.conflicts.length > 0 ? (
            <div style={{ marginTop: '1rem' }}>
              <p>{t('series.conflictCount', { count: conflicts.conflicts.length })}</p>
              <ul>
                {conflicts.conflicts.map((c) => (
                  <li key={`${c.projectTermId}-${c.seriesTermId}`}>
                    <strong>{c.sourceText}</strong>: project={c.projectTranslation ?? '?'} vs
                    series={c.seriesTranslation ?? '?'}
                    {c.projectLocked || c.seriesLocked ? ' (locked)' : ''}
                  </li>
                ))}
              </ul>
              <Button variant="secondary" disabled={busy} onClick={() => void confirmAssign(true)}>
                {t('series.assignForce')}
              </Button>
            </div>
          ) : conflicts ? (
            <p className="muted">{t('series.noConflicts')}</p>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
