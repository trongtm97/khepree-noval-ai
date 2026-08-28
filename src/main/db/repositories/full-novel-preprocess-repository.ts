import { BaseRepository } from './base-repository';
import { newId } from '../utils/uuid';
import { touchTimestamps, utcNow } from '../utils/timestamps';
import type {
  FullNovelPreprocessStage,
  PreprocessPartSourceStatus,
} from '@shared/constants/full-novel-preprocess';

export interface FullNovelPreprocessRunRow {
  id: string;
  project_id: string;
  google_account_id: string | null;
  stage: FullNovelPreprocessStage;
  correlation_id: string | null;
  prompt_hash: string | null;
  raw_response_path: string | null;
  output_dir: string | null;
  error_message: string | null;
  progress_json: string | null;
  created_at: string;
  updated_at: string;
}

export interface FullNovelPreprocessPartRow {
  id: string;
  run_id: string;
  part_index: number;
  file_name: string;
  file_path: string;
  content_hash: string;
  uploaded_hash: string | null;
  chapter_from: number | null;
  chapter_to: number | null;
  source_status: PreprocessPartSourceStatus;
  notebook_source_name: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

export interface FullNovelPreprocessProgressSnapshot {
  packingDone: number;
  packingTotal: number;
  sourcesUploaded: number;
  sourcesTotal: number;
  sourcesReady: number;
  sourcesIndexing: number;
  sourcesError: number;
  message?: string;
}

export interface CreateFullNovelPreprocessRunInput {
  project_id: string;
  google_account_id?: string | null;
  stage?: FullNovelPreprocessStage;
  output_dir?: string | null;
}

export interface UpsertPreprocessPartInput {
  run_id: string;
  part_index: number;
  file_name: string;
  file_path: string;
  content_hash: string;
  chapter_from?: number | null;
  chapter_to?: number | null;
  source_status?: PreprocessPartSourceStatus;
  notebook_source_name?: string | null;
  uploaded_hash?: string | null;
}

const ACTIVE_STAGES: FullNovelPreprocessStage[] = [
  'PACKING',
  'NOTEBOOK_READY',
  'SOURCES_UPLOADING',
  'SOURCES_UPLOADED',
  'SOURCES_INDEXING',
  'SOURCES_READY',
  'ANALYSIS_SENT',
  'ANALYSIS_RUNNING',
  'RESPONSE_CAPTURED',
  'RESPONSE_PARSED',
  'KNOWLEDGE_IMPORTED',
];

export class FullNovelPreprocessRepository extends BaseRepository {
  createRun(input: CreateFullNovelPreprocessRunInput): FullNovelPreprocessRunRow {
    const id = newId();
    const ts = touchTimestamps();
    this.db
      .prepare(
        `INSERT INTO full_novel_preprocess_runs (
          id, project_id, google_account_id, stage, correlation_id, prompt_hash,
          raw_response_path, output_dir, error_message, progress_json, created_at, updated_at
        ) VALUES (?, ?, ?, ?, NULL, NULL, NULL, ?, NULL, NULL, ?, ?)`,
      )
      .run(
        id,
        input.project_id,
        input.google_account_id ?? null,
        input.stage ?? 'PACKING',
        input.output_dir ?? null,
        ts.created_at,
        ts.updated_at,
      );
    return this.assertRow(this.getRunById(id), 'full_novel_preprocess_run', id);
  }

  getRunById(id: string): FullNovelPreprocessRunRow | null {
    return (
      (this.db
        .prepare(`SELECT * FROM full_novel_preprocess_runs WHERE id = ?`)
        .get(id) as FullNovelPreprocessRunRow | undefined) ?? null
    );
  }

  getActiveRun(projectId: string): FullNovelPreprocessRunRow | null {
    return (
      (this.db
        .prepare(
          `SELECT * FROM full_novel_preprocess_runs
           WHERE project_id = ? AND stage IN (${ACTIVE_STAGES.map(() => '?').join(',')})
           ORDER BY updated_at DESC LIMIT 1`,
        )
        .get(projectId, ...ACTIVE_STAGES) as FullNovelPreprocessRunRow | undefined) ?? null
    );
  }

