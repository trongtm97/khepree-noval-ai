import { createHash } from 'node:crypto';
import type { DatabaseManager } from '../db/database-manager';
import {
  DEFAULT_NOTEBOOK_SETTINGS,
  KNOWLEDGE_FILE_NAMES,
  KNOWLEDGE_SIZE_CAPS,
  KNOWLEDGE_TYPES,
  type KnowledgeType,
} from '@shared/constants/knowledge';
import {
  buildSyncStateManifestContent,
  generateSyncNonce,
} from '@shared/constants/notebook-version-probe';
import { KNOWLEDGE_RESOURCE_KEYS } from '@shared/constants/knowledge';
import { getLanguageProfile } from '@shared/constants/language-profile';
import { OUTPUT_PROTOCOL_BLOCK } from '@shared/constants/translation-pack';
import type { TermRow } from '../db/repositories/term-repository';
import type { CharacterRow } from '../db/repositories/character-repository';
import type { RelationshipRow } from '../db/repositories/relationship-repository';
import {
  resolveCharacterPreferredName,
  resolveEditionMemoryContext,
  resolveRelationshipAddressTerms,
} from '../memory/edition-memory';
import {
  buildBudgetedDocument,
  type KnowledgeRecord,
} from './knowledge-budget-builder';
import {
  sortTermsForKnowledge,
  sortCharactersForKnowledge,
  sortRelationshipsForKnowledge,
  sortWorldKnowledgeKeys,
  type CharacterRankContext,
} from './knowledge-ranking';

