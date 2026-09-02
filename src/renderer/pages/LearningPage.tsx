import { useCallback, useEffect, useState } from 'react';
import type { LearningDashboardResponse } from '@shared/schemas/learning';
import type { ProjectDto } from '@shared/schemas/import';
import { useT, t as i18nT } from '../i18n';
import { OperationalExportDialog } from '../components/OperationalExportDialog';

export function LearningPage() {
  const t = useT();
  const [projects, setProjects] = useState<ProjectDto[]>([]);
  const [projectId, setProjectId] = useState('');
  const [data, setData] = useState<LearningDashboardResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const projectResult = await window.khepreeNovelAI.projects.list();
    setProjects(projectResult.projects);
    const pid = projectId || projectResult.projects[0]?.id || '';
    if (!projectId && pid) setProjectId(pid);
    if (!pid) {
      setData(null);
      return;
    }
    const dashboard = await window.khepreeNovelAI.learning.dashboard(pid);
    setData(dashboard);
  }, [projectId]);

  useEffect(() => {
    void refresh().catch((err: unknown) => {
      setError(err instanceof Error ? err.message : i18nT('learning.loadFailed'));
    });
  }, [refresh]);

  const runRefresh = async () => {
    setBusy(true);
    setError(null);
    try {
      await refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('learning.refreshFailed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="page">
      <header className="page-header">
        <h1>{t('learning.title')}</h1>
        <p className="muted">{t('learning.subtitle')}</p>
      </header>

      {error ? <div className="banner banner-error">{error}</div> : null}

      <div className="toolbar" style={{ gap: '0.75rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
        <label>
          {t('learning.project')}{' '}
          <select
            value={projectId}
            disabled={busy}
            onChange={(event) => {
              setProjectId(event.target.value);
            }}
          >
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.title}
              </option>
            ))}
          </select>
        </label>
        <button type="button" disabled={busy} onClick={() => void runRefresh()}>
          {t('learning.refresh')}
        </button>
        {data ? (
          <span className="muted">
            {t('learning.stats', {
              since: data.stats.chaptersSinceSync,
              every: data.stats.syncEveryNChapters,
              candidates: data.stats.pendingCandidates,
              conflicts: data.stats.pendingConflicts,
              archives: data.stats.archives,
            })}
          </span>
        ) : null}
      </div>

      <div className="card" style={{ marginBottom: '1rem', padding: '1rem' }}>
        <h3>{t('operationalExport.sectionTitle')}</h3>
        <OperationalExportDialog
          projectId={projectId || undefined}
          kinds={['operational_conflicts', 'operational_workbook']}
        />
      </div>

      {!data ? (
        <p className="muted">{t('learning.selectProject')}</p>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
          <div className="placeholder-card">
            <h3>{t('learning.newTerms')}</h3>
            {data.newTerms.length === 0 ? (
              <p className="muted">{t('learning.emptyCandidates')}</p>
            ) : (
              <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                {data.newTerms.map((term) => (
                  <li key={term.id} style={{ marginBottom: '0.5rem' }}>
                    <strong>{term.sourceText}</strong>
                    {term.suggestedTranslation ? ` → ${term.suggestedTranslation}` : ''}
                    <div className="muted">
                      {t('learning.freq', { n: term.frequency })}
                      {term.confidence != null
                        ? ` · ${t('learning.conf', { n: term.confidence.toFixed(2) })}`
                        : ''}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="placeholder-card">
            <h3>{t('learning.conflicts')}</h3>
            {data.conflicts.length === 0 ? (
              <p className="muted">{t('learning.emptyConflicts')}</p>
            ) : (
              <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                {data.conflicts.map((c) => (
                  <li key={c.id} style={{ marginBottom: '0.5rem' }}>
                    <strong>{c.entityType}</strong> · {c.fieldKey}
                    <div className="muted">
                      {c.existingValue?.slice(0, 60) ?? '∅'} →{' '}
                      {c.proposedValue?.slice(0, 60) ?? '∅'}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="placeholder-card">
            <h3>{t('learning.promotions')}</h3>
            {data.promotions.length === 0 ? (
              <p className="muted">{t('learning.emptyPromotions')}</p>
            ) : (
              <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                {data.promotions.map((p) => (
                  <li key={p.id} style={{ marginBottom: '0.5rem' }}>
                    <strong>{p.eventType}</strong>
                    <div className="muted">
                      {p.payload ? JSON.stringify(p.payload).slice(0, 120) : '—'}
                    </div>
                    <div className="muted" style={{ fontSize: '0.85em' }}>
                      {p.createdAt}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="placeholder-card">
            <h3>{t('learning.recentMemories')}</h3>
            {data.recentMemories.length === 0 ? (
              <p className="muted">{t('learning.emptyMemories')}</p>
            ) : (
              <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                {data.recentMemories.map((m) => (
                  <li key={m.id} style={{ marginBottom: '0.5rem' }}>
                    <strong>{m.category}</strong> · {m.key}
                    {m.chapterNumber != null ? ` · ${t('learning.chapter', { n: m.chapterNumber })}` : ''}
                    <div className="muted">{m.value?.slice(0, 100) ?? '—'}</div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
