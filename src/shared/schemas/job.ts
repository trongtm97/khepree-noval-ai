import { z } from 'zod';
import {
  ATTENTION_ACTIONS,
  JOB_ATTEMPT_STATES,
  JOB_STATES,
  REPAIR_PROMPT_MODES,
  REPAIR_REASONS,
  WORKER_MODES,
  WORKER_HEALTH,
} from '../constants/job';
import { QaResultSchema, ParsedBatchResultSchema } from './output-protocol';

export const RepairReasonSchema = z.enum(REPAIR_REASONS);
export const JobStateSchema = z.enum(JOB_STATES);
export const JobAttemptStateSchema = z.enum(JOB_ATTEMPT_STATES);
export const AttentionActionSchema = z.enum(ATTENTION_ACTIONS);
export const WorkerModeSchema = z.enum(WORKER_MODES);
export const WorkerHealthSchema = z.enum(WORKER_HEALTH);

export const RepairPromptPlanSchema = z.object({
  mode: z.enum(REPAIR_PROMPT_MODES),
  reason: RepairReasonSchema,
  prompt: z.string().min(1),
  /** Paragraph IDs targeted when re-translating; empty for deltas-only. */
  targetParagraphIds: z.array(z.string()),
  retranslate: z.boolean(),
});

export type RepairPromptPlan = z.infer<typeof RepairPromptPlanSchema>;

export const JobAttemptDtoSchema = z.object({
  id: z.string().uuid(),
  jobId: z.string().uuid(),
  attemptNumber: z.number().int().positive(),
  state: z.string(),
  reason: z.string().nullable(),
  inputRef: z.string().nullable(),
  output: z.string().nullable(),
  result: z.string().nullable(),
  error: z.string().nullable(),
  providerType: z.string().nullable().optional(),
  accountId: z.string().nullable().optional(),
  notebookId: z.string().nullable().optional(),
  threadRef: z.string().nullable().optional(),
  packMode: z.enum(['local_context', 'notebook_assisted']).nullable().optional(),
  knowledgeVersion: z.number().int().nonnegative().nullable().optional(),
  startedAt: z.string().nullable(),
  completedAt: z.string().nullable(),
});

export type JobAttemptDto = z.infer<typeof JobAttemptDtoSchema>;

export const JobDtoSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  type: z.string(),
  state: z.string(),
  workerId: z.string().nullable(),
  priority: z.number().int(),
  chapterFrom: z.number().int().nullable(),
  chapterTo: z.number().int().nullable(),
  workerMode: z.enum(WORKER_MODES),
  pinnedAccountId: z.string().nullable(),
  attemptCount: z.number().int().nonnegative(),
  error: z.string().nullable(),
  pausedReason: z.string().nullable(),
  maxRepairAttempts: z.number().int().positive(),
  repairRound: z.number().int().nonnegative(),
  lastQa: QaResultSchema.nullable(),
  lastParsed: ParsedBatchResultSchema.nullable(),
  attentionActions: z.array(AttentionActionSchema),
  /** Under-the-hood chapter send progress (chunks stay invisible as separate jobs). */
  progress: z
    .object({
      phase: z.string().optional(),
      chunkIndex: z.number().int().nonnegative().optional(),
      chunkTotal: z.number().int().positive().optional(),
      paragraphsDone: z.number().int().nonnegative().optional(),
      paragraphsTotal: z.number().int().nonnegative().optional(),
      /** Winning AI channel for this send (Web API vs Playwright Notebook). */
      providerType: z.string().optional(),
      /**
       * local_context = default ContextSelector pack (provider-neutral);
       * notebook_assisted = explicit opt-in future mode.
       */
      packMode: z.enum(['local_context', 'notebook_assisted']).optional(),
      notebookId: z.string().nullable().optional(),
      notebookName: z.string().nullable().optional(),
      notebookRole: z.enum(['TRANSLATION', 'RESEARCH', 'SINGLE']).nullable().optional(),
      notebookGroundingVerified: z.boolean().optional(),
      accountId: z.string().optional(),
      threadRef: z.string().nullable().optional(),
      knowledgeVersion: z.number().int().nonnegative().optional(),
      localKnowledgeVersion: z.number().int().nonnegative().optional(),
      notebookKnowledgeVersion: z.number().int().nonnegative().optional(),
      notebookVerifiedVersion: z.number().int().nonnegative().optional(),
      hotDeltaCount: z.number().int().nonnegative().optional(),
      knowledgeSourceMode: z.enum(['STATIC', 'LOCAL_ONLY']).optional(),
      continuationRound: z.number().int().nonnegative().optional(),
      lastCompletedParagraphId: z.string().nullable().optional(),
      timeline: z
        .array(
          z.object({
            at: z.string(),
            event: z.string(),
            message: z.string().optional(),
            detail: z.string().optional(),
          }),
        )
        .optional(),
      learning: z
        .object({
          candidatesCreated: z.number().int().nonnegative().optional(),
          memoryApplied: z.number().int().nonnegative().optional(),
          conflicts: z.number().int().nonnegative().optional(),
          consolidated: z.boolean().optional(),
          archived: z.number().int().nonnegative().optional(),
          emptyDeltas: z.boolean().optional(),
        })
        .optional(),
    })
    .nullable(),
  /** Local knowledge version frozen at first pack send for this job. */
  knowledgeVersionAtStart: z.number().int().nonnegative().nullable().optional(),
  /** Local knowledge version after post-PASS learning commit. */
  knowledgeVersionAtCommit: z.number().int().nonnegative().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  startedAt: z.string().nullable(),
  completedAt: z.string().nullable(),
});