  getLatestRun(projectId: string): FullNovelPreprocessRunRow | null {
    return (
      (this.db
        .prepare(
          `SELECT * FROM full_novel_preprocess_runs
           WHERE project_id = ? ORDER BY updated_at DESC LIMIT 1`,
        )
        .get(projectId) as FullNovelPreprocessRunRow | undefined) ?? null
    );
  }

  setStage(
    runId: string,
    stage: FullNovelPreprocessStage,
    patch?: {
      error_message?: string | null;
      correlation_id?: string | null;
      prompt_hash?: string | null;
      raw_response_path?: string | null;
      output_dir?: string | null;
      google_account_id?: string | null;
      progress?: FullNovelPreprocessProgressSnapshot | null;
    },
  ): FullNovelPreprocessRunRow {
    const existing = this.assertRow(this.getRunById(runId), 'full_novel_preprocess_run', runId);
    const now = utcNow();
    this.db
      .prepare(
        `UPDATE full_novel_preprocess_runs SET
          stage = ?,
          error_message = ?,
          correlation_id = ?,
          prompt_hash = ?,
          raw_response_path = ?,
          output_dir = ?,
          google_account_id = ?,
          progress_json = ?,
          updated_at = ?
         WHERE id = ?`,
      )
      .run(
        stage,
        patch?.error_message !== undefined ? patch.error_message : existing.error_message,
        patch?.correlation_id !== undefined ? patch.correlation_id : existing.correlation_id,
        patch?.prompt_hash !== undefined ? patch.prompt_hash : existing.prompt_hash,
        patch?.raw_response_path !== undefined
          ? patch.raw_response_path
          : existing.raw_response_path,
        patch?.output_dir !== undefined ? patch.output_dir : existing.output_dir,
        patch?.google_account_id !== undefined
          ? patch.google_account_id
          : existing.google_account_id,
        patch?.progress !== undefined
          ? patch.progress
            ? JSON.stringify(patch.progress)
            : null
          : existing.progress_json,
        now,
        runId,
      );
    return this.assertRow(this.getRunById(runId), 'full_novel_preprocess_run', runId);
  }

  parseProgress(run: FullNovelPreprocessRunRow): FullNovelPreprocessProgressSnapshot | null {
    if (!run.progress_json) return null;
    try {
      return JSON.parse(run.progress_json) as FullNovelPreprocessProgressSnapshot;
    } catch {
      return null;
    }
  }

  listParts(runId: string): FullNovelPreprocessPartRow[] {
    return this.db
      .prepare(
        `SELECT * FROM full_novel_preprocess_parts WHERE run_id = ? ORDER BY part_index ASC`,
      )
      .all(runId) as FullNovelPreprocessPartRow[];
  }

