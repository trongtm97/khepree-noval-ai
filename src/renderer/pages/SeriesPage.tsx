import { useCallback, useEffect, useRef, useState } from 'react';
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
interface StyleRuleDto {
  id: string;
  kind: string;
  content: string;
  sortOrder: number;
}
interface WorldFactRow { key: string; value: string }
type StyleRuleKind = 'critical' | 'style' | 'pronoun' | 'address';

const STYLE_RULE_KINDS: StyleRuleKind[] = ['critical', 'style', 'pronoun', 'address'];

function recordToRows(record: Record<string, unknown>): WorldFactRow[] {
  return Object.entries(record).map(([key, value]) => ({
    key,
    value: typeof value === 'string' ? value : JSON.stringify(value),
  }));
}

function rowsToRecord(rows: WorldFactRow[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const row of rows) {
    const trimmedKey = row.key.trim();
    if (!trimmedKey) continue;
    out[trimmedKey] = row.value;
  }
  return out;
}

function styleKindLabelKey(kind: string): `series.styleKind${string}` {
  switch (kind) {
    case 'critical':
      return 'series.styleKindCritical';
    case 'style':
      return 'series.styleKindStyle';
    case 'pronoun':
      return 'series.styleKindPronoun';
    case 'address':
      return 'series.styleKindAddress';
    default:
      return 'series.styleKindStyle';
  }
}

