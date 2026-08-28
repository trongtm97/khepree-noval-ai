import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import type { ProjectMetadataDto } from '@shared/schemas/book-metadata';
import type { ProjectDto } from '@shared/schemas/import';
import { TabularImportExportDialog } from '../components/TabularImportExportDialog';
import { ProjectSectionHeader } from '../components/shell/ProjectSectionHeader';
import { ProjectOverviewCards } from '../features/project-overview/ProjectOverviewCards';
import { MetadataTextSections } from '../features/project-overview/MetadataTextSections';
import { ProjectMetadataEditDrawer } from '../features/project-overview/ProjectMetadataEditDrawer';
import { buildProjectNextActions } from '../features/project-overview/project-next-actions';
import { useT } from '../i18n';
import { useUiShellStore } from '../stores/ui-shell-store';

function sourceHealthKey(project: ProjectDto): string {
  switch (project.health?.source) {
    case 'ok':
      return 'bookMetadata.sourceReady';
    case 'warn':
      return 'bookMetadata.sourceWarn';
    default:
      return 'bookMetadata.sourceMissing';
  }
}

export function ProjectInfoPage() {
  const t = useT();
  const showAdvancedTools = useUiShellStore((s) => s.showAdvancedTools);
  const { projectId = '' } = useParams();
  const [metadata, setMetadata] = useState<ProjectMetadataDto | null>(null);
  const [project, setProject] = useState<ProjectDto | null>(null);
  const [sourceSummary, setSourceSummary] = useState<{ newCount: number } | null>(null);
  const [termsReviewCount, setTermsReviewCount] = useState(0);
  const [termCandidateCount, setTermCandidateCount] = useState(0);
  const [editOpen, setEditOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [workbookMessage, setWorkbookMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!projectId) return;
    void Promise.all([
      window.novelTrans.bookMetadata.get(projectId),
      window.novelTrans.projects.get(projectId),
      window.novelTrans.sourceFolder.getStatus(projectId).catch(() => null),
      window.novelTrans.terms.reviewQueue().catch(() => ({ terms: [] })),
      window.novelTrans.terms.listCandidates({ projectId }).catch(() => ({ candidates: [] })),
    ])
      .then(([metaRes, projectRes, sourceStatus, reviewRes, candidateRes]) => {
        setMetadata(metaRes.metadata);
        setProject(projectRes.project);
        setSourceSummary(
          sourceStatus?.scanSummary
            ? { newCount: sourceStatus.scanSummary.newCount }
            : null,
        );
        setTermsReviewCount(reviewRes.terms.length);
        setTermCandidateCount(candidateRes.candidates.length);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : t('errors.UNKNOWN.title'));
      });
  }, [projectId, t]);

  const nextActions = useMemo(() => {
    if (!project) return [];
    return buildProjectNextActions({
      project,
      newChapterCount: sourceSummary?.newCount ?? 0,
      termsReviewCount,
      termCandidateCount,
    });
  }, [project, sourceSummary, termsReviewCount, termCandidateCount]);

  const save = async (next: ProjectMetadataDto) => {
    if (!projectId) return;
    setBusy(true);
    setError(null);
    try {
      const res = await window.novelTrans.bookMetadata.update({ projectId, metadata: next });
      setMetadata(res.metadata);
      setEditOpen(false);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('errors.UNKNOWN.title'));
    } finally {
      setBusy(false);
    }
  };

  if (!metadata || !project) {
    return <div className="project-page page">{error ?? t('common.loading')}</div>;
  }

  const overflowActions =
    showAdvancedTools && projectId
      ? [
          {
            id: 'metadata-import-export',
            label: t('bookMetadata.importExportInfo'),
            element: (
              <TabularImportExportDialog
                dataType="project_data"
                projectId={projectId}
                editionId={project.activeEditionId ?? undefined}
                variant="dropdown"
                onComplete={(msg) => {
                  setWorkbookMessage(msg);
                }}
              />
            ),
          },
        ]
      : [];

  return (
    <div className="project-page page page--compact-header">
      <ProjectSectionHeader
        title={t('bookMetadata.pageTitle')}
        helpArticleId="project-info"
        primaryAction={{
          id: 'edit',
          label: t('actions.edit'),
          variant: 'primary',
          onClick: () => {
            setEditOpen(true);
          },
        }}
        overflowActions={overflowActions}
      />

      {workbookMessage ? <p className="banner banner-info">{workbookMessage}</p> : null}
      {error ? <p className="banner banner-error">{error}</p> : null}

      <ProjectOverviewCards
        project={project}
        metadata={metadata}
        sourceHealthLabelKey={sourceHealthKey(project)}
        nextActions={nextActions}
      />

      <MetadataTextSections metadata={metadata} />

      <ProjectMetadataEditDrawer
        open={editOpen}
        metadata={metadata}
        busy={busy}
        onClose={() => {
          setEditOpen(false);
        }}
        onSave={(next) => {
          void save(next);
        }}
      />
    </div>
  );
}