export function hashKnowledgeContent(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

function loadStyleConfig(db: DatabaseManager, projectId: string): {
  rules: string[];
  criticalRules: string[];
  notebookInstructions?: string;
  notebookSettings?: Partial<typeof DEFAULT_NOTEBOOK_SETTINGS>;
} {
  const membership = db.fictionSeries.getVolumeByProject(projectId);
  const seriesStyleRows = membership
    ? db.fictionSeries.listStyleRules(membership.series_id)
    : [];
  const seriesCritical = seriesStyleRows
    .filter((r) => r.rule_kind === 'critical')
    .map((r) => `[series:critical] ${r.content}`);
  const seriesRules = seriesStyleRows
    .filter((r) => r.rule_kind !== 'critical')
    .map((r) => `[series:${r.rule_kind || 'style'}] ${r.content}`);

  const row = db
    .getConnection()
    .prepare(`SELECT style_config FROM project_settings WHERE project_id = ?`)
    .get(projectId) as { style_config: string | null } | undefined;

  const result = {
    rules: [...seriesRules],
    criticalRules: [...seriesCritical],
    notebookInstructions: undefined as string | undefined,
    notebookSettings: undefined as Partial<typeof DEFAULT_NOTEBOOK_SETTINGS> | undefined,
  };

  if (!row?.style_config) return result;
  try {
    const parsed = JSON.parse(row.style_config) as {
      rules?: string[];
      criticalRules?: string[];
      notebookInstructions?: string;
      notebook?: Partial<typeof DEFAULT_NOTEBOOK_SETTINGS>;
    };
    // Merge: series baseline + project overrides (do not discard series).
    if (Array.isArray(parsed.rules)) {
      result.rules = [...result.rules, ...parsed.rules.filter(Boolean)];
    }
    if (Array.isArray(parsed.criticalRules)) {
      result.criticalRules = [
        ...result.criticalRules,
        ...parsed.criticalRules.filter(Boolean),
      ];
    }
    if (parsed.notebookInstructions) result.notebookInstructions = parsed.notebookInstructions;
    if (parsed.notebook) result.notebookSettings = parsed.notebook;
  } catch {
    result.rules = [...result.rules, row.style_config];
  }
  return result;
}

export function loadNotebookSettings(
  db: DatabaseManager,
  projectId: string,
): typeof DEFAULT_NOTEBOOK_SETTINGS {
  const style = loadStyleConfig(db, projectId);
  return { ...DEFAULT_NOTEBOOK_SETTINGS, ...style.notebookSettings };
}

function resolveKnowledgeVersion(db: DatabaseManager, projectId: string): string {
  const version = db.knowledgeFiles.maxLocalVersion(projectId);
  if (version > 0) return String(version);
  return hashKnowledgeContent(projectId).slice(0, 12);
}

function resolveCurrentChapter(db: DatabaseManager, projectId: string): number | null {
  return db.storyStates.getByProject(projectId)?.current_chapter_number ?? null;
}

function termLine(term: TermRow, primary: string): string {
  return (
    `- ${term.source_text ?? term.source_simplified} → ${primary} (${term.term_type})` +
    (term.locked === 1 ? ' [LOCKED]' : '')
  );
}

function characterRecord(
  character: CharacterRow,
  aliases: string[],
  preferredName?: string | null,
  researchOnly = false,
): KnowledgeRecord {
  const lines: string[] = [`## ${character.canonical_name}`];
  if (!researchOnly && preferredName) lines.push(`Tên dịch: ${preferredName}`);
  if (character.gender) lines.push(`Giới tính: ${character.gender}`);
  if (character.role) lines.push(`Vai trò: ${character.role}`);
  if (aliases.length) lines.push(`Bí danh: ${aliases.join(', ')}`);
  if (character.description) lines.push(`Đặc điểm: ${character.description}`);
  lines.push(
    `Chương: ${character.first_chapter ?? '?'}–${character.last_chapter ?? '?'}`,
  );
  return { id: character.id, text: lines.join('\n') };
}

function relationshipRecord(
  rel: RelationshipRow,
  fromName: string,
  toName: string,
  address?: { aCallsB?: string | null; bCallsA?: string | null },
  researchOnly = false,
): KnowledgeRecord {
  const lines: string[] = [
    `## ${fromName} → ${toName}`,
    `Quan hệ: ${rel.relationship_type}`,
  ];
  if (!researchOnly) {
    const aCallsB = address?.aCallsB ?? rel.a_calls_b;
    const bCallsA = address?.bCallsA ?? rel.b_calls_a;
    if (aCallsB) lines.push(`Gọi: ${aCallsB}`);
    if (bCallsA) lines.push(`Được gọi: ${bCallsA}`);
  }
  if (rel.valid_from_chapter) lines.push(`Từ chương: ${rel.valid_from_chapter}`);
  if (rel.valid_to_chapter) lines.push(`Đến chương: ${rel.valid_to_chapter}`);
  if (rel.description) lines.push(`Mô tả: ${rel.description}`);
  return { id: rel.id, text: lines.join('\n') };
}

export type ProjectKnowledgeDocuments = Record<
  (typeof KNOWLEDGE_RESOURCE_KEYS)[
    | 'BOOK_PROFILE_MD'
    | 'RULES_MD'
    | 'PROJECT_TERMS_MD'
    | 'CHARACTERS_MD'
    | 'RELATIONSHIPS_MD'
    | 'STORY_STATE_MD'
    | 'WORLD_KNOWLEDGE_MD'
    | 'RECENT_CONTEXT_MD'
    | 'SYNC_STATE_MD'
  ],
  string
>;

export class NotebookKnowledgeBuilder {
  constructor(private readonly db: DatabaseManager) {}

  buildBookProfile(projectId: string): string {
    const project = this.db.projects.getById(projectId);
    if (!project) throw new Error(`Project not found: ${projectId}`);

    const records: KnowledgeRecord[] = [];
    const pushField = (id: string, block: string) => {
      if (block.trim()) records.push({ id, text: block });
    };

    const sourceTitle = project.source_title ?? project.title_cn;
    const targetTitle = project.target_title ?? project.title_vi ?? project.title;
    if (sourceTitle?.trim()) {
      pushField('source_title', `Tên gốc:\n${sourceTitle.trim()}`);
    }
    if (targetTitle.trim()) {
      pushField('target_title', `Tên dịch:\n${targetTitle.trim()}`);
    }
    let alternativeTitles: string[] = [];
    try {
      if (project.alternative_titles) {
        alternativeTitles = JSON.parse(project.alternative_titles) as string[];
      }
    } catch {
      alternativeTitles = [];
    }
    if (alternativeTitles.length > 0) {
      pushField(
        'alternative_titles',
        `Tên khác:\n${alternativeTitles.map((t) => `- ${t}`).join('\n')}`,
      );
    }
    const author = project.author_name ?? project.author_name_cn;
    if (author?.trim()) pushField('author', `Tác giả:\n${author.trim()}`);
    if (project.genre?.trim()) pushField('genre', `Thể loại:\n${project.genre.trim()}`);
    if (project.description?.trim()) {
      pushField('description', `## Mô tả\n\n${project.description.trim()}`);
    }
    if (project.official_summary?.trim()) {
      pushField(
        'official_summary',
        `## Tóm tắt chính thức\n\n${project.official_summary.trim()}`,
      );
    }
    if (project.notes?.trim()) {
      pushField('notes', `## Ghi chú quan trọng\n\n${project.notes.trim()}`);
    }

    return buildBudgetedDocument(records, {
      header: '# Thông tin truyện',
      charBudget: KNOWLEDGE_SIZE_CAPS.book_profile,
      unitLabel: 'sections',
      knowledgeVersion: resolveKnowledgeVersion(this.db, projectId),
      section: 'book_profile',
      emptyPlaceholder: '(chưa có thông tin truyện)',
    }).content;
  }

  buildTranslationRules(projectId: string): string {
    const project = this.db.projects.getById(projectId);
    if (!project) throw new Error(`Project not found: ${projectId}`);
    const style = loadStyleConfig(this.db, projectId);

    const staticHeader = [
      `# ${project.title} — Quy tắc dịch`,
      '',
      `Ngôn ngữ nguồn: ${getLanguageProfile(project.source_language).nativeName} (${project.source_language}).`,
      `Ngôn ngữ đích: ${getLanguageProfile(project.target_language).nativeName} (${project.target_language}).`,
      '',
      'Yêu cầu:',
      '- dịch đầy đủ, không tóm tắt, không bỏ nội dung',
      '- không tự thêm tình tiết; giữ Paragraph ID',
      '- ưu tiên thuật ngữ đã xác nhận / LOCKED',
      '- giữ xưng hô nhất quán; văn phong tự nhiên theo thể loại',
      '- không tự đổi tên nhân vật',
      '- When translating an earlier chapter, do not let information revealed in later chapters alter the meaning, knowledge, naming, relationships, or perspective of the earlier chapter.',
      '- Lexical consistency (character names, skill names) may use known terms; plot revelations must obey chapter timing.',
      '',
      'Ưu tiên khi xung đột:',
      '1. Translation Pack explicit instruction',
      '2. HOT MEMORY',
      '3. LOCKED PROJECT TERM',
      '4. Current Project Memory',
      '5. Notebook Knowledge',
      '6. Model general knowledge',
      '',
      'Output protocol:',
      OUTPUT_PROTOCOL_BLOCK,
    ].join('\n');

    const records: KnowledgeRecord[] = [];
    for (let i = 0; i < style.criticalRules.length; i += 1) {
      const rule = style.criticalRules[i];
      records.push({ id: `critical-${i}`, text: `- [CRITICAL] ${rule}` });
    }
    for (let i = 0; i < style.rules.length; i += 1) {
      const rule = style.rules[i];
      records.push({ id: `rule-${i}`, text: `- ${rule}` });
    }

    return buildBudgetedDocument(records, {
      header: staticHeader,
      charBudget: KNOWLEDGE_SIZE_CAPS.translation_rules,
      unitLabel: 'rules',
      knowledgeVersion: resolveKnowledgeVersion(this.db, projectId),
      section: 'translation_rules',
    }).content;
  }

  buildProjectTerms(projectId: string): string {
    const project = this.db.projects.getById(projectId);
    if (!project) throw new Error(`Project not found: ${projectId}`);

    const termRows = sortTermsForKnowledge(this.db.terms.listForProjectKnowledge(projectId));
    const records: KnowledgeRecord[] = [];

    for (const term of termRows) {
      if (term.scope === 'PROJECT' && term.scope_ref !== projectId) continue;
      if (term.scope === 'CHAPTER' && term.scope_ref) {
        // chapter-scoped terms included only when rebuilding full project knowledge
      }
      const translations = this.db.terms.listTranslations(term.id);
      const primary = translations.find((t) => t.is_primary === 1)?.target_text ?? '?';
      const provenance =
        term.scope === 'SERIES'
          ? `[series:${term.scope_ref}] `
          : term.scope === 'GLOBAL'
            ? '[global] '
            : term.scope === 'GENRE'
              ? '[genre] '
              : '';
      records.push({
        id: term.id,
        text: `${provenance}${termLine(term, primary)}`,
      });
    }

    return buildBudgetedDocument(records, {
      header: `# ${project.title} — Thuật ngữ`,
      charBudget: KNOWLEDGE_SIZE_CAPS.project_terms,
      unitLabel: 'terms',
      knowledgeVersion: resolveKnowledgeVersion(this.db, projectId),
      section: 'project_terms',
      emptyPlaceholder: '(chưa có thuật ngữ dự án)',
    }).content;
  }

  buildCharacters(
    projectId: string,
    options?: { editionId?: string; researchOnly?: boolean },
  ): string {
    const project = this.db.projects.getById(projectId);
    if (!project) throw new Error(`Project not found: ${projectId}`);

    const researchOnly = options?.researchOnly === true;
    const edition = researchOnly
      ? null
      : resolveEditionMemoryContext(this.db, projectId, options?.editionId);

    const currentChapter = resolveCurrentChapter(this.db, projectId);
    const settings = loadNotebookSettings(this.db, projectId);
    const ctx: CharacterRankContext = {
      currentChapter,
      recentWindowFrom:
        currentChapter != null
          ? Math.max(1, currentChapter - settings.recentContextChapters)
          : null,
    };

    const sorted = sortCharactersForKnowledge(
      this.db.characters.listByProject(projectId),
      ctx,
    );
    const records = sorted.map((character) =>
      characterRecord(
        character,
        this.db.characters.listAliases(character.id).map((a) => a.alias),
        edition
          ? resolveCharacterPreferredName(this.db, character, edition.editionId)
          : null,
        researchOnly,
      ),
    );

    return buildBudgetedDocument(records, {
      header: `# ${project.title} — Nhân vật`,
      charBudget: KNOWLEDGE_SIZE_CAPS.characters,
      unitLabel: 'characters',
      knowledgeVersion: resolveKnowledgeVersion(this.db, projectId),
      section: 'characters',
      emptyPlaceholder: '(chưa có nhân vật)',
    }).content;
  }

  buildRelationships(
    projectId: string,
    options?: { editionId?: string; researchOnly?: boolean },
  ): string {
    const project = this.db.projects.getById(projectId);
    if (!project) throw new Error(`Project not found: ${projectId}`);

    const researchOnly = options?.researchOnly === true;
    const edition = researchOnly
      ? null
      : resolveEditionMemoryContext(this.db, projectId, options?.editionId);

    const currentChapter = resolveCurrentChapter(this.db, projectId);
    const sorted = sortRelationshipsForKnowledge(
      this.db.relationships.listByProject(projectId),
      currentChapter,
    );

    const records: KnowledgeRecord[] = sorted.map((rel) => {
      const from = this.db.characters.getById(rel.from_character_id);
      const to = this.db.characters.getById(rel.to_character_id);
      const address =
        edition != null
          ? resolveRelationshipAddressTerms(this.db, rel, edition.editionId)
          : undefined;
      return relationshipRecord(
        rel,
        from?.canonical_name ?? rel.from_character_id,
        to?.canonical_name ?? rel.to_character_id,
        address,
        researchOnly,
      );
    });

    return buildBudgetedDocument(records, {
      header: `# ${project.title} — Quan hệ`,
      charBudget: KNOWLEDGE_SIZE_CAPS.relationships,
      unitLabel: 'relationships',
      knowledgeVersion: resolveKnowledgeVersion(this.db, projectId),
      section: 'relationships',
      emptyPlaceholder: '(chưa có quan hệ)',
    }).content;
  }

  buildStoryState(projectId: string): string {
    const project = this.db.projects.getById(projectId);
    if (!project) throw new Error(`Project not found: ${projectId}`);
    const storyRow = this.db.storyStates.getByProject(projectId);
    const story = storyRow ? this.db.storyStates.parseStructured(storyRow) : {};

    const records: KnowledgeRecord[] = [];
    records.push({
      id: 'current-chapter',
      text: `Chương đã xử lý gần nhất: ${story.currentChapterNumber ?? '(chưa có)'}`,
    });
    if (story.summaryText) {
      records.push({
        id: 'summary',
        text: `## Tóm tắt trạng thái hiện tại\n${story.summaryText}`,
      });
    }
    if (story.locationState) {
      records.push({
        id: 'location',
        text: `## Vị trí\n${JSON.stringify(story.locationState, null, 2)}`,
      });
    }
    if (story.cultivationState) {
      records.push({
        id: 'cultivation',
        text: `## Tu vi / trạng thái lực lượng\n${JSON.stringify(story.cultivationState, null, 2)}`,
      });
    }
    if (story.importantItems?.length) {
      records.push({
        id: 'items',
        text: `## Vật phẩm quan trọng\n${JSON.stringify(story.importantItems, null, 2)}`,
      });
    }
    if (story.unresolvedPlotPoints?.length) {
      records.push({
        id: 'plot-threads',
        text: [
          '## Plot threads chưa giải quyết',
          ...story.unresolvedPlotPoints.map((p) => `- ${p}`),
        ].join('\n'),
      });
    }

    return buildBudgetedDocument(records, {
      header: `# ${project.title} — Trạng thái cốt truyện`,
      charBudget: KNOWLEDGE_SIZE_CAPS.story_state,
      unitLabel: 'sections',
      knowledgeVersion: resolveKnowledgeVersion(this.db, projectId),
      section: 'story_state',
      emptyPlaceholder:
        'Chưa có trạng thái cốt truyện. Official Summary trong Book Profile không thay thế file này.',
    }).content;
  }

  buildWorldKnowledge(projectId: string): string {
    const project = this.db.projects.getById(projectId);
    if (!project) throw new Error(`Project not found: ${projectId}`);
    const storyRow = this.db.storyStates.getByProject(projectId);
    const story = storyRow ? this.db.storyStates.parseStructured(storyRow) : {};
    const world = story.worldKnowledge ?? {};

    const records: KnowledgeRecord[] = [];
    const keys = sortWorldKnowledgeKeys(Object.keys(world));

    for (const key of keys) {
      const value = world[key];
      const body =
        typeof value === 'string' ? value : JSON.stringify(value, null, 2);
      records.push({ id: `world-${key}`, text: `## ${key}\n${body}` });
    }

    if (records.length === 0 && project.genre) {
      records.push({ id: 'genre-hint', text: `Thể loại gợi ý: ${project.genre}` });
    }

    return buildBudgetedDocument(records, {
      header: `# ${project.title} — Thế giới truyện`,
      charBudget: KNOWLEDGE_SIZE_CAPS.world_knowledge,
      unitLabel: 'entries',
      knowledgeVersion: resolveKnowledgeVersion(this.db, projectId),
      section: 'world_knowledge',
      emptyPlaceholder:
        'Kiến thức thế giới ổn định (quốc gia, tông môn, cảnh giới, tiền tệ…) sẽ được cập nhật khi dịch / seed.',
    }).content;
  }

  buildRecentContext(projectId: string): string {
    const project = this.db.projects.getById(projectId);
    if (!project) throw new Error(`Project not found: ${projectId}`);
    const settings = loadNotebookSettings(this.db, projectId);
    const storyRow = this.db.storyStates.getByProject(projectId);
    const current = storyRow?.current_chapter_number ?? null;

    if (current == null) {
      return buildBudgetedDocument([], {
        header: `# ${project.title} — Bối cảnh gần đây`,
        charBudget: KNOWLEDGE_SIZE_CAPS.recent_context,
        unitLabel: 'chapters',
        knowledgeVersion: resolveKnowledgeVersion(this.db, projectId),
        section: 'recent_context',
        emptyPlaceholder: '(chưa có chương đã dịch — cửa sổ context trống)',
      }).content;
    }

    const from = Math.max(1, current - settings.recentContextChapters + 1);
    const events = this.db.memoryEvents.listRecentChapters(projectId, from, current);

    const byChapter = new Map<number, string[]>();
    for (const event of events) {
      const ch = event.chapter_number ?? 0;
      const list = byChapter.get(ch) ?? [];
      list.push(`- ${event.category}.${event.event_key}=${event.event_value ?? ''}`);
      byChapter.set(ch, list);
    }

    const chapterNums = [...byChapter.keys()].sort((a, b) => b - a);
    const records: KnowledgeRecord[] = chapterNums.map((ch) => ({
      id: `recent-ch-${ch}`,
      text: [`### Chương ${ch}`, ...(byChapter.get(ch) ?? [])].join('\n'),
    }));

    return buildBudgetedDocument(records, {
      header: [`# ${project.title} — Bối cảnh gần đây`, '', `## Chương ${from}–${current}`].join(
        '\n',
      ),
      charBudget: KNOWLEDGE_SIZE_CAPS.recent_context,
      unitLabel: 'chapters',
      knowledgeVersion: resolveKnowledgeVersion(this.db, projectId),
      section: 'recent_context',
      emptyPlaceholder: '## Những sự kiện gần nhất\n(chưa có memory events trong cửa sổ)',
    }).content;
  }

  buildSyncState(projectId: string): string {
    const state = this.db.knowledgeSyncState.ensure(projectId);
    const version = Math.max(1, state.pending_knowledge_version || 0);
    let nonce = state.pending_sync_nonce;
    // Persist generated nonce so Drive hash stays stable across syncOwnedFiles calls.
    if (!nonce || state.pending_knowledge_version <= 0) {
      nonce = nonce ?? generateSyncNonce();
      this.db.knowledgeSyncState.patch(projectId, {
        pendingKnowledgeVersion: version,
        pendingSyncNonce: nonce,
        ...(state.version_probe_status === 'verified'
          ? {}
          : { versionProbeStatus: 'pending' as const }),
      });
    }
    return buildSyncStateManifestContent({
      projectId,
      knowledgeVersion: version,
      syncNonce: nonce,
    });
  }

  buildByType(projectId: string, type: KnowledgeType): string {
    switch (type) {
      case 'book_profile':
        return this.buildBookProfile(projectId);
      case 'translation_rules':
        return this.buildTranslationRules(projectId);
      case 'project_terms':
        return this.buildProjectTerms(projectId);
      case 'characters':
        return this.buildCharacters(projectId);
      case 'relationships':
        return this.buildRelationships(projectId);
      case 'story_state':
        return this.buildStoryState(projectId);
      case 'world_knowledge':
        return this.buildWorldKnowledge(projectId);
      case 'recent_context':
        return this.buildRecentContext(projectId);
      case 'sync_state':
        return this.buildSyncState(projectId);
      default: {
        const _exhaustive: never = type;
        return _exhaustive;
      }
    }
  }

  buildAll(projectId: string): ProjectKnowledgeDocuments {
    return {
      [KNOWLEDGE_RESOURCE_KEYS.BOOK_PROFILE_MD]: this.buildBookProfile(projectId),
      [KNOWLEDGE_RESOURCE_KEYS.RULES_MD]: this.buildTranslationRules(projectId),
      [KNOWLEDGE_RESOURCE_KEYS.PROJECT_TERMS_MD]: this.buildProjectTerms(projectId),
      [KNOWLEDGE_RESOURCE_KEYS.CHARACTERS_MD]: this.buildCharacters(projectId),
      [KNOWLEDGE_RESOURCE_KEYS.RELATIONSHIPS_MD]: this.buildRelationships(projectId),
      [KNOWLEDGE_RESOURCE_KEYS.STORY_STATE_MD]: this.buildStoryState(projectId),
      [KNOWLEDGE_RESOURCE_KEYS.WORLD_KNOWLEDGE_MD]: this.buildWorldKnowledge(projectId),
      [KNOWLEDGE_RESOURCE_KEYS.RECENT_CONTEXT_MD]: this.buildRecentContext(projectId),
      [KNOWLEDGE_RESOURCE_KEYS.SYNC_STATE_MD]: this.buildSyncState(projectId),
    };
  }

  /**
   * Rebuild knowledge files. On content change: new pending version + nonce
   * (CONTENT_CURRENT). sync_state is written last from pending manifest.
   */
  rebuildAndTrack(projectId: string): ProjectKnowledgeDocuments {
    this.db.knowledgeSyncEvents.insert({
      projectId,
      eventType: 'KNOWLEDGE_BUILD_STARTED',
      message: `Đang xây bộ nhớ AI`,
    });

    let anyChanged = false;
    const contentTypes = KNOWLEDGE_TYPES.filter((t) => t !== 'sync_state');
    for (const type of contentTypes) {
      const content = this.buildByType(projectId, type);
      const hash = hashKnowledgeContent(content);
      const before = this.db.knowledgeFiles.get(projectId, type);
      const after = this.db.knowledgeFiles.recordGenerated(projectId, type, hash);
      if (before?.content_hash !== after.content_hash) {
        anyChanged = true;
        this.db.knowledgeSyncEvents.insert({
          projectId,
          eventType: 'KNOWLEDGE_FILE_CHANGED',
          knowledgeType: type,
          message: `Đã cập nhật ${KNOWLEDGE_FILE_NAMES[type]}`,
        });
      }
    }

    const state = this.db.knowledgeSyncState.ensure(projectId);
    if (anyChanged || !state.pending_sync_nonce || state.pending_knowledge_version <= 0) {
      const base = Math.max(
        state.pending_knowledge_version,
        state.verified_knowledge_version,
        this.db.knowledgeFiles.maxLocalVersion(projectId),
      );
      const version =
        anyChanged || state.pending_knowledge_version <= 0 ? Math.max(1, base + 1) : base;
      const nonce =
        anyChanged || !state.pending_sync_nonce
          ? generateSyncNonce()
          : state.pending_sync_nonce;
      this.db.knowledgeSyncState.patch(projectId, {
        pendingKnowledgeVersion: version,
        pendingSyncNonce: nonce,
        versionProbeStatus: 'pending',
      });
    }

    const syncContent = this.buildSyncState(projectId);
    const syncHash = hashKnowledgeContent(syncContent);
    const syncBefore = this.db.knowledgeFiles.get(projectId, 'sync_state');
    const syncAfter = this.db.knowledgeFiles.recordGenerated(
      projectId,
      'sync_state',
      syncHash,
    );
    if (syncBefore?.content_hash !== syncAfter.content_hash) {
      this.db.knowledgeSyncEvents.insert({
        projectId,
        eventType: 'KNOWLEDGE_FILE_CHANGED',
        knowledgeType: 'sync_state',
        message: `Đã cập nhật ${KNOWLEDGE_FILE_NAMES.sync_state}`,
      });
    }

    const localVersion = this.db.knowledgeFiles.maxLocalVersion(projectId);
    for (const mapping of this.db.notebooks.listByProject(projectId)) {
      this.db.notebooks.bumpLocalKnowledgeVersion(mapping.id, localVersion);
    }
    return this.buildAll(projectId);
  }
}

export const KNOWLEDGE_TYPE_TO_DRIVE_KEY: Record<
  KnowledgeType,
  keyof ProjectKnowledgeDocuments
> = {
  book_profile: KNOWLEDGE_RESOURCE_KEYS.BOOK_PROFILE_MD,
  translation_rules: KNOWLEDGE_RESOURCE_KEYS.RULES_MD,
  project_terms: KNOWLEDGE_RESOURCE_KEYS.PROJECT_TERMS_MD,
  characters: KNOWLEDGE_RESOURCE_KEYS.CHARACTERS_MD,
  relationships: KNOWLEDGE_RESOURCE_KEYS.RELATIONSHIPS_MD,
  story_state: KNOWLEDGE_RESOURCE_KEYS.STORY_STATE_MD,
  world_knowledge: KNOWLEDGE_RESOURCE_KEYS.WORLD_KNOWLEDGE_MD,
  recent_context: KNOWLEDGE_RESOURCE_KEYS.RECENT_CONTEXT_MD,
  sync_state: KNOWLEDGE_RESOURCE_KEYS.SYNC_STATE_MD,
};
