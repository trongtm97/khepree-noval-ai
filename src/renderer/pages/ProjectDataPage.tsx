import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import type { DataSectionId } from '@shared/constants/data-portability';
import { DATA_SECTION_IDS } from '@shared/constants/data-portability';
import type { TabularImportHistoryEntry } from '@shared/schemas/tabular';
import type { ProjectDto } from '@shared/schemas/import';
import { PageHeader, Card, Button } from '../components/ui';
import { ModalPortal } from '../components/overlay';
import { DataPortabilityCard } from '../components/data-portability/DataPortabilityCard';
import { useT } from '../i18n';

interface SectionCounts {
  translations: number;
  terms: number;
  characters: number;
  knowledge: number;
  source: number;
  reports: number;
}

function formatCount(n: number, locale: string): string {
  return n.toLocaleString(locale);
}

function isToday(iso: string): boolean {
  const d = new Date(iso);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

export function ProjectDataPage() {
  const t = useT();
  const { projectId = '' } = useParams();
  const [project, setProject] = useState<ProjectDto | null>(null);
  const [counts, setCounts] = useState<SectionCounts | null>(null);
  const [history, setHistory] = useState<TabularImportHistoryEntry[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reportEntry, setReportEntry] = useState<TabularImportHistoryEntry | null>(null);

  const locale = 'vi-VN';

  const refresh = useCallback(async () => {
    if (!projectId) return;
    const [{ project: p }, charResult, relResult, termCount, bootstrap, hist] = await Promise.all([
      window.novelTrans.projects.get(projectId),
      window.novelTrans.memory.listCharacters(projectId),
      window.novelTrans.memory.listRelationships({ projectId }),
      window.novelTrans.terms.countByProject(projectId),
      window.novelTrans.notebook.getBootstrapStatus(projectId).catch(() => null),
      window.novelTrans.tabular.listHistory({ projectId }),
    ]);
    setProject(p);
    setHistory(hist.entries);
    setCounts({
      translations: p.translatedChapterCount ?? 0,
      terms: termCount.count,
      characters: charResult.characters.length + relResult.relationships.length,
      knowledge:
        (bootstrap?.termCandidateCount ?? 0) +
        (bootstrap?.characterCount ?? 0) +
        (bootstrap?.relationshipCount ?? 0),
      source: p.sourceChapterCount ?? 0,
      reports: hist.entries.length,
    });
  }, [projectId]);

  useEffect(() => {
    void refresh().catch((err: unknown) => {
      setError(err instanceof Error ? err.message : t('errors.UNKNOWN.title'));
    });
  }, [refresh, t]);

  const countLabel = useCallback(
    (sectionId: DataSectionId): string => {
      const n = counts?.[sectionId] ?? 0;
      switch (sectionId) {
        case 'translations':
          return t('dataHub.countChapters', { count: formatCount(n, locale) });
        case 'terms':
          return t('dataHub.countTerms', { count: formatCount(n, locale) });
        case 'characters':
          return t('dataHub.countCharacters', { count: formatCount(n, locale) });
        case 'knowledge':
          return t('dataHub.countKnowledge', { count: formatCount(n, locale) });
        case 'source':
          return t('dataHub.countChapters', { count: formatCount(n, locale) });
        case 'reports':
          return t('dataHub.countReports', { count: formatCount(n, locale) });
        default:
          return String(n);
      }
    },
    [counts, locale, t],
  );

  const recentToday = useMemo(
    () => history.filter((e) => isToday(e.createdAt)).slice(0, 10),
    [history],
  );

  const editionId = project?.activeEditionId ?? undefined;

  if (!projectId) {
    return <div className="banner banner-error">{t('dataHub.noProject')}</div>;
  }

  return (
    <div className="data-hub-page">
      <PageHeader title={t('dataHub.title')} description={t('dataHub.subtitle')} />

      {error ? <div className="banner banner-error">{error}</div> : null}
      {message ? <div className="banner banner-success">{message}</div> : null}

      <div className="data-hub-grid">
        {DATA_SECTION_IDS.map((sectionId) => (
          <DataPortabilityCard
            key={sectionId}
            sectionId={sectionId}
            projectId={projectId}
            editionId={editionId}
            countLabel={countLabel(sectionId)}
            onComplete={(msg) => {
              setMessage(msg);
              void refresh();
            }}
          />
        ))}
      </div>

      <Card className="data-hub-recent">
        <h3>{t('dataHub.recentTitle')}</h3>
        {recentToday.length === 0 ? (
          <p className="nt-muted-text">{t('dataHub.recentEmpty')}</p>
        ) : (
          <ul className="data-hub-recent-list">
            {recentToday.map((entry) => (
              <li key={entry.id}>
                <div>
                  <strong>{entry.fileName}</strong>
                  <span className="nt-muted-text">
                    {' '}
                    · {t('dataHub.recentRows', { count: entry.rowCount })}
                  </span>
                </div>
                <Button
                  variant="ghost"
                  onClick={() => setReportEntry(entry)}
                >
                  {t('dataHub.viewReport')}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <ModalPortal
        open={!!reportEntry}
        onBackdropClick={() => setReportEntry(null)}
        contentClassName="nt-dialog"
        role="dialog"
        ariaModal
      >
        {reportEntry ? (
          <>
            <h2>{t('dataHub.reportTitle')}</h2>
            <p>
              <strong>{reportEntry.fileName}</strong>
            </p>
            <ul>
              <li>{t('dataHub.reportInserted', { n: reportEntry.insertedCount })}</li>
              <li>{t('dataHub.reportUpdated', { n: reportEntry.updatedCount })}</li>
              <li>{t('dataHub.reportSkipped', { n: reportEntry.skippedCount })}</li>
              <li>{t('dataHub.reportErrors', { n: reportEntry.errorCount })}</li>
            </ul>
            <Button variant="primary" onClick={() => setReportEntry(null)}>
              {t('actions.close')}
            </Button>
          </>
        ) : null}
      </ModalPortal>
    </div>
  );
}
