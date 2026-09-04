import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { Lock, MoreHorizontal, Users } from 'lucide-react';
import type { ProjectDto } from '@shared/schemas/import';
import type {
  CharacterDto,
  MemoryConflictDto,
  RelationshipDto,
  StoryStateDto,
} from '@shared/schemas/memory';
import { useT } from '../i18n';
import { confirmDangerous } from '../utils/confirm-dangerous';
import { friendlyError } from '../i18n/errors';
import { characterStatusLabel } from '../i18n/enums';
import {
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
  SearchInput,
  IconButton,
} from '../components/ui';
import { ProjectSectionHeader } from '../components/shell/ProjectSectionHeader';
import { TabularImportExportDialog } from '../components/TabularImportExportDialog';
import { DropdownMenu } from '../components/overlay';
import { helpArticleForErrorCode } from '../features/help/content';
import { useUiShellStore } from '../stores/ui-shell-store';
import { CharacterDetailDrawer } from '../features/characters/CharacterDetailDrawer';
import {
  CharacterConflictCard,
  conflictEntityLabel,
  conflictFieldLabel,
} from '../features/characters/CharacterConflictCard';
import { formatCharacterChapterRange } from '../features/characters/format-chapter-range';
import {
  detectDuplicateCharacterGroups,
  type DuplicateCharacterGroup,
} from '../features/characters/detect-duplicate-characters';

type Tab = 'characters' | 'relationships' | 'story' | 'conflicts';