  upsertPart(input: UpsertPreprocessPartInput): FullNovelPreprocessPartRow {
    const existing = this.db
      .prepare(
        `SELECT * FROM full_novel_preprocess_parts WHERE run_id = ? AND part_index = ?`,
      )
      .get(input.run_id, input.part_index) as FullNovelPreprocessPartRow | undefined;

    if (existing) {
      const hashMatch = existing.content_hash === input.content_hash;
      const uploadedMatch =
        hashMatch &&
        (existing.uploaded_hash === input.content_hash ||
          input.uploaded_hash === input.content_hash);
      const now = utcNow();
      this.db
        .prepare(
          `UPDATE full_novel_preprocess_parts SET
            file_name = ?,
            file_path = ?,
            content_hash = ?,
            uploaded_hash = ?,
            chapter_from = ?,
            chapter_to = ?,
            source_status = ?,
            notebook_source_name = ?,
            last_error = CASE WHEN ? THEN last_error ELSE NULL END,
            updated_at = ?
           WHERE id = ?`,
        )
        .run(
          input.file_name,
          input.file_path,
          input.content_hash,
          hashMatch ? (input.uploaded_hash ?? existing.uploaded_hash) : null,
          input.chapter_from ?? null,
          input.chapter_to ?? null,
          uploadedMatch &&
            (existing.source_status === 'READY' || existing.source_status === 'SKIPPED')
            ? existing.source_status
            : hashMatch &&
                (existing.source_status === 'UPLOADED' ||
                  existing.source_status === 'PROCESSING')
              ? existing.source_status
              : (input.source_status ?? 'PENDING'),
          input.notebook_source_name ?? existing.notebook_source_name ?? input.file_name,
          hashMatch ? 1 : 0,
          now,
          existing.id,
        );
      return this.assertRow(this.getPartById(existing.id), 'full_novel_preprocess_part', existing.id);
    }

    const id = newId();
    const ts = touchTimestamps();
    this.db
      .prepare(
        `INSERT INTO full_novel_preprocess_parts (
          id, run_id, part_index, file_name, file_path, content_hash, uploaded_hash,
          chapter_from, chapter_to, source_status, notebook_source_name, last_error,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
      )
      .run(
        id,
        input.run_id,
        input.part_index,
        input.file_name,
        input.file_path,
        input.content_hash,
        input.uploaded_hash ?? null,
        input.chapter_from ?? null,
        input.chapter_to ?? null,
        input.source_status ?? 'PENDING',
        input.notebook_source_name ?? input.file_name,
        ts.created_at,
        ts.updated_at,
      );
    return this.assertRow(this.getPartById(id), 'full_novel_preprocess_part', id);
  }

  getPartById(id: string): FullNovelPreprocessPartRow | null {
    return (
      (this.db
        .prepare(`SELECT * FROM full_novel_preprocess_parts WHERE id = ?`)
        .get(id) as FullNovelPreprocessPartRow | undefined) ?? null
    );
  }

  updatePartStatus(
    partId: string,
    sourceStatus: PreprocessPartSourceStatus,
    patch?: {
      last_error?: string | null;
      notebook_source_name?: string | null;
      uploaded_hash?: string | null;
    },
  ): FullNovelPreprocessPartRow {
    const existing = this.assertRow(this.getPartById(partId), 'full_novel_preprocess_part', partId);
    const now = utcNow();
    this.db
      .prepare(
        `UPDATE full_novel_preprocess_parts SET
          source_status = ?,
          last_error = ?,
          notebook_source_name = ?,
          uploaded_hash = ?,
          updated_at = ?
         WHERE id = ?`,
      )
      .run(
        sourceStatus,
        patch?.last_error !== undefined ? patch.last_error : existing.last_error,
        patch?.notebook_source_name !== undefined
          ? patch.notebook_source_name
          : existing.notebook_source_name,
        patch?.uploaded_hash !== undefined ? patch.uploaded_hash : existing.uploaded_hash,
        now,
        partId,
      );
    return this.assertRow(this.getPartById(partId), 'full_novel_preprocess_part', partId);
  }

  findPartByHash(runId: string, contentHash: string): FullNovelPreprocessPartRow | null {
    return (
      (this.db
        .prepare(
          `SELECT * FROM full_novel_preprocess_parts
           WHERE run_id = ? AND content_hash = ? LIMIT 1`,
        )
        .get(runId, contentHash) as FullNovelPreprocessPartRow | undefined) ?? null
    );
  }

  partsNeedingUpload(runId: string): FullNovelPreprocessPartRow[] {
    return this.listParts(runId).filter(
      (p) =>
        p.source_status === 'PENDING' ||
        p.source_status === 'ERROR' ||
        (p.uploaded_hash !== p.content_hash &&
          p.source_status !== 'SKIPPED'),
    );
  }

  allPartsReady(runId: string): boolean {
    const parts = this.listParts(runId);
    if (parts.length === 0) return false;
    return parts.every((p) => p.source_status === 'READY' || p.source_status === 'SKIPPED');
  }
}