export function SeriesPage() {
  const t = useT();
  const { seriesId } = useParams<{ seriesId?: string }>();
  const [seriesList, setSeriesList] = useState<SeriesDto[]>([]);
  const [seriesDetail, setSeriesDetail] = useState<SeriesDto | null>(null);
  const [volumes, setVolumes] = useState<VolumeDto[]>([]);
  const [projects, setProjects] = useState<{ id: string; title: string }[]>([]);
  const [worldRows, setWorldRows] = useState<WorldFactRow[]>([]);
  const [styleRules, setStyleRules] = useState<StyleRuleDto[]>([]);
  const [newRuleKind, setNewRuleKind] = useState<StyleRuleKind>('style');
  const [newRuleContent, setNewRuleContent] = useState('');
  const [newTitle, setNewTitle] = useState('');
  const [assignProjectId, setAssignProjectId] = useState('');
  const [conflicts, setConflicts] = useState<ConflictPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const worldSectionRef = useRef<HTMLElement | null>(null);

  const refreshList = useCallback(async () => {
    const { series } = await window.khepreeNovelAI.fictionSeries.list();
    setSeriesList(series);
  }, []);

  const refreshDetail = useCallback(async (id: string) => {
    const [{ volumes: vols }, detail, worldRes, rules] = await Promise.all([
      window.khepreeNovelAI.fictionSeries.listVolumes(id),
      window.khepreeNovelAI.fictionSeries.get(id),
      window.khepreeNovelAI.fictionSeries.getWorld({ seriesId: id }),
      window.khepreeNovelAI.fictionSeries.listStyleRules(id),
    ]);
    setVolumes(vols);
    setSeriesDetail(detail.series);
    setWorldRows(recordToRows(worldRes.worldKnowledge));
    setStyleRules(rules.rules);
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
      setSeriesDetail(null);
      setWorldRows([]);
      setStyleRules([]);
      return;
    }
    void refreshDetail(seriesId).catch((err: unknown) => {
      setError(err instanceof Error ? err.message : String(err));
    });
  }, [seriesId, refreshDetail]);

  useEffect(() => {
    if (!seriesId || !window.location.hash.includes('world')) return;
    const timer = window.setTimeout(() => {
      const el = document.getElementById('series-shared-knowledge');
      el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 120);
    return () => { window.clearTimeout(timer); };
  }, [seriesId, worldRows.length]);

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

  const moveVolume = async (index: number, direction: -1 | 1) => {
    if (!seriesId) return;
    const target = index + direction;
    if (target < 0 || target >= volumes.length) return;
    const ordered = volumes.map((v) => v.projectId);
    const next = [...ordered];
    [next[index], next[target]] = [next[target], next[index]];
    setBusy(true);
    setError(null);
    try {
      await window.khepreeNovelAI.fictionSeries.reorderVolumes({
        seriesId,
        orderedProjectIds: next,
      });
      await refreshDetail(seriesId);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const saveWorldKnowledge = async () => {
    if (!seriesId) return;
    setBusy(true);
    setError(null);
    try {
      await window.khepreeNovelAI.fictionSeries.setWorld({
        seriesId,
        worldKnowledge: rowsToRecord(worldRows),
      });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const addWorldRow = () => {
    setWorldRows((prev) => [...prev, { key: '', value: '' }]);
  };

  const updateWorldRow = (index: number, field: 'key' | 'value', value: string) => {
    setWorldRows((prev) =>
      prev.map((row, i) => (i === index ? { ...row, [field]: value } : row)),
    );
  };

  const removeWorldRow = (index: number) => {
    setWorldRows((prev) => prev.filter((_, i) => i !== index));
  };

  const addStyleRule = async () => {
    if (!seriesId || !newRuleContent.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await window.khepreeNovelAI.fictionSeries.upsertStyleRule({
        seriesId,
        kind: newRuleKind,
        content: newRuleContent.trim(),
      });
      setNewRuleContent('');
      await refreshDetail(seriesId);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const deleteStyleRule = async (ruleId: string) => {
    if (!seriesId) return;
    setBusy(true);
    setError(null);
    try {
      await window.khepreeNovelAI.fictionSeries.deleteStyleRule({ seriesId, ruleId });
      await refreshDetail(seriesId);
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

  const detailTitle = seriesDetail?.title ?? seriesList.find((s) => s.id === seriesId)?.title;

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
            onChange={(e) => { setNewTitle(e.target.value); }}
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
        <section className="series-detail" aria-labelledby="series-detail-heading">
          <h2 id="series-detail-heading" style={{ margin: 0 }}>
            {detailTitle ?? t('series.volumesTitle')}
          </h2>

          <div className="btn-row series-detail-header">
            <h3 id="series-volumes-heading" style={{ flex: 1, margin: 0 }}>
              {t('series.volumesTitle')}
            </h3>
            <Button variant="secondary" disabled={busy} onClick={() => void exportKnowledge()}>
              {t('series.exportKnowledge')}
            </Button>
          </div>

          {volumes.length === 0 ? (
            <EmptyState title={t('series.noVolumes')} description={t('series.assignHelp')} />
          ) : (
            <ol className="series-volume-list">
              {volumes.map((v, index) => (
                <li key={v.id}>
                  <span>
                    #{v.volumeOrder} {v.projectTitle}
                    {v.volumeLabel ? ` (${v.volumeLabel})` : ''}
                  </span>
                  <div className="btn-row">
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy || index === 0}
                      aria-label={t('series.moveVolumeUp')}
                      onClick={() => void moveVolume(index, -1)}
                    >
                      ↑ {t('series.moveVolumeUp')}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy || index === volumes.length - 1}
                      aria-label={t('series.moveVolumeDown')}
                      onClick={() => void moveVolume(index, 1)}
                    >
                      ↓ {t('series.moveVolumeDown')}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy}
                      onClick={() => void removeVolume(v.projectId)}
                    >
                      {t('series.removeVolume')}
                    </Button>
                  </div>
                </li>
              ))}
            </ol>
          )}

          <h3>{t('series.assignProject')}</h3>
          <p className="field-help">{t('series.assignHelp')}</p>
          <div className="btn-row">
            <select
              value={assignProjectId}
              onChange={(e) => { setAssignProjectId(e.target.value); }}
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

          <section
            id="series-shared-knowledge"
            ref={worldSectionRef}
            className="series-world-section"
            aria-labelledby="series-shared-knowledge-heading"
          >
            <h3 id="series-shared-knowledge-heading">{t('series.sharedKnowledgeTitle')}</h3>
            <p className="field-help">{t('series.sharedKnowledgeHelp')}</p>
            <details className="series-tech-details">
              <summary>{t('errors.technicalDetails')}</summary>
              <p className="field-help muted">{t('series.whenEffective')}</p>
              <p className="field-help muted">{t('series.storyOverrideNote')}</p>
              <p className="field-help muted">{t('series.notebookNote')}</p>
            </details>

            <div className="series-world-rows">
              {worldRows.map((row, index) => (
                <div key={`world-row-${index}`} className="btn-row series-world-row">
                  <input
                    type="text"
                    value={row.key}
                    placeholder={t('series.worldKey')}
                    aria-label={t('series.worldKey')}
                    onChange={(e) => { updateWorldRow(index, 'key', e.target.value); }}
                  />
                  <input
                    type="text"
                    value={row.value}
                    placeholder={t('series.worldValue')}
                    aria-label={t('series.worldValue')}
                    onChange={(e) => { updateWorldRow(index, 'value', e.target.value); }}
                  />
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy}
                    onClick={() => { removeWorldRow(index); }}
                  >
                    {t('series.deleteStyleRule')}
                  </Button>
                </div>
              ))}
            </div>
            <div className="btn-row">
              <Button variant="secondary" disabled={busy} onClick={addWorldRow}>
                {t('series.addWorldFact')}
              </Button>
              <Button disabled={busy} onClick={() => void saveWorldKnowledge()}>
                {busy ? t('common.loading') : t('series.saveWorld')}
              </Button>
            </div>
          </section>

          <section className="series-style-rules" aria-labelledby="series-style-rules-heading">
            <h3 id="series-style-rules-heading">{t('series.styleRulesTitle')}</h3>
            <p className="field-help">{t('series.styleRulesHelp')}</p>

            {styleRules.length === 0 ? (
              <p className="muted">{t('series.empty')}</p>
            ) : (
              <ul className="series-style-rule-list">
                {styleRules.map((rule) => (
                  <li key={rule.id}>
                    <span className="series-style-rule-kind">{t(styleKindLabelKey(rule.kind))}</span>
                    <p>{rule.content}</p>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy}
                      onClick={() => void deleteStyleRule(rule.id)}
                    >
                      {t('series.deleteStyleRule')}
                    </Button>
                  </li>
                ))}
              </ul>
            )}

            <div className="series-style-rule-add">
              <select
                value={newRuleKind}
                onChange={(e) => { setNewRuleKind(e.target.value as StyleRuleKind); }}
                aria-label={t('series.styleRulesTitle')}
              >
                {STYLE_RULE_KINDS.map((kind) => (
                  <option key={kind} value={kind}>
                    {t(styleKindLabelKey(kind))}
                  </option>
                ))}
              </select>
              <textarea
                value={newRuleContent}
                placeholder={t('series.addStyleRule')}
                aria-label={t('series.addStyleRule')}
                rows={3}
                onChange={(e) => { setNewRuleContent(e.target.value); }}
              />
              <Button
                disabled={busy || !newRuleContent.trim()}
                onClick={() => void addStyleRule()}
              >
                {t('series.addStyleRule')}
              </Button>
            </div>
          </section>

          <section className="series-apply-status" aria-labelledby="series-apply-status-heading">
            <h3 id="series-apply-status-heading">{t('series.applyStatusTitle')}</h3>
            <p className="field-help">{t('series.applyStatusHelp')}</p>
            {volumes.length > 0 ? (
              <div className="series-inherited-projects">
                <strong>{t('series.inheritedProjects')}</strong>
                <ul>
                  {volumes.map((v) => (
                    <li key={v.projectId}>
                      <Link to={`/projects/${v.projectId}`}>{v.projectTitle}</Link>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="muted">{t('series.noVolumes')}</p>
            )}
          </section>

          <section className="series-notebook-status" aria-labelledby="series-notebook-status-heading">
            <h3 id="series-notebook-status-heading">{t('series.notebookStatusTitle')}</h3>
            <p className="field-help">{t('series.notebookStatusHelp')}</p>
            <p className="field-help muted">{t('series.notebookNote')}</p>
          </section>
        </section>
      ) : null}
    </div>
  );
}
