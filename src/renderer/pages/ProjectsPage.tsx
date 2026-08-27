import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FolderOpen, LayoutGrid, List } from 'lucide-react';
import type { ProjectDto } from '@shared/schemas/import';
import { CreateProjectWizard } from '../components/CreateProjectWizard';
import { ImportWizard } from '../components/ImportWizard';
import { useT } from '../i18n';
import { statusLabel } from '../i18n/status';
import {
  PageHeader,
  Button,
  SearchInput,
  Select,
  EmptyState,
  Card,
  ProgressBar,
  Badge,
  IconButton,
  Skeleton,
  Dialog,
} from '../components/ui';
import { useUiShellStore } from '../stores/ui-shell-store';
import { HelpContextButton } from '../features/help/HelpContextButton';
import { confirmDangerous } from '../utils/confirm-dangerous';
import { LanguagePairLabel } from '../components/LanguagePairLabel';

type SortKey = 'updated' | 'name' | 'progress';
type ViewMode = 'grid' | 'list';

export function ProjectsPage() {
  const t = useT();
  const navigate = useNavigate();
  const setCurrentProject = useUiShellStore((s) => s.setCurrentProject);
  const currentProjectId = useUiShellStore((s) => s.currentProjectId);
  const [projects, setProjects] = useState<ProjectDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showLegacyImport, setShowLegacyImport] = useState(false);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortKey>('updated');
  const [view, setView] = useState<ViewMode>('grid');
  const [removeTarget, setRemoveTarget] = useState<ProjectDto | null>(null);
  const [deleting, setDeleting] = useState(false);

  const refresh = useCallback(async () => {
    const result = await window.novelTrans.projects.list();
    setProjects(result.projects);
  }, []);

  useEffect(() => {
    void refresh()
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : t('errors.UNKNOWN.title'));
      })
      .finally(() => { setLoading(false); });
  }, [refresh, t]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = projects.filter((p) => !q || p.title.toLowerCase().includes(q));
    list = [...list].sort((a, b) => {
      if (sort === 'name') return a.title.localeCompare(b.title, 'vi');
      if (sort === 'progress') return (b.sourceChapterCount ?? 0) - (a.sourceChapterCount ?? 0);
      return b.updatedAt.localeCompare(a.updatedAt);
    });
    return list;
  }, [projects, query, sort]);

  const openProject = (project: ProjectDto) => {
    setCurrentProject(project.id, project.title);
    navigate(`/projects/${project.id}`);
  };

  const confirmRemove = () => {
    if (!removeTarget) return;
    const project = removeTarget;
    setDeleting(true);
    void (async () => {
      try {
        await window.novelTrans.projects.delete(project.id);
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

  if (loading) {
    return (
      <div>
        <PageHeader title={t('projects.title')} />
        <div className="project-grid">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} height={160} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title={t('projects.title')}
        description={t('projects.subtitle')}
        actions={
          <>
            <HelpContextButton articleId="import-novel" />
            <Button variant="primary" onClick={() => { setShowCreate(true); }}>
              {t('actions.createProject')}
            </Button>
            <Button onClick={() => { setShowLegacyImport(true); }}>
              {t('actions.importLegacy')}
            </Button>
            <Button
              onClick={() => {
                void (async () => {
                  try {
                    const pick = await window.novelTrans.portability.selectBackupPath();
                    if (pick.canceled || !pick.filePath) return;
                    const preview = await window.novelTrans.portability.previewRestore({
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
                      `${preview.manifest.kind} · ${preview.manifest.projectTitle ?? '—'} · schema v${preview.manifest.schemaVersion}\n\nRestore?`,
                    );
                    if (!ok) return;
                    const result = await window.novelTrans.portability.restoreBackup({
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
              }}
            >
              {t('actions.openBackup')}
            </Button>
          </>
        }
      />

      {error ? <div className="banner banner-error">{error}</div> : null}

      {showCreate ? (
        <CreateProjectWizard
          onCancel={() => { setShowCreate(false); }}
          onComplete={async () => {
            setShowCreate(false);
            await refresh();
          }}
          onError={(message) => { setError(message); }}
        />
      ) : null}

      {showLegacyImport ? (
        <ImportWizard
          onCancel={() => { setShowLegacyImport(false); }}
          onComplete={async () => {
            setShowLegacyImport(false);
            await refresh();
          }}
          onError={(message) => { setError(message); }}
        />
      ) : null}

      {projects.length === 0 && !showCreate && !showLegacyImport ? (
        <EmptyState
          icon={<FolderOpen />}
          title={t('projects.emptyTitle')}
          description={t('projects.emptyDesc')}
          actionLabel={t('actions.createProject')}
          onAction={() => { setShowCreate(true); }}
        />
      ) : (
        <>
          <div className="btn-row" style={{ marginBottom: '1rem' }}>
            <div style={{ flex: 1, maxWidth: 280 }}>
              <SearchInput
                placeholder={t('projects.searchPlaceholder')}
                value={query}
                onChange={(e) => { setQuery(e.target.value); }}
              />
            </div>
            <Select value={sort} onChange={(e) => { setSort(e.target.value as SortKey); }}>
              <option value="updated">{t('projects.sortUpdated')}</option>
              <option value="name">{t('projects.sortName')}</option>
              <option value="progress">{t('projects.sortProgress')}</option>
            </Select>
            <IconButton
              label={t('projects.viewGrid')}
              active={view === 'grid'}
              onClick={() => { setView('grid'); }}
            >
              <LayoutGrid size={16} />
            </IconButton>
            <IconButton
              label={t('projects.viewList')}
              active={view === 'list'}
              onClick={() => { setView('list'); }}
            >
              <List size={16} />
            </IconButton>
          </div>

          <div className={view === 'grid' ? 'project-grid' : 'project-list'}>
            {filtered.map((project) => {
              const total = project.sourceChapterCount ?? 0;
              const done = project.translatedChapterCount ?? 0;
              const pct = total > 0 ? Math.round((done / total) * 100) : 0;
              return (
                <Card key={project.id}>
                  <div className="page-header-row">
                    <div>
                      <h3 style={{ margin: 0 }}>{project.title}</h3>
                      <p className="muted" style={{ margin: '0.25rem 0 0' }}>
                        <LanguagePairLabel
                          sourceLanguage={project.sourceLanguage}
                          targetLanguage={project.targetLanguage}
                        />
                      </p>
                    </div>
                    <Badge tone="accent">{statusLabel(project.status)}</Badge>
                  </div>
                  <p style={{ margin: '0.75rem 0 0.35rem' }}>
                    {t('projects.totalChapters', {
                      done: String(done),
                      total: String(total),
                    })}
                  </p>
                  <ProgressBar value={pct} label={project.title} />
                  <p className="muted" style={{ fontSize: 'var(--font-small)', marginTop: '0.5rem' }}>
                    {t('projects.notebook')}:{' '}
                    {project.health?.notebook === 'ok'
                      ? t('projects.notebookConnected')
                      : project.health?.notebook === 'warn'
                        ? t('projects.notebookPending')
                        : t('projects.notebookMissing')}
                  </p>
                  <div className="project-card-actions">
                    <Button variant="secondary" onClick={() => { openProject(project); }}>
                      {t('actions.openProject')}
                    </Button>
                    <Button
                      onClick={() => {
                        setCurrentProject(project.id, project.title);
                        navigate(`/projects/${project.id}/translate`);
                      }}
                    >
                      {t('actions.continueTranslate')}
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() => {
                        setCurrentProject(project.id, project.title);
                        navigate(`/projects/${project.id}/ai-memory`);
                      }}
                    >
                      {t('projects.aiMemory')}
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() => {
                        setCurrentProject(project.id, project.title);
                        navigate(`/projects/${project.id}`);
                      }}
                    >
                      {t('actions.bookInfo')}
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() => {
                        setCurrentProject(project.id, project.title);
                        navigate(`/projects/${project.id}/chapters`);
                      }}
                    >
                      {t('actions.sourceFolder')}
                    </Button>
                    <Button
                      variant="danger"
                      disabled={deleting}
                      onClick={() => { setRemoveTarget(project); }}
                    >
                      {t('projects.deleteProject')}
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>
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
