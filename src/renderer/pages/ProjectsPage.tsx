import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FolderOpen } from 'lucide-react';
import type { JobDto } from '@shared/schemas/job';
import type { ProjectDto } from '@shared/schemas/import';
import { isJobActive } from '@shared/utils/job-progress';
import { CreateProjectWizard } from '../components/CreateProjectWizard';
import { ImportWizard } from '../components/ImportWizard';
import { ModalPortal } from '../components/overlay';
import { useT } from '../i18n';
import { EmptyState, Dialog, Skeleton } from '../components/ui';
import { useUiShellStore } from '../stores/ui-shell-store';
import { confirmDangerous } from '../utils/confirm-dangerous';
import { ProjectsPageHeader } from '../features/projects/ProjectsPageHeader';
import { ProjectsToolbar } from '../features/projects/ProjectsToolbar';
import { ProjectGridCard, ProjectListItem } from '../features/projects/ProjectCard';
import {
  resolveProjectDisplayState,
  sortProjectsByProgress,
} from '../features/projects/project-status';

export function ProjectsPage() {
  const t = useT();
  const navigate = useNavigate();
  const setCurrentProject = useUiShellStore((s) => s.setCurrentProject);
  const currentProjectId = useUiShellStore((s) => s.currentProjectId);
  const view = useUiShellStore((s) => s.projectsViewMode);
  const setProjectsViewMode = useUiShellStore((s) => s.setProjectsViewMode);
  const [projects, setProjects] = useState<ProjectDto[]>([]);
  const [jobs, setJobs] = useState<JobDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showLegacyImport, setShowLegacyImport] = useState(false);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<'updated' | 'name' | 'progress'>('updated');
  const [removeTarget, setRemoveTarget] = useState<ProjectDto | null>(null);
  const [deleting, setDeleting] = useState(false);

  const refresh = useCallback(async () => {
    const [projectRes, jobRes] = await Promise.all([
      window.khepreeNovelAI.projects.list(),
      window.khepreeNovelAI.jobs.list(undefined),
    ]);
    setProjects(projectRes.projects);
    setJobs(jobRes.jobs);
  }, []);

  useEffect(() => {
    void refresh()
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : t('errors.UNKNOWN.title'));
      })
      .finally(() => {
        setLoading(false);
      });
  }, [refresh, t]);

  const activeJobsByProject = useMemo(() => {
    const map = new Map<string, JobDto>();
    for (const job of jobs) {
      if (!isJobActive(job.state)) continue;
      const existing = map.get(job.projectId);
      if (!existing || job.updatedAt.localeCompare(existing.updatedAt) > 0) {
        map.set(job.projectId, job);
      }
    }
    return map;
  }, [jobs]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = projects.filter((p) => !q || p.title.toLowerCase().includes(q));
    list = [...list].sort((a, b) => {
      if (sort === 'name') return a.title.localeCompare(b.title, 'vi');
      if (sort === 'progress') return sortProjectsByProgress(a, b);
      return b.updatedAt.localeCompare(a.updatedAt);
    });
    return list;
  }, [projects, query, sort]);

  const summary = useMemo(() => {
    const chapterCount = projects.reduce((s, p) => s + (p.sourceChapterCount ?? 0), 0);
    let needsAttention = 0;
    let activeCount = 0;
    for (const project of projects) {
      const job = activeJobsByProject.get(project.id);
      const state = resolveProjectDisplayState(project, job);
      if (state.status === 'error' || state.status === 'needs_setup') {
        needsAttention += 1;
      }
      if (state.status === 'translating' || state.status === 'ready') {
        activeCount += 1;
      }
    }
    return {
      chapterCount,
      needsAttention,
      activeCount,
    };
  }, [projects, activeJobsByProject]);

  const openProject = (project: ProjectDto) => {
    setCurrentProject(project.id, project.title);
    navigate(`/projects/${project.id}`);
  };

  const continueTranslate = (project: ProjectDto) => {
    setCurrentProject(project.id, project.title);
    navigate(`/projects/${project.id}/translate`);
  };

  const handleRestoreBackup = () => {
    void (async () => {
      try {
        const pick = await window.khepreeNovelAI.portability.selectBackupPath();
        if (pick.canceled || !pick.filePath) return;
        const preview = await window.khepreeNovelAI.portability.previewRestore({
          archivePath: pick.filePath,
        });
        if (!preview.compatible) {
          setError(
            t('portability.restoreWarnings', {
              warnings: preview.warnings.join('; ') || 'incompatible',
            }),
          );
          return;
        }
        const ok = confirmDangerous(
          t('projects.restoreConfirm', {
            kind: preview.manifest.kind,
            title: preview.manifest.projectTitle ?? '—',
            version: String(preview.manifest.schemaVersion),
          }),
        );
        if (!ok) return;
        const result = await window.khepreeNovelAI.portability.restoreBackup({
          archivePath: pick.filePath,
          confirmOverwrite: true,
        });
        await refresh();
        if (result.requiresRestart) {
          setError(t('portability.restoreNeedsRestart'));
        }
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : t('portability.restoreFailed'));
      }
    })();
  };

  const confirmRemove = () => {
    if (!removeTarget) return;
    const project = removeTarget;
    setDeleting(true);
    void (async () => {
      try {
        await window.khepreeNovelAI.projects.delete(project.id);
        setRemoveTarget(null);
        setProjects((prev) => prev.filter((p) => p.id !== project.id));
        if (currentProjectId === project.id) {
          setCurrentProject(null, null);
        }
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : t('errors.UNKNOWN.title'));
        setRemoveTarget(null);
      } finally {
        setDeleting(false);
      }
    })();
  };

  const cardProps = {
    onOpenProject: openProject,
    onContinueTranslate: continueTranslate,
    onDelete: setRemoveTarget,
    onSetCurrentProject: setCurrentProject,
  };

  if (loading) {
    return (
      <div className="projects-page">
        <ProjectsPageHeader
          projectCount={0}
          chapterCount={0}
          needsAttentionCount={0}
          activeCount={0}
          onCreate={() => {
            setShowCreate(true);
          }}
          onImportLegacy={() => {
            setShowLegacyImport(true);
          }}
          onRestoreBackup={handleRestoreBackup}
        />
        <div className="project-list">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} height={140} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="projects-page">
      <ProjectsPageHeader
        projectCount={projects.length}
        chapterCount={summary.chapterCount}
        needsAttentionCount={summary.needsAttention}
        activeCount={summary.activeCount}
        onCreate={() => {
          setShowCreate(true);
        }}
        onImportLegacy={() => {
          setShowLegacyImport(true);
        }}
        onRestoreBackup={handleRestoreBackup}
      />

      {error ? <div className="banner banner-error">{error}</div> : null}

      <ModalPortal
        open={showCreate}
        onBackdropClick={() => {
          setShowCreate(false);
        }}
        contentClassName="projects-wizard-modal"
      >
        <CreateProjectWizard
          onCancel={() => {
            setShowCreate(false);
          }}
          onComplete={async () => {
            setShowCreate(false);
            await refresh();
          }}
          onError={(message) => {
            setError(message);
          }}
        />
      </ModalPortal>

      <ModalPortal
        open={showLegacyImport}
        onBackdropClick={() => {
          setShowLegacyImport(false);
        }}
        contentClassName="projects-wizard-modal"
      >
        <ImportWizard
          onCancel={() => {
            setShowLegacyImport(false);
          }}
          onComplete={async () => {
            setShowLegacyImport(false);
            await refresh();
          }}
          onError={(message) => {
            setError(message);
          }}
        />
      </ModalPortal>

      {projects.length === 0 && !showCreate && !showLegacyImport ? (
        <EmptyState
          icon={<FolderOpen />}
          title={t('projects.emptyTitle')}
          description={t('projects.emptyDescNew')}
          actionLabel={t('actions.createProject')}
          onAction={() => {
            setShowCreate(true);
          }}
          secondaryActionLabel={t('actions.importOldProject')}
          onSecondaryAction={() => {
            setShowLegacyImport(true);
          }}
        />
      ) : (
        <>
          <ProjectsToolbar
            query={query}
            onQueryChange={setQuery}
            sort={sort}
            onSortChange={setSort}
            view={view}
            onViewChange={setProjectsViewMode}
          />

          {filtered.length === 0 ? (
            <EmptyState
              title={t('projects.searchEmptyTitle')}
              description={t('projects.searchEmptyDesc')}
              actionLabel={t('projects.clearSearch')}
              onAction={() => {
                setQuery('');
              }}
            />
          ) : (
            <div
              className={
                view === 'grid' ? 'project-grid projects-grid' : 'project-list projects-list'
              }
            >
              {filtered.map((project) => {
                const activeJob = activeJobsByProject.get(project.id);
                const isCurrent = currentProjectId === project.id;
                const shared = {
                  project,
                  activeJob,
                  isCurrent,
                  ...cardProps,
                };
                return view === 'list' ? (
                  <ProjectListItem key={project.id} {...shared} />
                ) : (
                  <ProjectGridCard key={project.id} {...shared} />
                );
              })}
            </div>
          )}
        </>
      )}

      <Dialog
        open={removeTarget !== null}
        title={t('projects.deleteConfirmTitle', {
          title: removeTarget?.title ?? '',
        })}
        description={t('projects.deleteConfirmBody')}
        confirmLabel={t('projects.deleteProject')}
        cancelLabel={t('actions.cancel')}
        danger
        busy={deleting}
        onConfirm={confirmRemove}
        onCancel={() => {
          if (!deleting) setRemoveTarget(null);
        }}
      />
    </div>
  );
}
