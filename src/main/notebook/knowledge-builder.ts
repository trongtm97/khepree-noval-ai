import { createHash } from 'node:crypto';
import type { DatabaseManager } from '../db/database-manager';
import {
  DEFAULT_NOTEBOOK_SETTINGS,
  KNOWLEDGE_FILE_NAMES,
  KNOWLEDGE_SIZE_CAPS,
  KNOWLEDGE_TYPES,
  type KnowledgeType,
} from '@shared/constants/knowledge';
import { DRIVE_RESOURCE_KEYS } from '@shared/constants/drive';
import { buildBookProfileMarkdown } from '../source-folder/book-profile-builder';
import { OUTPUT_PROTOCOL_BLOCK } from '@shared/constants/translation-pack';

export function hashKnowledgeContent(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return `${text.slice(0, maxLen - 1)}…`;
}

function loadStyleConfig(db: DatabaseManager, projectId: string): {
  rules: string[];
  criticalRules: string[];
  notebookInstructions?: string;
  notebookSettings?: Partial<typeof DEFAULT_NOTEBOOK_SETTINGS>;
} {
  const row = db
    .getConnection()
    .prepare(`SELECT style_config FROM project_settings WHERE project_id = ?`)
    .get(projectId) as { style_config: string | null } | undefined;

  const result = {
    rules: [] as string[],
    criticalRules: [] as string[],
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
    if (Array.isArray(parsed.rules)) result.rules = parsed.rules;
    if (Array.isArray(parsed.criticalRules)) result.criticalRules = parsed.criticalRules;
    if (parsed.notebookInstructions) result.notebookInstructions = parsed.notebookInstructions;
    if (parsed.notebook) result.notebookSettings = parsed.notebook;
  } catch {
    result.rules = [row.style_config];
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

export type ProjectKnowledgeDocuments = Record<
  (typeof DRIVE_RESOURCE_KEYS)[
    | 'BOOK_PROFILE_MD'
    | 'RULES_MD'
    | 'PROJECT_TERMS_MD'
    | 'CHARACTERS_MD'
    | 'RELATIONSHIPS_MD'
    | 'STORY_STATE_MD'
    | 'WORLD_KNOWLEDGE_MD'
    | 'RECENT_CONTEXT_MD'
  ],
  string
>;

export class NotebookKnowledgeBuilder {
  constructor(private readonly db: DatabaseManager) {}

  buildBookProfile(projectId: string): string {
    return truncate(
      buildBookProfileMarkdown(this.db, projectId),
      KNOWLEDGE_SIZE_CAPS.book_profile,
    );
  }

  buildTranslationRules(projectId: string): string {
    const project = this.db.projects.getById(projectId);
    if (!project) throw new Error(`Project not found: ${projectId}`);
    const style = loadStyleConfig(this.db, projectId);
    const lines: string[] = [
      `# ${project.title} — Quy tắc dịch`,
      '',
      'Ngôn ngữ nguồn: Tiếng Trung.',
      'Ngôn ngữ đích: Tiếng Việt.',
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
      '',
    ];
    if (style.criticalRules.length) {
      lines.push('## Critical Rules', ...style.criticalRules.map((r) => `- ${r}`), '');
    }
    if (style.rules.length) {
      lines.push('## Project Rules', ...style.rules.map((r) => `- ${r}`), '');
    }
    return truncate(lines.join('\n'), KNOWLEDGE_SIZE_CAPS.translation_rules);
  }

  buildProjectTerms(projectId: string): string {
    const project = this.db.projects.getById(projectId);
    if (!project) throw new Error(`Project not found: ${projectId}`);
    const termRows = this.db.terms.search({ projectId, limit: 500 });
    const lines: string[] = [`# ${project.title} — Thuật ngữ`, ''];
    for (const term of termRows) {
      if (term.scope === 'PROJECT' && term.scope_ref !== projectId) continue;
      const translations = this.db.terms.listTranslations(term.id);
      const primary = translations.find((t) => t.is_primary === 1)?.target_text ?? '?';
      lines.push(
        `- ${term.source_simplified} → ${primary} (${term.term_type})` +
          (term.locked === 1 ? ' [LOCKED]' : ''),
      );
    }
    if (lines.length === 2) lines.push('(chưa có thuật ngữ dự án)');
    return truncate(lines.join('\n'), KNOWLEDGE_SIZE_CAPS.project_terms);
  }

  buildCharacters(projectId: string): string {
    const project = this.db.projects.getById(projectId);
    if (!project) throw new Error(`Project not found: ${projectId}`);
    const lines: string[] = [`# ${project.title} — Nhân vật`, ''];
    for (const character of this.db.characters.listByProject(projectId)) {
      const aliases = this.db.characters.listAliases(character.id).map((row) => row.alias);
      lines.push(`## ${character.canonical_name}`);
      if (character.translated_name) lines.push(`Tên Việt: ${character.translated_name}`);
      if (character.gender) lines.push(`Giới tính: ${character.gender}`);
      if (character.role) lines.push(`Vai trò: ${character.role}`);
      if (aliases.length) lines.push(`Bí danh: ${aliases.join(', ')}`);
      if (character.description) lines.push(`Đặc điểm: ${character.description}`);
      lines.push(
        `Chương: ${character.first_chapter ?? '?'}–${character.last_chapter ?? '?'}`,
        '',
      );
    }
    if (lines.length === 2) lines.push('(chưa có nhân vật)');
    return truncate(lines.join('\n'), KNOWLEDGE_SIZE_CAPS.characters);
  }

  buildRelationships(projectId: string): string {
    const project = this.db.projects.getById(projectId);
    if (!project) throw new Error(`Project not found: ${projectId}`);
    const lines: string[] = [`# ${project.title} — Quan hệ`, ''];
    for (const rel of this.db.relationships.listByProject(projectId)) {
      const from = this.db.characters.getById(rel.from_character_id);
      const to = this.db.characters.getById(rel.to_character_id);
      lines.push(
        `## ${from?.canonical_name ?? rel.from_character_id} → ${to?.canonical_name ?? rel.to_character_id}`,
      );
      lines.push(`Quan hệ: ${rel.relationship_type}`);
      if (rel.a_calls_b) lines.push(`Gọi: ${rel.a_calls_b}`);
      if (rel.b_calls_a) lines.push(`Được gọi: ${rel.b_calls_a}`);
      if (rel.valid_from_chapter) lines.push(`Từ chương: ${rel.valid_from_chapter}`);
      lines.push('');
    }
    if (lines.length === 2) lines.push('(chưa có quan hệ)');
    return truncate(lines.join('\n'), KNOWLEDGE_SIZE_CAPS.relationships);
  }

  buildStoryState(projectId: string): string {
    const project = this.db.projects.getById(projectId);
    if (!project) throw new Error(`Project not found: ${projectId}`);
    const storyRow = this.db.storyStates.getByProject(projectId);
    const story = storyRow ? this.db.storyStates.parseStructured(storyRow) : {};
    const lines: string[] = [`# ${project.title} — Trạng thái cốt truyện`, ''];
    lines.push(
      `Chương đã xử lý gần nhất: ${story.currentChapterNumber ?? '(chưa có)'}`,
      '',
    );
    if (story.summaryText) {
      lines.push('## Tóm tắt trạng thái hiện tại', story.summaryText, '');
    }
    if (story.locationState) {
      lines.push('## Vị trí', JSON.stringify(story.locationState, null, 2), '');
    }
    if (story.cultivationState) {
      lines.push('## Tu vi / trạng thái lực lượng', JSON.stringify(story.cultivationState, null, 2), '');
    }
    if (story.importantItems?.length) {
      lines.push('## Vật phẩm quan trọng', JSON.stringify(story.importantItems, null, 2), '');
    }
    if (story.unresolvedPlotPoints?.length) {
      lines.push(
        '## Plot threads chưa giải quyết',
        ...story.unresolvedPlotPoints.map((p) => `- ${p}`),
        '',
      );
    }
    if (lines.length <= 4) {
      lines.push(
        'Chưa có trạng thái cốt truyện. Official Summary trong Book Profile không thay thế file này.',
      );
    }
    return truncate(lines.join('\n'), KNOWLEDGE_SIZE_CAPS.story_state);
  }

  buildWorldKnowledge(projectId: string): string {
    const project = this.db.projects.getById(projectId);
    if (!project) throw new Error(`Project not found: ${projectId}`);
    const storyRow = this.db.storyStates.getByProject(projectId);
    const story = storyRow ? this.db.storyStates.parseStructured(storyRow) : {};
    const lines: string[] = [`# ${project.title} — Thế giới truyện`, ''];

    const world = story.worldKnowledge;
    if (world && Object.keys(world).length > 0) {
      for (const [key, value] of Object.entries(world)) {
        lines.push(`## ${key}`);
        if (typeof value === 'string') {
          lines.push(value, '');
        } else {
          lines.push(JSON.stringify(value, null, 2), '');
        }
      }
    } else {
      lines.push(
        'Kiến thức thế giới ổn định (quốc gia, tông môn, cảnh giới, tiền tệ…) sẽ được cập nhật khi dịch / seed.',
        '',
      );
      if (project.genre) lines.push(`Thể loại gợi ý: ${project.genre}`);
    }
    return truncate(lines.join('\n'), KNOWLEDGE_SIZE_CAPS.world_knowledge);
  }

  buildRecentContext(projectId: string): string {
    const project = this.db.projects.getById(projectId);
    if (!project) throw new Error(`Project not found: ${projectId}`);
    const settings = loadNotebookSettings(this.db, projectId);
    const storyRow = this.db.storyStates.getByProject(projectId);
    const current = storyRow?.current_chapter_number ?? null;
    const lines: string[] = [`# ${project.title} — Bối cảnh gần đây`, ''];

    if (current == null) {
      lines.push('(chưa có chương đã dịch — cửa sổ context trống)');
      return truncate(lines.join('\n'), KNOWLEDGE_SIZE_CAPS.recent_context);
    }

    const from = Math.max(1, current - settings.recentContextChapters + 1);
    const events = this.db.memoryEvents.listRecentChapters(projectId, from, current);
    lines.push(`## Chương ${from}–${current}`, '');

    const byChapter = new Map<number, string[]>();
    for (const event of events) {
      const ch = event.chapter_number ?? 0;
      const list = byChapter.get(ch) ?? [];
      list.push(`- ${event.category}.${event.event_key}=${event.event_value ?? ''}`);
      byChapter.set(ch, list);
    }

    const chapters = [...byChapter.keys()].sort((a, b) => b - a);
    for (const ch of chapters) {
      lines.push(`### Chương ${ch}`);
      lines.push(...(byChapter.get(ch) ?? []));
      lines.push('');
    }

    if (chapters.length === 0) {
      lines.push('## Những sự kiện gần nhất', '(chưa có memory events trong cửa sổ)');
    }

    return truncate(lines.join('\n'), KNOWLEDGE_SIZE_CAPS.recent_context);
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
      default: {
        const _exhaustive: never = type;
        return _exhaustive;
      }
    }
  }

  buildAll(projectId: string): ProjectKnowledgeDocuments {
    return {
      [DRIVE_RESOURCE_KEYS.BOOK_PROFILE_MD]: this.buildBookProfile(projectId),
      [DRIVE_RESOURCE_KEYS.RULES_MD]: this.buildTranslationRules(projectId),
      [DRIVE_RESOURCE_KEYS.PROJECT_TERMS_MD]: this.buildProjectTerms(projectId),
      [DRIVE_RESOURCE_KEYS.CHARACTERS_MD]: this.buildCharacters(projectId),
      [DRIVE_RESOURCE_KEYS.RELATIONSHIPS_MD]: this.buildRelationships(projectId),
      [DRIVE_RESOURCE_KEYS.STORY_STATE_MD]: this.buildStoryState(projectId),
      [DRIVE_RESOURCE_KEYS.WORLD_KNOWLEDGE_MD]: this.buildWorldKnowledge(projectId),
      [DRIVE_RESOURCE_KEYS.RECENT_CONTEXT_MD]: this.buildRecentContext(projectId),
    };
  }

  /** Rebuild all files and update knowledge_files hash/version rows. */
  rebuildAndTrack(projectId: string): ProjectKnowledgeDocuments {
    this.db.knowledgeSyncEvents.insert({
      projectId,
      eventType: 'KNOWLEDGE_BUILD_STARTED',
      message: `Đang xây bộ nhớ AI`,
    });
    const docs = this.buildAll(projectId);
    for (const type of KNOWLEDGE_TYPES) {
      const content = this.buildByType(projectId, type);
      const hash = hashKnowledgeContent(content);
      const before = this.db.knowledgeFiles.get(projectId, type);
      const after = this.db.knowledgeFiles.recordGenerated(projectId, type, hash);
      if (before?.content_hash !== after.content_hash) {
        this.db.knowledgeSyncEvents.insert({
          projectId,
          eventType: 'KNOWLEDGE_FILE_CHANGED',
          knowledgeType: type,
          message: `Đã cập nhật ${KNOWLEDGE_FILE_NAMES[type]}`,
        });
      }
    }
    const localVersion = this.db.knowledgeFiles.maxLocalVersion(projectId);
    for (const mapping of this.db.notebooks.listByProject(projectId)) {
      this.db.notebooks.bumpLocalKnowledgeVersion(mapping.id, localVersion);
    }
    return docs;
  }
}

export const KNOWLEDGE_TYPE_TO_DRIVE_KEY: Record<
  KnowledgeType,
  keyof ProjectKnowledgeDocuments
> = {
  book_profile: DRIVE_RESOURCE_KEYS.BOOK_PROFILE_MD,
  translation_rules: DRIVE_RESOURCE_KEYS.RULES_MD,
  project_terms: DRIVE_RESOURCE_KEYS.PROJECT_TERMS_MD,
  characters: DRIVE_RESOURCE_KEYS.CHARACTERS_MD,
  relationships: DRIVE_RESOURCE_KEYS.RELATIONSHIPS_MD,
  story_state: DRIVE_RESOURCE_KEYS.STORY_STATE_MD,
  world_knowledge: DRIVE_RESOURCE_KEYS.WORLD_KNOWLEDGE_MD,
  recent_context: DRIVE_RESOURCE_KEYS.RECENT_CONTEXT_MD,
};