export function CharactersPage() {
  const t = useT();
  const showAdvancedTools = useUiShellStore((s) => s.showAdvancedTools);
  const { projectId: routeProjectId = '' } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const storeProjectId = useUiShellStore((s) => s.currentProjectId) ?? '';
  const projectId = routeProjectId || storeProjectId;
  const [project, setProject] = useState<ProjectDto | null>(null);
  const [tab, setTab] = useState<Tab>('characters');
  const [characters, setCharacters] = useState<CharacterDto[]>([]);
  const [relationships, setRelationships] = useState<RelationshipDto[]>([]);
  const [storyState, setStoryState] = useState<StoryStateDto | null>(null);
  const [conflicts, setConflicts] = useState<MemoryConflictDto[]>([]);
  const [query, setQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [chapterFilter, setChapterFilter] = useState('');
  const [detailCharacter, setDetailCharacter] = useState<CharacterDto | null>(null);
  const [dismissedDupes, setDismissedDupes] = useState<Set<string>>(new Set());
  const [menuState, setMenuState] = useState<{ id: string; anchor: HTMLButtonElement } | null>(
    null,
  );
  const menuAnchorRef = useRef<HTMLButtonElement | null>(null);
  if (menuState) menuAnchorRef.current = menuState.anchor;
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  // Library search deep-link: /projects/:id/characters?characterId=<uuid>
  useEffect(() => {
    const characterId = searchParams.get('characterId')?.trim();
    if (!characterId || characters.length === 0) return;
    const match = characters.find((c) => c.id === characterId);
    if (match) {
      setDetailCharacter(match);
      setTab('characters');
      setQuery(match.canonicalName || match.translatedName || '');
    }
    const next = new URLSearchParams(searchParams);
    next.delete('characterId');
    setSearchParams(next, { replace: true });
  }, [characters, searchParams, setSearchParams]);

  const refresh = useCallback(async () => {
    if (!projectId) return;
    const [charResult, relResult, storyResult, conflictResult, projectRes] = await Promise.all([
      window.khepreeNovelAI.memory.listCharacters(projectId),
      window.khepreeNovelAI.memory.listRelationships({ projectId }),
      window.khepreeNovelAI.memory.getStoryState(projectId),
      window.khepreeNovelAI.memory.listConflicts(projectId),
      window.khepreeNovelAI.projects.get(projectId),
    ]);
    setCharacters(charResult.characters);
    setRelationships(relResult.relationships);
    setStoryState(storyResult.storyState);
    setConflicts(conflictResult.conflicts);
    setProject(projectRes.project);
  }, [projectId]);

  useEffect(() => {
    if (!projectId) {
      setLoading(false);
      return;
    }
    void refresh()
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : t('errors.UNKNOWN.title'));
      })
      .finally(() => { setLoading(false); });
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

  const duplicateGroups = useMemo(() => {
    return detectDuplicateCharacterGroups(characters).filter((g) => !dismissedDupes.has(g.id));
  }, [characters, dismissedDupes]);

  const attentionCount = conflicts.length + duplicateGroups.length;

  const roles = useMemo(() => {
    const set = new Set<string>();
    for (const c of characters) {
      if (c.role?.trim()) set.add(c.role.trim());
    }
    return [...set].sort();
  }, [characters]);

  const filteredCharacters = useMemo(() => {
    const q = query.trim().toLowerCase();
    const chapterNum = chapterFilter.trim() ? Number(chapterFilter) : null;
    return characters.filter((c) => {
      if (roleFilter && (c.role ?? '') !== roleFilter) return false;
      if (statusFilter && c.status !== statusFilter) return false;
      if (chapterNum != null && !Number.isNaN(chapterNum)) {
        const lo = c.firstChapter ?? 0;
        const hi = c.lastChapter ?? 0;
        if (chapterNum < lo || chapterNum > hi) return false;
      }
      if (!q) return true;
      const hay = [
        c.canonicalSourceName ?? c.canonicalName,
        c.preferredTargetName ?? c.translatedName ?? '',
        ...c.aliases,
      ]
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [characters, query, roleFilter, statusFilter, chapterFilter]);

  const menuCharacter = menuState
    ? characters.find((c) => c.id === menuState.id) ?? null
    : null;

  const mergeDuplicates = (group: DuplicateCharacterGroup) => {
    const ok = confirmDangerous(t('characters.mergeConfirm', { name: group.translatedName }));
    if (!ok) return;
    const [keep, ...rest] = group.characters;
    void run(async () => {
      const aliases = new Set(keep.aliases);
      for (const other of rest) {
        aliases.add(other.canonicalSourceName ?? other.canonicalName);
        for (const a of other.aliases) aliases.add(a);
      }
      await window.khepreeNovelAI.memory.upsertCharacter({
        id: keep.id,
        projectId,
        canonicalName: keep.canonicalName,
        translatedName: keep.translatedName,
        aliases: [...aliases],
        role: keep.role,
        description: keep.description,
        locked: keep.locked,
      });
      setMessage(t('characters.mergeOk'));
      setDismissedDupes((prev) => new Set(prev).add(group.id));
    });
  };

  if (loading) {
    return (
      <div className="project-page">
        <ProjectSectionHeader title={t('characters.title')} description={t('characters.subtitle')} />
        <Skeleton height={240} />
      </div>
    );
  }

  const errInfo = error ? friendlyError(error) : null;
  const subtitle = t('characters.subtitleCount', { count: characters.length });

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
      header: t('characters.appearance'),
      render: (c: CharacterDto) => {
        const range = formatCharacterChapterRange(c.firstChapter, c.lastChapter);
        return range.isSingle
          ? t('characters.chapterSingle', { n: range.compact })
          : range.compact;
      },
    },
    {
      key: 'status',
      header: t('characters.status'),
      render: (c: CharacterDto) => characterStatusLabel(c.status),
    },
    {
      key: 'locked',
      header: '',
      width: '2.5rem',
      render: (c: CharacterDto) => (
        <IconButton
          label={c.locked ? t('characters.unlock') : t('characters.lock')}
          onClick={(e) => {
            e.stopPropagation();
            void run(async () => {
              await window.khepreeNovelAI.memory.upsertCharacter({
                id: c.id,
                projectId,
                canonicalName: c.canonicalName,
                locked: !c.locked,
              });
            });
          }}
        >
          <Lock size={14} className={c.locked ? 'char-lock-on' : 'char-lock-off'} />
        </IconButton>
      ),
    },
    {
      key: 'actions',
      header: '',
      width: '2.5rem',
      render: (c: CharacterDto) => (
        <IconButton
          label={t('common.moreActions')}
          onClick={(e) => {
            e.stopPropagation();
            setMenuState({ id: c.id, anchor: e.currentTarget });
          }}
        >
          <MoreHorizontal size={16} />
        </IconButton>
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
  ];

  return (
    <div className="project-page characters-page">
      <ProjectSectionHeader
        title={t('characters.title')}
        description={subtitle}
        helpArticleId="characters"
        primaryAction={{
          id: 'add-character',
          label: t('characters.addCharacter'),
          variant: 'primary',
          disabled: busy || !projectId,
          onClick: () => {
            void run(async () => {
              await window.khepreeNovelAI.memory.upsertCharacter({
                projectId,
                canonicalName: '新角色',
                translatedName: 'Nhân vật mới',
                status: 'active',
              });
              setMessage(t('characters.created'));
            });
          },
        }}
        secondaryAction={
          project ? (
            <TabularImportExportDialog
              dataType="characters"
              projectId={project.id}
              editionId={project.activeEditionId ?? undefined}
              variant="dropdown"
              onComplete={setMessage}
            />
          ) : undefined
        }
      />

      {!projectId ? (
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
                label: t('characters.tabNeedsAttention', { count: attentionCount }),
              },
            ]}
            value={tab}
            onChange={(id) => { setTab(id as Tab); }}
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
            <div className="characters-toolbar">
              <SearchInput
                placeholder={t('characters.searchPlaceholder')}
                value={query}
                onChange={(e) => { setQuery(e.target.value); }}
              />
              <Select
                value={roleFilter}
                aria-label={t('characters.role')}
                onChange={(e) => { setRoleFilter(e.target.value); }}
              >
                <option value="">{t('characters.allRoles')}</option>
                {roles.map((role) => (
                  <option key={role} value={role}>
                    {role}
                  </option>
                ))}
              </Select>
              <Select
                value={statusFilter}
                aria-label={t('characters.status')}
                onChange={(e) => { setStatusFilter(e.target.value); }}
              >
                <option value="">{t('characters.allStatuses')}</option>
                <option value="active">{characterStatusLabel('active')}</option>
                <option value="deceased">{characterStatusLabel('deceased')}</option>
                <option value="unknown">{characterStatusLabel('unknown')}</option>
              </Select>
              <input
                className="nt-input characters-chapter-filter"
                type="number"
                min={1}
                placeholder={t('characters.chapterFilterPlaceholder')}
                value={chapterFilter}
                onChange={(e) => { setChapterFilter(e.target.value); }}
              />
            </div>
            {filteredCharacters.length === 0 ? (
              <EmptyState
                icon={<Users />}
                title={t('characters.emptyTitle')}
                description={
                  showAdvancedTools ? t('characters.emptyDescAdvanced') : t('characters.emptyDesc')
                }
                actionLabel={t('characters.addCharacter')}
                onAction={() => {
                  void run(async () => {
                    await window.khepreeNovelAI.memory.upsertCharacter({
                      projectId,
                      canonicalName: '新角色',
                      translatedName: 'Nhân vật mới',
                      status: 'active',
                    });
                    setMessage(t('characters.created'));
                  });
                }}
              />
            ) : (
              <DataTable
                columns={characterColumns}
                rows={filteredCharacters}
                rowKey={(row) => row.id}
                onRowClick={(row) => { setDetailCharacter(row); }}
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
              <Card as="section" className="story-state-card">
                <SectionHeader title={t('characters.tabStory')} />
                <p>
                  <strong>{t('characters.chapter')}:</strong>{' '}
                  {storyState.currentChapterNumber ?? '—'}
                </p>
                <p>
                  <strong>{t('characters.summary')}:</strong>{' '}
                  {storyState.summaryText ?? t('bookMetadata.emptyValue')}
                </p>
                {!showAdvancedTools ? null : (
                  <>
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
                  </>
                )}
                <p>
                  <strong>{t('characters.openPlots')}:</strong>{' '}
                  {storyState.unresolvedPlotPoints?.join('; ') ?? '—'}
                </p>
              </Card>
            ) : (
              <EmptyState title={t('common.noData')} description={t('characters.emptyStoryDesc')} />
            )}
          </TabPanel>

          <TabPanel active={tab === 'conflicts'}>
            {conflicts.length === 0 && duplicateGroups.length === 0 ? (
              <EmptyState title={t('characters.noConflicts')} />
            ) : (
              <div className="conflicts-stack">
                {duplicateGroups.map((group) => (
                  <div key={group.id} className="card duplicate-suggestion">
                    <p>
                      <strong>{t('characters.duplicateMaybe')}</strong>{' '}
                      {group.characters
                        .map((c) => c.canonicalSourceName ?? c.canonicalName)
                        .join(' · ')}
                    </p>
                    <p className="muted">
                      {t('characters.duplicateSameTarget', { name: group.translatedName })}
                    </p>
                    <div className="btn-row">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => { setDetailCharacter(group.characters[0]); }}
                      >
                        {t('characters.compare')}
                      </Button>
                      <Button
                        size="sm"
                        variant="primary"
                        disabled={busy}
                        onClick={() => { mergeDuplicates(group); }}
                      >
                        {t('characters.merge')}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          { setDismissedDupes((prev) => new Set(prev).add(group.id)); }
                        }
                      >
                        {t('characters.dismiss')}
                      </Button>
                    </div>
                  </div>
                ))}
                {conflicts.map((conflict) => (
                  <CharacterConflictCard
                    key={conflict.id}
                    conflict={conflict}
                    entityLabel={conflictEntityLabel(conflict.entityType, t)}
                    fieldLabel={conflictFieldLabel(conflict.fieldKey, t)}
                    busy={busy}
                    onKeep={() => {
                      void run(async () => {
                        await window.khepreeNovelAI.memory.resolveConflict({
                          conflictId: conflict.id,
                          status: 'DISCARDED',
                        });
                      });
                    }}
                    onUseNew={() => {
                      void run(async () => {
                        await window.khepreeNovelAI.memory.resolveConflict({
                          conflictId: conflict.id,
                          status: 'RESOLVED',
                        });
                      });
                    }}
                  />
                ))}
              </div>
            )}
          </TabPanel>
        </>
      )}

      <CharacterDetailDrawer
        open={detailCharacter != null}
        busy={busy}
        projectId={projectId}
        character={detailCharacter}
        onClose={() => { setDetailCharacter(null); }}
        onSaved={() => {
          setDetailCharacter(null);
          void refresh();
        }}
        onError={setError}
      />

      {menuCharacter && menuAnchorRef.current ? (
        <DropdownMenu
          open={menuState != null}
          onOpenChange={(open) => {
            if (!open) setMenuState(null);
          }}
          anchorRef={menuAnchorRef}
          className="translation-menu"
          placement="bottom-end"
          minWidth={180}
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setMenuState(null);
              setDetailCharacter(menuCharacter);
            }}
          >
            {t('actions.edit')}
          </button>
        </DropdownMenu>
      ) : null}
    </div>
  );
}
