import type { DatabaseManager } from '../db/database-manager';
import type { TranslationPackDto } from '@shared/schemas/translation-pack';
import { parseBootstrapAnalysisOutput } from '@shared/schemas/bootstrap';
import {
  BOOTSTRAP_VERSION,
  type BootstrapMode,
} from '@shared/constants/bootstrap';
import { utcNow } from '../db/utils/timestamps';
import { newId } from '../db/utils/uuid';
import { logger } from '../logging/logger';
import { NotebookKnowledgeBuilder } from '../notebook/knowledge-builder';
import { getNotebookSyncService } from '../notebook/notebook-sync-service-singleton';
import {
  prepareBootstrapLocal,
  type BootstrapLocalPrepResult,
} from './bootstrap-local-prep';
import { buildBootstrapAnalysisPrompt } from './bootstrap-prompt-builder';
import { persistBootstrapAnalysis } from './bootstrap-persist';
import type { KnowledgeSyncEventType } from '@shared/constants/knowledge';

export interface BootstrapAnalysisDeps {
  sendPrompt: (
    pack: TranslationPackDto,
    options?: { projectId?: string; googleAccountId?: string; requestId?: string },
  ) => Promise<{ status: string; text: string; errorMessage?: string | null }>;
  googleAccountId?: string | null;
}

export interface BootstrapAnalysisResult {
  status: string;
  throughChapter: number | null;
  chapterCount: number;
  knownTermsMatched: number;
  charactersUpserted: number;
  relationshipsUpserted: number;
  termCandidatesCreated: number;
  warnings: string[];
  message: string;
  aiRequestCount: number;
}

function analysisPack(
  projectId: string,
  prompt: string,
  prep: BootstrapLocalPrepResult,
  chapterIds: string[],
): TranslationPackDto {
  const chapterNumbers = prep.chapters.map((c) => c.chapterNumber);
  return {
    projectId,
    chapterIds: chapterIds.length > 0 ? chapterIds : [newId()],
    chapterNumbers: chapterNumbers.length > 0 ? chapterNumbers : [0],
    style: 'balanced',
    prompt,
    baseContext: '',
    operationPrompt: prompt,
    operationType: 'TRANSLATE',
    sections: {
      taskHeader: 'BOOTSTRAP ANALYSIS — DO NOT TRANSLATE',
      criticalRules: 'DO NOT TRANSLATE THE NOVEL. Analyze only. Return JSON.',
      hotMemoryDelta: '',
      activeProjectTerms: prep.knownTerms
        .map((t) => `${t.source}→${t.target}`)
        .join('; ')
        .slice(0, 2000),
      sourceParagraphs: '(see prompt chapters)',
      outputProtocol: 'JSON BootstrapAnalysisOutput',
    },
    size: {
      sourceChars: prep.totalChars,
      contextChars: prep.knownTerms.length * 20,
      totalChars: prompt.length,
      estimatedTokens: Math.ceil(prompt.length / 4),
      activeTermCount: prep.knownTerms.length,
      activeCharacterCount: 0,
      relationshipCount: 0,
      recentMemoryCount: 0,
      paragraphCount: Math.max(1, prep.chapters.length),
      chapterCount: Math.max(1, prep.chapters.length),
    },
    promptHash: newId().slice(0, 12),
  };
}

function emit(
  db: DatabaseManager,
  projectId: string,
  eventType: KnowledgeSyncEventType,
  message: string,
  metadata?: Record<string, unknown>,
): void {
  db.knowledgeSyncEvents.insert({
    projectId,
    eventType,
    message,
    metadata: metadata ?? null,
  });
}

/**
 * One-shot bootstrap AI analysis. Local prep → 1 AI call → SQLite → knowledge rebuild.
 */
export class BootstrapAnalysisService {
  constructor(private readonly db: DatabaseManager) {}