export type JobDto = z.infer<typeof JobDtoSchema>;

export const JobListRequestSchema = z.object({
  projectId: z.string().uuid().optional(),
  limit: z.number().int().positive().max(200).optional(),
  offset: z.number().int().nonnegative().optional(),
  states: z.array(z.string().min(1).max(40)).max(20).optional(),
});

export const JobListResponseSchema = z.object({
  jobs: z.array(JobDtoSchema),
  total: z.number().int().nonnegative().optional(),
  limit: z.number().int().positive().optional(),
  offset: z.number().int().nonnegative().optional(),
});

export const JobGetRequestSchema = z.object({
  jobId: z.string().uuid(),
});

export const JobGetResponseSchema = z.object({
  job: JobDtoSchema,
  attempts: z.array(JobAttemptDtoSchema),
});

export const JobAttentionActionRequestSchema = z.object({
  jobId: z.string().uuid(),
  action: AttentionActionSchema,
  note: z.string().max(2000).optional(),
});

export const JobAttentionActionResponseSchema = z.object({
  job: JobDtoSchema,
  message: z.string(),
});

export const JobRecoverRequestSchema = z.object({
  jobId: z.string().uuid(),
});

export const JobRecoverResponseSchema = z.object({
  job: JobDtoSchema,
  crashed: z.number().int().nonnegative(),
});

export const RepairLoopResultSchema = z.object({
  jobId: z.string().uuid(),
  finalState: z.string(),
  repairRounds: z.number().int().nonnegative(),
  attempts: z.array(JobAttemptDtoSchema),
  qa: QaResultSchema.nullable(),
  parsed: ParsedBatchResultSchema.nullable(),
  message: z.string(),
});

export type RepairLoopResult = z.infer<typeof RepairLoopResultSchema>;

export const JobEnqueueRequestSchema = z.object({
  projectId: z.string().uuid(),
  chapterFrom: z.number().int().positive(),
  chapterTo: z.number().int().positive(),
  priority: z.number().int().optional(),
  workerMode: WorkerModeSchema.optional(),
  pinnedAccountId: z.string().uuid().nullable().optional(),
  sourceParagraphIds: z.array(z.string()).min(1),
  batchParagraphs: z.array(
    z.object({
      paragraphId: z.string(),
      sourceText: z.string(),
    }),
  ),
  maxRepairAttempts: z.number().int().positive().optional(),
});

