import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Users } from 'lucide-react';
import type { ProjectDto } from '@shared/schemas/import';
import type {
  CharacterDto,
  MemoryConflictDto,
  RelationshipDto,
  StoryStateDto,
} from '@shared/schemas/memory';
import { CHARACTER_STATUSES } from '@shared/constants/memory';
import { useT } from '../i18n';
import { friendlyError } from '../i18n/errors';
import { characterStatusLabel } from '../i18n/enums';
import {
  PageHeader,
  Button,
  Tabs,
  TabPanel,
  EmptyState,
  DataTable,
  Select,
  Card,
  SectionHeader,
  ErrorPanel,
  Skeleton,
} from '../components/ui';
import { HelpContextButton } from '../features/help/HelpContextButton';
import { TabularImportExportDialog } from '../components/TabularImportExportDialog';
import { helpArticleForErrorCode } from '../features/help/content';
import { useUiShellStore } from '../stores/ui-shell-store';

type Tab = 'characters' | 'relationships' | 'story' | 'conflicts';

export function CharactersPage() {
  const t = useT();
  const { projectId: routeProjectId } = useParams();
  const storeProjectId = useUiShellStore((s) => s.currentProjectId) ?? '';
  const [projects, setProjects] = useState<ProjectDto[]>([]);
  const [projectId, setProjectId] = useState(routeProjectId ?? storeProjectId);
  const [tab, setTab] = useState<Tab>('characters');
  const [characters, setCharacters] = useState<CharacterDto[]>([]);
  const [relationships, setRelationships] = useState<RelationshipDto[]>([]);
  const [storyState, setStoryState] = useState<StoryStateDto | null>(null);
  const [conflicts, setConflicts] = useState<MemoryConflictDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (routeProjectId) setProjectId(routeProjectId);
  }, [routeProjectId]);

  useEffect(() => {
    void window.novelTrans.projects
      .list()
      .then((result) => {
        setProjects(result.projects);
        if (routeProjectId) {
          setProjectId(routeProjectId);
          return;
        }
        setProjectId((prev) => prev || result.projects[0]?.id || '');
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : t('errors.UNKNOWN.title'));
      })
      .finally(() => {
        setLoading(false);
      });
  }, [t, routeProjectId]);

  const refresh = useCallback(async () => {
    if (!projectId) return;
    const [charResult, relResult, storyResult, conflictResult] = await Promise.all([
      window.novelTrans.memory.listCharacters(projectId),
      window.novelTrans.memory.listRelationships({ projectId }),
      window.novelTrans.memory.getStoryState(projectId),
      window.novelTrans.memory.listConflicts(projectId),
    ]);
    setCharacters(charResult.characters);
    setRelationships(relResult.relationships);
    setStoryState(storyResult.storyState);
    setConflicts(conflictResult.conflicts);
  }, [projectId]);

  useEffect(() => {
    if (!projectId) return;
    void refresh().catch((err: unknown) => {
      setError(err instanceof Error ? err.message : t('errors.UNKNOWN.title'));
    });
  }, [projectId, refresh, t]);

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await action();
      await refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('errors.UNKNOWN.title'));
    } finally {
      setBusy(false);
    }
  };

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === projectId) ?? null,
    [projects, projectId],
  );

  if (loading) {
    return (
      <div>
        <PageHeader title={t('characters.title')} description={t('characters.subtitle')} />
        <Skeleton height={240} />
      </div>
    );
  }

  const errInfo = error ? friendlyError(error) : null;

  const characterColumns = [
    {
      key: 'sourceName',
      header: t('characters.sourceName'),
      render: (c: CharacterDto) => c.canonicalSourceName ?? c.canonicalName,
    },
    {
      key: 'targetName',
      header: t('characters.targetName'),
      render: (c: CharacterDto) => c.preferredTargetName ?? c.translatedName ?? '—',
    },
    {
      key: 'role',
      header: t('characters.role'),
      render: (c: CharacterDto) => c.role ?? '—',
    },
    {
      key: 'chapters',
      header: t('characters.chapters'),
      render: (c: CharacterDto) =>
        `${c.firstChapter ?? '?'}–${c.lastChapter ?? '?'}`,
    },
    {
      key: 'status',
      header: t('characters.status'),
      render: (c: CharacterDto) => (
        <span className="nt-badge">
          <span
            className={`nt-status-dot nt-status-dot--${
              c.status === 'active' ? 'ready' : c.status === 'deceased' ? 'paused' : 'waiting'
            }`}
            aria-hidden
          />
          {characterStatusLabel(c.status)}
        </span>
      ),
    },
    {
      key: 'locked',
      header: t('characters.locked'),
      render: (c: CharacterDto) => (
        <Button
          size="sm"
          disabled={busy}
          onClick={() => {
            void run(async () => {
              await window.novelTrans.memory.upsertCharacter({
                id: c.id,
                projectId,
                canonicalName: c.canonicalName,
                locked: !c.locked,
              });
            });
          }}
        >
          {c.locked ? t('characters.unlock') : t('characters.lock')}
        </Button>
      ),
    },
  ];

  const relationshipColumns = [
    {
      key: 'from',
      header: t('characters.from'),
      render: (r: RelationshipDto) => r.fromName,
    },
    {
      key: 'to',
      header: t('characters.to'),
      render: (r: RelationshipDto) => r.toName,
    },
    {
      key: 'type',
      header: t('characters.relType'),
      render: (r: RelationshipDto) => r.relationshipType,
    },
    {
      key: 'valid',
      header: t('characters.validChapters'),
      render: (r: RelationshipDto) =>
        `${r.validFromChapter ?? '?'}–${r.validToChapter ?? '∞'}`,
    },
    {
      key: 'calls',
      header: t('characters.calls'),
      render: (r: RelationshipDto) => `${r.aCallsB ?? '—'} / ${r.bCallsA ?? '—'}`,
    },
  ];

  const conflictColumns = [
    {
      key: 'entity',
      header: t('characters.entity'),
      render: (c: MemoryConflictDto) =>
        `${c.entityType}${c.entityId ? ` (${c.entityId.slice(0, 8)})` : ''}`,
    },
    {
      key: 'field',
      header: t('characters.field'),
      render: (c: MemoryConflictDto) => c.fieldKey,
    },
    {
      key: 'existing',
      header: t('characters.existing'),
      render: (c: MemoryConflictDto) => c.existingValue ?? '—',
    },
    {
      key: 'proposed',
      header: t('characters.proposed'),
      render: (c: MemoryConflictDto) => c.proposedValue ?? '—',
    },
    {
      key: 'actions',
      header: t('jobs.actions'),
      render: (c: MemoryConflictDto) => (
        <div className="btn-row">
          <Button
            size="sm"
            disabled={busy}
            onClick={() => {
              void run(async () => {
                await window.novelTrans.memory.resolveConflict({
                  conflictId: c.id,
                  status: 'RESOLVED',
                });
              });
            }}
          >
            {t('characters.resolve')}
          </Button>
          <Button
            size="sm"
            disabled={busy}
            onClick={() => {
              void run(async () => {
                await window.novelTrans.memory.resolveConflict({
                  conflictId: c.id,
                  status: 'DISCARDED',
                });
              });
            }}
          >
            {t('characters.discard')}
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title={t('characters.title')}
        description={t('characters.subtitle')}
        actions={
          <>
            <HelpContextButton articleId="characters" />
            {routeProjectId ? null : (
              <Select
                value={projectId}
                onChange={(event) => {
                  setProjectId(event.target.value);
                }}
                aria-label={t('translation.selectProject')}
              >
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.title}
                  </option>
                ))}
              </Select>
            )}
            {selectedProject ? (
              <TabularImportExportDialog
                dataType="characters"
                projectId={selectedProject.id}
                editionId={selectedProject.activeEditionId ?? undefined}
                onComplete={(msg) => setMessage(msg)}
              />
            ) : null}
          </>
        }
      />

      {!selectedProject ? (
        <EmptyState
          icon={<Users />}
          title={t('characters.emptyTitle')}
          description={t('characters.emptyProject')}
        />
      ) : (
        <>
          <Tabs
            items={[
              { id: 'characters', label: t('characters.tabCharacters') },
              { id: 'relationships', label: t('characters.tabRelationships') },
              { id: 'story', label: t('characters.tabStory') },
              {
                id: 'conflicts',
                label: t('characters.tabConflicts', { count: conflicts.length }),
              },
            ]}
            value={tab}
            onChange={(id) => {
              setTab(id as Tab);
            }}
          />

          {errInfo ? (
            <ErrorPanel
              title={errInfo.title}
              description={errInfo.description}
              technical={errInfo.technical}
              helpArticleId={helpArticleForErrorCode(errInfo.code)}
            />
          ) : null}
          {message ? <div className="banner banner-info">{message}</div> : null}

          <TabPanel active={tab === 'characters'}>
            <div className="toolbar" style={{ margin: '0.75rem 0' }}>
              <Button
                variant="primary"
                disabled={busy}
                onClick={() => {
                  void run(async () => {
                    await window.novelTrans.memory.upsertCharacter({
                      projectId,
                      canonicalName: '新角色',
                      translatedName: 'Nhân vật mới',
                      status: 'active',
                    });
                    setMessage(t('characters.created'));
                  });
                }}
              >
                {t('characters.addCharacter')}
              </Button>
            </div>
            {characters.length === 0 ? (
              <EmptyState
                icon={<Users />}
                title={t('characters.emptyTitle')}
                description={t('characters.emptyDesc')}
              />
            ) : (
              <DataTable
                columns={characterColumns}
                rows={characters}
                rowKey={(row) => row.id}
              />
            )}
          </TabPanel>

          <TabPanel active={tab === 'relationships'}>
            {relationships.length === 0 ? (
              <EmptyState
                title={t('characters.emptyRelationships')}
                description={t('characters.emptyRelationshipsDesc')}
              />
            ) : (
              <DataTable
                columns={relationshipColumns}
                rows={relationships}
                rowKey={(row) => row.id}
              />
            )}
          </TabPanel>

          <TabPanel active={tab === 'story'}>
            {storyState ? (
              <Card as="section" style={{ marginTop: '0.75rem' }}>
                <SectionHeader title={t('characters.tabStory')} />
                <p>
                  <strong>{t('characters.chapter')}:</strong>{' '}
                  {storyState.currentChapterNumber ?? '—'}
                </p>
                <p>
                  <strong>{t('characters.summary')}:</strong>{' '}
                  {storyState.summaryText ?? '—'}
                </p>
                <p>
                  <strong>{t('characters.cultivation')}:</strong>{' '}
                  {storyState.cultivationState
                    ? JSON.stringify(storyState.cultivationState)
                    : '—'}
                </p>
                <p>
                  <strong>{t('characters.location')}:</strong>{' '}
                  {storyState.locationState
                    ? JSON.stringify(storyState.locationState)
                    : '—'}
                </p>
                <p>
                  <strong>{t('characters.items')}:</strong>{' '}
                  {storyState.importantItems
                    ? JSON.stringify(storyState.importantItems)
                    : '—'}
                </p>
                <p>
                  <strong>{t('characters.openPlots')}:</strong>{' '}
                  {storyState.unresolvedPlotPoints?.join('; ') ?? '—'}
                </p>
                <Button
                  disabled={busy}
                  onClick={() => {
                    void run(async () => {
                      await window.novelTrans.memory.patchStoryState({
                        projectId,
                        summaryText: storyState.summaryText ?? t('charactersExtra.updatedSummary'),
                        locked: !storyState.locked,
                      });
                    });
                  }}
                >
                  {storyState.locked
                    ? t('characters.unlockStory')
                    : t('characters.lockStory')}
                </Button>
              </Card>
            ) : (
              <EmptyState title={t('common.noData')} />
            )}
          </TabPanel>

          <TabPanel active={tab === 'conflicts'}>
            {conflicts.length === 0 ? (
              <EmptyState title={t('characters.noConflicts')} />
            ) : (
              <DataTable
                columns={conflictColumns}
                rows={conflicts}
                rowKey={(row) => row.id}
              />
            )}
          </TabPanel>
        </>
      )}

      <p className="muted" style={{ marginTop: '1rem' }}>
        {t('characters.statusValues', {
          values: CHARACTER_STATUSES.map((s) => characterStatusLabel(s)).join(', '),
        })}
      </p>
    </div>
  );
}
