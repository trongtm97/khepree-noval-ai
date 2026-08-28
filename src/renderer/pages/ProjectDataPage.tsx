import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import type { DataSectionId } from '@shared/constants/data-portability';
import { DATA_SECTION_IDS } from '@shared/constants/data-portability';
import type { TabularImportHistoryEntry } from '@shared/schemas/tabular';
import type { ProjectDto } from '@shared/schemas/import';
import { Card, Button } from '../components/ui';
import { ModalPortal } from '../components/overlay';
import { ProjectSectionHeader } from '../components/shell/ProjectSectionHeader';
import { DataPortabilityCard } from '../components/data-portability/DataPortabilityCard';
import type { DataExportResult } from '../components/data-portability/DataExportMenu';
import { DataRecentOperationsTable } from '../components/data-portability/DataRecentOperationsTable';
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

export function ProjectDataPage() {
  const t = useT();
  const { projectId = '' } = useParams();
  const [project, setProject] = useState<ProjectDto | null>(null);
  const [counts, setCounts] = useState<SectionCounts | null>(null);
  const [history, setHistory] = useState<TabularImportHistoryEntry[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [exportResult, setExportResult] = useState<DataExportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
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

  const editionId = project?.activeEditionId ?? undefined;

  const handleUndo = async (_entryId: string) => {
    setBusy(true);
    try {
      const result = await window.novelTrans.tabular.undoLast({ projectId });
      setMessage(result.message);
      await refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('errors.UNKNOWN.title'));
    } finally {
      setBusy(false);
    }
  };

  if (!projectId) {
    return <div className="banner banner-error">{t('dataHub.noProject')}</div>;
  }

  return (
    <div className="project-page data-hub-page">
      <ProjectSectionHeader
        title={t('dataHub.title')}
        description={t('dataHub.subtitle')}
        helpArticleId="data-portability"
      />

      {error ? <div className="banner banner-error">{error}</div> : null}
      {message ? <div className="banner banner-info">{message}</div> : null}

      {exportResult ? (
        <div className="banner banner-success data-export-toast">
          <span>{exportResult.message}</span>
          {exportResult.filePath ? (
            <div className="btn-row">
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  void window.novelTrans.portability.openExportedFile({
                    projectId,
                    filePath: exportResult.filePath,
                    editionId,
                  });
                }}
              >
                {t('dataHub.openFile')}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  void window.novelTrans.portability.openExportDirectory({
                    projectId,
                    editionId,
                  });
                }}
              >
                {t('dataHub.openFolder')}
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="data-hub-grid">
        {DATA_SECTION_IDS.map((sectionId) => (
          <DataPortabilityCard
            key={sectionId}
            sectionId={sectionId}
            projectId={projectId}
            editionId={editionId}
            countLabel={countLabel(sectionId)}
            onImportComplete={(msg) => {
              setMessage(msg);
              setExportResult(null);
              void refresh();
            }}
            onExportComplete={(result) => {
              setExportResult(result);
              setMessage(null);
              void refresh();
            }}
            onError={setError}
          />
        ))}
      </div>

      <Card className="data-hub-recent">
        <h3 className="data-hub-recent__title">{t('dataHub.recentTitle')}</h3>
        <DataRecentOperationsTable
          entries={history}
          busy={busy}
          onUndo={() => void handleUndo('')}
          onViewReport={setReportEntry}
        />
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
