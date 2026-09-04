import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Button, EmptyState, ErrorPanel, PageHeader } from '../components/ui';
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
    <div className="page-stack series-page">
      <PageHeader title={t('series.title')} description={t('series.subtitle')} />

      {error ? (
        <ErrorPanel title={t('app.errorTitle')} description={error} />
      ) : null}

      <section className="series-create" aria-labelledby="series-create-heading">
        <h2 id="series-create-heading">{t('series.create')}</h2>
        <p className="field-help">{t('series.emptyBody')}</p>
        <div className="btn-row">
          <input
            type="text"
            value={newTitle}
            placeholder={t('series.namePlaceholder')}
            aria-label={t('series.namePlaceholder')}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void createSeries();
            }}
          />
          <Button disabled={busy || !newTitle.trim()} onClick={() => void createSeries()}>
            {busy ? t('common.loading') : t('series.createButton')}
          </Button>
        </div>
      </section>

      <section aria-labelledby="series-list-heading">
        <h2 id="series-list-heading">{t('series.listTitle')}</h2>
        {seriesList.length === 0 ? (
          <EmptyState title={t('series.emptyTitle')} description={t('series.emptyBody')} />
        ) : (
          <ul className="series-list">
            {seriesList.map((s) => (
              <li key={s.id}>
                <Link
                  to={`/series/${s.id}`}
                  className={seriesId === s.id ? 'series-list-link is-active' : 'series-list-link'}
                >
                  {s.title}
                </Link>
                <span className="muted">
                  {' '}
                  — {t('series.volumeCount', { n: String(s.volumeCount) })}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {seriesId ? (
        <section className="series-detail" aria-labelledby="series-volumes-heading">
          <div className="btn-row series-detail-header">
            <h2 id="series-volumes-heading" style={{ flex: 1, margin: 0 }}>
              {t('series.volumesTitle')}
            </h2>
            <Button variant="secondary" disabled={busy} onClick={() => void exportKnowledge()}>
              {t('series.exportKnowledge')}
            </Button>
          </div>

          {volumes.length === 0 ? (
            <EmptyState title={t('series.noVolumes')} description={t('series.assignHelp')} />
          ) : (
            <ol className="series-volume-list">
              {volumes.map((v) => (
                <li key={v.id}>
                  <span>
                    #{v.volumeOrder} {v.projectTitle}
                    {v.volumeLabel ? ` (${v.volumeLabel})` : ''}
                  </span>
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
          <p className="field-help">{t('series.assignHelp')}</p>
          <div className="btn-row">
            <select
              value={assignProjectId}
              onChange={(e) => setAssignProjectId(e.target.value)}
              aria-label={t('series.pickProject')}
            >
              <option value="">{t('series.pickProject')}</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
            </select>
            <Button
              variant="secondary"
              disabled={busy || !assignProjectId}
              onClick={() => void previewAssign()}
            >
              {t('series.previewConflicts')}
            </Button>
            <Button disabled={busy || !assignProjectId} onClick={() => void confirmAssign(false)}>
              {t('series.assign')}
            </Button>
          </div>

          {conflicts && conflicts.conflicts.length > 0 ? (
            <div className="series-conflicts">
              <p>{t('series.conflictCount', { count: String(conflicts.conflicts.length) })}</p>
              <ul>
                {conflicts.conflicts.map((c) => (
                  <li key={`${c.projectTermId}-${c.seriesTermId}`}>
                    <strong>{c.sourceText}</strong>: {c.projectTranslation ?? '?'} vs{' '}
                    {c.seriesTranslation ?? '?'}
                    {c.projectLocked || c.seriesLocked ? ` (${t('series.locked')})` : ''}
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
