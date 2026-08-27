import fs from 'node:fs';
import path from 'node:path';
import type { DatabaseManager } from '../db/database-manager';
import { BOOTSTRAP_VERSION } from '@shared/constants/bootstrap';
import { utcNow } from '../db/utils/timestamps';
import { NotebookKnowledgeBuilder } from '../notebook/knowledge-builder';
import { getNotebookSyncService } from '../notebook/notebook-sync-service-singleton';
import { pathsService } from '../services/paths-service';
import { packNovelCorpus, type PackNovelCorpusResult } from './novel-corpus-packer';
import { buildFullNovelPreprocessPrompt } from './full-novel-preprocess-prompts';
import {
  assertMinimumKnowledgeFiles,
  parseFullNovelPreprocessResponse,
} from './full-novel-preprocess-parser';
import {
  extractStyleRulesFromMarkdown,
  knowledgeMarkdownToBootstrapOutput,
} from './full-novel-preprocess-markdown';
import { persistBootstrapAnalysis } from './bootstrap-persist';

export class FullNovelPreprocessService {
  constructor(private readonly db: DatabaseManager) {}

  packCorpus(projectId: string, outputDir?: string): PackNovelCorpusResult {
    return packNovelCorpus(this.db, projectId, { outputDir });
  }

  getPrompt(projectId: string, partFileNames?: string[]): {
    prompt: string;
    promptPath: string | null;
    partFileNames: string[];
  } {
    const project = this.db.projects.getById(projectId);
    if (!project) throw new Error(`Project not found: ${projectId}`);

    let names = partFileNames ?? [];
    if (names.length === 0) {
      const exportsRoot = pathsService.getPath('exports');
      const base = path.join(exportsRoot, 'preprocess', projectId);
      if (fs.existsSync(base)) {
        const dirs = fs
          .readdirSync(base, { withFileTypes: true })
          .filter((d) => d.isDirectory())
          .map((d) => d.name)
          .sort()
          .reverse();
        const latest = dirs[0];
        if (latest) {
          const dir = path.join(base, latest);
          names = fs
            .readdirSync(dir)
            .filter((f) => /^NOVEL_PART_\d+\.txt$/i.test(f))
            .sort();
          const prompt = buildFullNovelPreprocessPrompt({
            projectTitle: project.title,
            author: project.author_name,
            genre: project.genre,
            partFileNames: names,
          });
          const promptPath = path.join(dir, 'FULL_NOVEL_PREPROCESS.prompt.md');
          fs.writeFileSync(promptPath, prompt, 'utf8');
          return { prompt, promptPath, partFileNames: names };
        }
      }
    }

    const prompt = buildFullNovelPreprocessPrompt({
      projectTitle: project.title,
      author: project.author_name,
      genre: project.genre,
      partFileNames: names,
    });

    let promptPath: string | null = null;
    const exportsRoot = pathsService.getPath('exports');
    const dir = path.join(exportsRoot, 'preprocess', projectId);
    fs.mkdirSync(dir, { recursive: true });
    promptPath = path.join(dir, 'FULL_NOVEL_PREPROCESS.prompt.md');
    fs.writeFileSync(promptPath, prompt, 'utf8');

    return { prompt, promptPath, partFileNames: names };
  }

  importResult(
    projectId: string,
    input: {
      text?: string;
      filePath?: string;
      syncDrive?: boolean;
      temporalProvenance?: boolean;
    },
  ): {
    foundKeys: string[];
    missingKeys: string[];
    charactersUpserted: number;
    relationshipsUpserted: number;
    termCandidatesCreated: number;
    message: string;
  } {
    const project = this.db.projects.getById(projectId);
    if (!project) throw new Error(`Project not found: ${projectId}`);

    let text = input.text?.trim() ?? '';
    if (!text && input.filePath) {
      text = fs.readFileSync(input.filePath, 'utf8');
    }
    if (!text) throw new Error('No preprocess response text to import');

    const parsed = parseFullNovelPreprocessResponse(text);
    assertMinimumKnowledgeFiles(parsed.files, 6);

    const bootstrapOut = knowledgeMarkdownToBootstrapOutput(parsed.files);
    const throughChapter = this.lastSourceChapterNumber(projectId);

    const persisted = persistBootstrapAnalysis(
      this.db,
      projectId,
      bootstrapOut,
      throughChapter,
      { temporalProvenance: input.temporalProvenance === true },
    );

    this.mergeStyleRules(projectId, parsed.files['01_TRANSLATION_RULES.md'] ?? '');

    // Save raw import beside exports for audit
    const auditDir = path.join(
      pathsService.getPath('exports'),
      'preprocess',
      projectId,
      'imports',
    );
    fs.mkdirSync(auditDir, { recursive: true });
    const stamp = Date.now();
    fs.writeFileSync(path.join(auditDir, `response-${stamp}.md`), text, 'utf8');
    for (const [key, body] of Object.entries(parsed.files)) {
      if (body) fs.writeFileSync(path.join(auditDir, key), body, 'utf8');
    }

    new NotebookKnowledgeBuilder(this.db).rebuildAndTrack(projectId);
    getNotebookSyncService(this.db).markDirty(projectId, 'ALL');

    this.db.projects.updateBootstrap(projectId, {
      bootstrap_status: 'COMPLETED',
      bootstrap_completed_at: utcNow(),
      bootstrap_version: BOOTSTRAP_VERSION,
      bootstrap_through_chapter: throughChapter,
    });

    this.db.knowledgeSyncEvents.insert({
      projectId,
      eventType: 'BOOTSTRAP_PERSISTED',
      message: 'Imported NotebookLM full-novel preprocess (00–07).',
      metadata: {
        foundKeys: parsed.foundKeys,
        missingKeys: parsed.missingKeys,
        ...persisted,
      },
    });

    return {
      foundKeys: parsed.foundKeys,
      missingKeys: parsed.missingKeys,
      charactersUpserted: persisted.charactersUpserted,
      relationshipsUpserted: persisted.relationshipsUpserted,
      termCandidatesCreated: persisted.termCandidatesCreated,
      message: `Imported ${parsed.foundKeys.length}/8 knowledge files; rebuilt 00–07.`,
    };
  }

  private lastSourceChapterNumber(projectId: string): number | null {
    const chapters = this.db.chapters
      .listByProject(projectId)
      .filter((c) => c.source_status === 'SOURCE_READY')
      .sort((a, b) => a.sequence_order - b.sequence_order);
    const last = chapters[chapters.length - 1];
    return last ? (last.chapter_number ?? last.sequence_order) : null;
  }

  private mergeStyleRules(projectId: string, rulesMd: string): void {
    const rules = extractStyleRulesFromMarkdown(rulesMd);
    if (rules.length === 0) return;
    const conn = this.db.getConnection();
    const row = conn
      .prepare(`SELECT style_config FROM project_settings WHERE project_id = ?`)
      .get(projectId) as { style_config: string | null } | undefined;

    let config: Record<string, unknown> = {};
    if (row?.style_config) {
      try {
        config = JSON.parse(row.style_config) as Record<string, unknown>;
      } catch {
        config = {};
      }
    }
    const existing = Array.isArray(config.rules) ? (config.rules as string[]) : [];
    config.rules = [...existing, ...rules.filter((r) => !existing.includes(r))].slice(0, 100);
    conn
      .prepare(`UPDATE project_settings SET style_config = ?, updated_at = ? WHERE project_id = ?`)
      .run(JSON.stringify(config), utcNow(), projectId);
  }
}