  skip(projectId: string): BootstrapAnalysisResult {
    const project = this.db.projects.getById(projectId);
    if (!project) throw new Error(`Project not found: ${projectId}`);

    this.db.projects.updateBootstrap(projectId, {
      bootstrap_status: 'SKIPPED',
      bootstrap_completed_at: utcNow(),
      bootstrap_version: BOOTSTRAP_VERSION,
    });

    new NotebookKnowledgeBuilder(this.db).rebuildAndTrack(projectId);
    getNotebookSyncService(this.db).markDirty(projectId, 'ALL');

    emit(this.db, projectId, 'BOOTSTRAP_SKIPPED', 'Đã bỏ qua khởi tạo bộ nhớ AI.');

    return {
      status: 'SKIPPED',
      throughChapter: null,
      chapterCount: 0,
      knownTermsMatched: 0,
      charactersUpserted: 0,
      relationshipsUpserted: 0,
      termCandidatesCreated: 0,
      warnings: [
        'Bộ nhớ AI ban đầu chưa được khởi tạo. Khepree Novel AI sẽ xây dựng bộ nhớ dần trong quá trình dịch.',
      ],
      message: 'Đã bỏ qua khởi tạo bộ nhớ AI.',
      aiRequestCount: 0,
    };
  }

  async run(
    projectId: string,
    deps: BootstrapAnalysisDeps,
    options?: { mode?: BootstrapMode; rebootstrap?: boolean },
  ): Promise<BootstrapAnalysisResult> {
    const project = this.db.projects.getById(projectId);
    if (!project) throw new Error(`Project not found: ${projectId}`);

    const warnings: string[] = [];
    this.db.projects.updateBootstrap(projectId, {
      bootstrap_status: 'PREPARING',
      bootstrap_started_at: utcNow(),
      bootstrap_completed_at: null,
      bootstrap_version: BOOTSTRAP_VERSION,
    });
    emit(this.db, projectId, 'BOOTSTRAP_STARTED', 'Đang khởi tạo bộ nhớ AI.');

    let aiRequestCount = 0;

    try {
      const prep = prepareBootstrapLocal(this.db, projectId, { mode: options?.mode });
      emit(
        this.db,
        projectId,
        'BOOTSTRAP_LOCAL_PREPARED',
        `Đã khớp ${prep.knownTerms.length} thuật ngữ có sẵn; chuẩn bị ${prep.chapterCountUsed} chương.`,
        {
          knownTerms: prep.knownTerms.length,
          chapters: prep.chapterCountUsed,
          totalChars: prep.totalChars,
        },
      );

      const { NotebookBootstrapService } = await import(
        '../notebook/notebook-bootstrap-service'
      );
      new NotebookBootstrapService(this.db).seedFromMetadataAndEarlyChapters(projectId);

      const chapterRows = this.db.chapters.listByProject(projectId);
      const chapterIds = chapterRows
        .filter((c) =>
          prep.chapters.some(
            (p) => p.chapterNumber === (c.chapter_number ?? c.sequence_order),
          ),
        )
        .map((c) => c.id);

      if (prep.chapters.length === 0) {
        warnings.push('Không có chương để phân tích AI — chỉ dùng metadata local.');
        new NotebookKnowledgeBuilder(this.db).rebuildAndTrack(projectId);
        getNotebookSyncService(this.db).markDirty(projectId, 'ALL');
        this.db.projects.updateBootstrap(projectId, {
          bootstrap_status: 'COMPLETED_WITH_WARNINGS',
          bootstrap_completed_at: utcNow(),
          bootstrap_through_chapter: null,
        });
        emit(this.db, projectId, 'BOOTSTRAP_COMPLETED', 'Bootstrap local-only (no chapters).');
        return {
          status: 'COMPLETED_WITH_WARNINGS',
          throughChapter: null,
          chapterCount: 0,
          knownTermsMatched: prep.knownTerms.length,
          charactersUpserted: 0,
          relationshipsUpserted: 0,
          termCandidatesCreated: 0,
          warnings,
          message: 'Đã xây bộ nhớ từ metadata (chưa có chương để phân tích AI).',
          aiRequestCount: 0,
        };
      }

      this.db.projects.updateBootstrap(projectId, { bootstrap_status: 'ANALYZING' });
      const prompt = buildBootstrapAnalysisPrompt(prep);
      const firstChapter = prep.chapters[0];
      emit(
        this.db,
        projectId,
        'BOOTSTRAP_AI_REQUESTED',
        `Đang phân tích chương ${firstChapter.chapterNumber}–${prep.throughChapter} (1 yêu cầu AI).`,
      );

      aiRequestCount = 1;
      const response = await deps.sendPrompt(
        analysisPack(projectId, prompt, prep, chapterIds),
        {
          projectId,
          googleAccountId: deps.googleAccountId ?? undefined,
          requestId: newId(),
        },
      );

      if (response.status !== 'SUCCESS' || !response.text.trim()) {
        throw new Error(
          response.errorMessage ?? `Bootstrap AI failed: ${response.status}`,
        );
      }
      emit(this.db, projectId, 'BOOTSTRAP_AI_RECEIVED', 'Đã nhận phản hồi phân tích.');

      this.db.projects.updateBootstrap(projectId, { bootstrap_status: 'PROCESSING' });
      const parsed = parseBootstrapAnalysisOutput(response.text);
      emit(this.db, projectId, 'BOOTSTRAP_PARSED', 'Đã parse kết quả bootstrap.');

      const persisted = persistBootstrapAnalysis(
        this.db,
        projectId,
        parsed,
        prep.throughChapter,
      );
      emit(
        this.db,
        projectId,
        'BOOTSTRAP_PERSISTED',
        `Phát hiện ${persisted.charactersUpserted} nhân vật, ${persisted.termCandidatesCreated} thuật ngữ mới, ${persisted.relationshipsUpserted} quan hệ.`,
        persisted as unknown as Record<string, unknown>,
      );

      new NotebookKnowledgeBuilder(this.db).rebuildAndTrack(projectId);
      getNotebookSyncService(this.db).markDirty(projectId, 'ALL');
      emit(this.db, projectId, 'BOOTSTRAP_KNOWLEDGE_BUILT', 'Đã xây bộ nhớ AI (8 knowledge files).');

      const status =
        warnings.length > 0 ? 'COMPLETED_WITH_WARNINGS' : 'COMPLETED';
      this.db.projects.updateBootstrap(projectId, {
        bootstrap_status: status,
        bootstrap_completed_at: utcNow(),
        bootstrap_through_chapter: prep.throughChapter,
        bootstrap_version: BOOTSTRAP_VERSION,
        bootstrap_chapter_count: prep.chapterCountRequested,
      });
      emit(this.db, projectId, 'BOOTSTRAP_COMPLETED', 'Đã hoàn tất khởi tạo bộ nhớ AI.');

      logger.info('Bootstrap analysis complete', {
        projectId,
        status,
        throughChapter: prep.throughChapter,
        characters: persisted.charactersUpserted,
      });

      return {
        status,
        throughChapter: prep.throughChapter,
        chapterCount: prep.chapterCountUsed,
        knownTermsMatched: prep.knownTerms.length,
        charactersUpserted: persisted.charactersUpserted,
        relationshipsUpserted: persisted.relationshipsUpserted,
        termCandidatesCreated: persisted.termCandidatesCreated,
        warnings,
        message: `Khepree Novel AI đã phân tích ${prep.chapterCountUsed} chương đầu và sẵn sàng bắt đầu dịch.`,
        aiRequestCount,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.db.projects.updateBootstrap(projectId, {
        bootstrap_status: 'FAILED',
        bootstrap_completed_at: utcNow(),
      });
      emit(this.db, projectId, 'BOOTSTRAP_FAILED', message);
      logger.warn('Bootstrap analysis failed', { projectId, message });
      return {
        status: 'FAILED',
        throughChapter: null,
        chapterCount: 0,
        knownTermsMatched: 0,
        charactersUpserted: 0,
        relationshipsUpserted: 0,
        termCandidatesCreated: 0,
        warnings: [message],
        message:
          'Không thể khởi tạo bộ nhớ AI. Bạn có thể thử lại hoặc bắt đầu dịch mà không cần bước này.',
        aiRequestCount,
      };
    }
  }
}