export const JobEnqueueResponseSchema = z.object({
  job: JobDtoSchema,
  /** All chunk jobs when a chapter is auto-split (includes `job` as first). */
  jobs: z.array(JobDtoSchema).optional(),
});

export const JobEnqueueNovelRequestSchema = z.object({
  projectId: z.string().uuid(),
  chapterFrom: z.number().int().positive().optional(),
  chapterTo: z.number().int().positive().optional(),
  chapterIds: z.array(z.string().uuid()).optional(),
  skipTranslated: z.boolean().optional(),
  maxChaptersPerJob: z.number().int().positive().optional(),
  priority: z.number().int().optional(),
  workerMode: WorkerModeSchema.optional(),
  pinnedAccountId: z.string().uuid().nullable().optional(),
  maxRepairAttempts: z.number().int().positive().optional(),
});

export const JobEnqueueNovelResponseSchema = z.object({
  jobs: z.array(JobDtoSchema),
  queuedCount: z.number().int().nonnegative(),
  skippedCount: z.number().int().nonnegative(),
});

export const JobControlRequestSchema = z.object({
  jobId: z.string().uuid(),
});

export const JobBulkActionSchema = z.enum(['cancel', 'delete', 'retry']);

export const JobBulkRequestSchema = z.object({
  jobIds: z.array(z.string().uuid()).min(1).max(500),
  action: JobBulkActionSchema,
});

export const JobBulkResponseSchema = z.object({
  action: JobBulkActionSchema,
  affected: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative(),
  failed: z.array(
    z.object({
      jobId: z.string().uuid(),
      error: z.string(),
    }),
  ),
  message: z.string(),
});

export const JobMoveRequestSchema = z.object({
  jobId: z.string().uuid(),
  priority: z.number().int(),
});

export const JobChangeWorkerRequestSchema = z.object({
  jobId: z.string().uuid(),
  workerMode: WorkerModeSchema,
  pinnedAccountId: z.string().uuid().nullable().optional(),
});

export const JobControlResponseSchema = z.object({
  job: JobDtoSchema.nullable(),
  message: z.string(),
  affected: z.number().int().nonnegative().optional(),
});

export const SchedulerStatusResponseSchema = z.object({
  running: z.boolean(),
  paused: z.boolean(),
  inFlight: z.number().int().nonnegative(),
  maxConcurrent: z.number().int().positive(),
  globalMaxMode: z.union([z.literal('AUTO'), z.number().int().positive()]),
  autoCap: z.number().int().positive(),
  perProjectMax: z.number().int().positive(),
  perProviderMax: z.number().int().positive(),
  perAccountPlaywrightMax: z.number().int().positive(),
  perAccountWebApiMax: z.number().int().positive(),
  allowSameProjectParallel: z.boolean(),
  parallelTranslationWaves: z.boolean(),
  parallelWavesWarning: z.string(),
});

export const SchedulerSettingsUpdateSchema = z.object({
  globalMaxWorkers: z.union([z.literal('AUTO'), z.number().int().positive().max(16)]).optional(),
  autoCap: z.number().int().positive().max(16).optional(),
  perProjectMax: z.number().int().positive().max(16).optional(),
  perProviderMax: z.number().int().positive().max(16).optional(),
  perAccountPlaywrightMax: z.number().int().positive().max(4).optional(),
  perAccountWebApiMax: z.number().int().positive().max(4).optional(),
  allowSameProjectParallel: z.boolean().optional(),
  parallelTranslationWaves: z.boolean().optional(),
});

export const WorkerDtoSchema = z.object({
  id: z.string(),
  accountId: z.string(),
  health: z.string(),
  priority: z.number().int(),
  currentJobId: z.string().nullable(),
  limitedUntil: z.string().nullable(),
  lastError: z.string().nullable(),
});

export const WorkerListResponseSchema = z.object({
  workers: z.array(WorkerDtoSchema),
});
