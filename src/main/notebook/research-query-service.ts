import path from 'node:path';
import type { DatabaseManager } from '../db/database-manager';
import { GeminiBrowserProvider } from '../automation/providers/google/gemini-browser-provider';
import { browserProfileManager } from '../automation/browser-runner/profile-manager';
import { pathsService } from '../services/paths-service';
import { newId } from '../db/utils/uuid';
import { resolveProjectWorker } from '../services/project-worker-resolver';
import { resolveResearchNotebook } from './notebook-resolver';

export interface ResearchQueryInput {
  projectId: string;
  accountId?: string | null;
  question: string;
}

export interface ResearchQueryResult {
  status: 'candidate';
  question: string;
  answer: string;
  disclaimer: string;
}

/**
 * Ask Research NotebookLM a consistency question.
 * Result is CANDIDATE only — never writes to SQLite.
 */
export async function queryResearchNotebook(
  db: DatabaseManager,
  input: ResearchQueryInput,
): Promise<ResearchQueryResult> {
  const question = input.question.trim();
  if (!question) throw new Error('Research question is empty');

  const accountId =
    input.accountId ??
    resolveProjectWorker(db, {
      projectId: input.projectId,
      purpose: 'research',
    }).accountId;
  if (!accountId) {
    throw new Error('Chưa gắn tài khoản Google cho Research Notebook.');
  }

  const mapping = resolveResearchNotebook(db, input.projectId, accountId);
  if (!mapping?.resource_url) {
    throw new Error(
      'Research Notebook chưa sẵn sàng. Mở Bộ nhớ AI → thiết lập Research Notebook trước.',
    );
  }

  const profile = db.googleAccounts.getProfile(accountId);
  if (!profile) throw new Error('Browser profile missing for research query');

  const profilePath = browserProfileManager.resolveProfilePath(profile.profile_dir_name);
  const diagnosticsDir = path.join(
    pathsService.getPath('cache'),
    'automation',
    accountId,
    'research-query',
  );

  const prompt = [
    'Tra cứu toàn truyện — trả lời dựa trên nguồn đã upload.',
    'Chỉ trích dẫn sự kiện/tên trong corpus; nếu không chắc, nói rõ.',
    '',
    question,
  ].join('\n');

  const { getBrowserRuntimeManager } = await import(
    '../automation/browser-runner/browser-runtime-manager'
  );
  const provider = new GeminiBrowserProvider({
    diagnosticsDir,
    maxTimeoutMs: 120_000,
    expectedNotebookUrl: mapping.resource_url,
  });
  const runtimeManager = getBrowserRuntimeManager();

  const answer = await runtimeManager.runExclusive(
    {
      accountId,
      profilePath,
      diagnosticsDir,
      headless: true,
    },
    async ({ runtime, prepareNotebook }) => {
      void runtime;
      const page = await prepareNotebook({
        projectId: input.projectId,
        notebookUrl: mapping.resource_url ?? '',
        openNotebook: async (p, url) => {
          provider.attachPage(p);
          await provider.openProjectNotebook(url || mapping.resource_url);
        },
        verifyReady: async (p) => {
          provider.attachPage(p);
          const ok = await provider.healthCheck();
          if (!ok.ok) {
            await provider.openProjectNotebook(mapping.resource_url);
          }
        },
      });
      provider.attachPage(page);
      await provider.createOrOpenTranslationThread({ forceNew: false });
      const correlationId = newId();
      await provider.submitPlainPrompt(prompt, correlationId);
      await provider.waitForGenerationStart();
      await provider.waitForGenerationComplete(correlationId);
      const raw = await provider.extractLatestResponse(correlationId);
      await provider.detach();
      return raw.text.trim();
    },
  );

  return {
    status: 'candidate',
    question,
    answer: answer || '(Không có phản hồi từ NotebookLM)',
    disclaimer:
      'Kết quả tra cứu chỉ là gợi ý — xác minh trước khi cập nhật bộ nhớ SQLite.',
  };
}
