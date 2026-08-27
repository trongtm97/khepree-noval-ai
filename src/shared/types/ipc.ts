import type {
  GetInfoResponse,
  GetPathsResponse,
  GetVersionResponse,
  OpenFolderResponse,
  OpenGuideResponse,
  PingResponse,
  SecurityHealthCheckResponse,
} from '../schemas/ipc';
import type { AppGuideId } from '../constants/guides';
import type {
  GoogleAccountDto,
} from '../schemas/account';
import type {
  ImportPreviewDto,
  ProjectDto,
} from '../schemas/import';
import type {
  FolderPreviewDto,
  FolderScanResultDto,
  SourceFolderEventDto,
  SourceFolderSettingsDto,
} from '../schemas/source-folder';
import type { ProjectMetadataDto } from '../schemas/book-metadata';
import type { TermCandidateDto, TermDto } from '../schemas/term';
import type {
  CharacterDto,
  MemoryConflictDto,
  MemoryContextDto,
  RelationshipDto,
  StoryStateDto,
} from '../schemas/memory';
import type {
  ChapterSummaryDto,
  TranslationPackDto,
} from '../schemas/translation-pack';
import type { CharacterStatus } from '../constants/memory';
import type { TranslationStyle } from '../constants/translation-pack';
import type { DriveSyncStatusDto } from '../schemas/drive';
import type { NotebookMappingDto } from '../schemas/notebook';
import type { GeminiSendResponse } from '../schemas/gemini';
import type { JobAttemptDto, JobDto } from '../schemas/job';
import type { AttentionAction } from '../constants/job';
import type { AppPathKey } from '../constants/paths';
import type { GoogleAccountPlan } from '../constants/google-account';
import type { ReviewAction, TermScope, TermStatus, TermType } from '../constants/term';
import type { LearningDashboardResponse } from '../schemas/learning';
import type {
  EditorClearChapterTranslationsResponseSchema,
  EditorClearChaptersTranslationsResponseSchema,
  EditorContextResponseSchema,
  EditorGetChapterResponseSchema,
  EditorListVersionsResponseSchema,
  EditorRetranslateChapterResponseSchema,
  EditorRetranslateChaptersResponseSchema,
  EditorRevertVersionResponseSchema,
  EditorSaveParagraphResponseSchema,
} from '../schemas/translation-editor';
import type { z } from 'zod';
import type {
  AutoBackupConfigSchema,
  CreateBackupResponseSchema,
  ListBackupsResponseSchema,
  NovelExportResponseSchema,
  PreviewRestoreResponseSchema,
  RestoreBackupResponseSchema,
  SelectExportPathResponseSchema,
  TermCommitImportResponseSchema,
  TermImportPreviewResponseSchema,
} from '../schemas/portability';
import type { NovelExportFormat } from '../constants/portability';
import type { TermImportDuplicateStrategy } from '../constants/portability';
import type { AutomationProviderId } from '../constants/diagnostics';
import type {
  ConnectionTestResponseSchema,
  AiBrowserProbeResponseSchema,
  GoogleSmokeRunResponseSchema,
  NotebookGroundingSmokeRunResponseSchema,
  ExportDiagnosticsResponseSchema,
  GetHealthReportResponseSchema,
  InteractiveRepairApplyResponseSchema,
  InteractiveRepairCaptureResponseSchema,
  InteractiveRepairStartResponseSchema,
  ListProviderStatusResponseSchema,
} from '../schemas/diagnostics';
import type {
  GetSelectorOverridesResponseSchema,
  LoadSelectorOverridesResponseSchema,
  SaveSelectorOverridesResponseSchema,
  SelectorOverrideFile,
} from '../schemas/selector-override';
import type {
  CheckForUpdatesResponseSchema,
  SetupCompleteResponseSchema,
  SetupExploreResponseSchema,
  SetupStatusSchema,
} from '../schemas/setup';
import type { SetupWizardStep } from '../constants/setup';
import type {
  AiAccountActionResponseSchema,
  AiAccountListResponseSchema,
  AiModelsListResponseSchema,
  AiProviderHealthResponseSchema,
  AiProviderListResponseSchema,
  AiWorkerInstallResponseSchema,
} from '../schemas/ai-provider';
import type { AiResponseStatus } from '../constants/ai-provider';

export interface NovelTransApi {
  ping: () => Promise<PingResponse>;
  getVersion: () => Promise<GetVersionResponse>;
  getInfo: () => Promise<GetInfoResponse>;
  getPaths: () => Promise<GetPathsResponse>;
  openFolder: (pathKey: AppPathKey) => Promise<OpenFolderResponse>;
  openGuide: (guideId: AppGuideId) => Promise<OpenGuideResponse>;
  securityHealthCheck: () => Promise<SecurityHealthCheckResponse>;
  checkForUpdates: () => Promise<z.infer<typeof CheckForUpdatesResponseSchema>>;
  setup: {
    getStatus: () => Promise<z.infer<typeof SetupStatusSchema>>;
    setStep: (input: { step: SetupWizardStep }) => Promise<z.infer<typeof SetupStatusSchema>>;
    skipDrive: (input: { skip: boolean }) => Promise<z.infer<typeof SetupStatusSchema>>;
    explore: (input: { confirm: true }) => Promise<z.infer<typeof SetupExploreResponseSchema>>;
    complete: (input: { confirm: true }) => Promise<z.infer<typeof SetupCompleteResponseSchema>>;
  };
  logs: {
    tail: (input?: {
      maxLines?: number;
      level?: 'all' | 'info' | 'warn' | 'error' | 'debug';
    }) => Promise<import('../schemas/logs').LogsTailResponse>;
    openDir: () => Promise<{ ok: true; path: string }>;
  };
  accounts: {
    list: () => Promise<{ accounts: GoogleAccountDto[] }>;
    get: (accountId: string) => Promise<{ account: GoogleAccountDto }>;
    add: (input?: {
      label?: string;
      email?: string | null;
      skipBrowser?: boolean;
    }) => Promise<{ account: GoogleAccountDto }>;
    rename: (accountId: string, label: string) => Promise<{ account: GoogleAccountDto }>;
    setPlan: (
      accountId: string,
      plan: GoogleAccountPlan,
    ) => Promise<{ account: GoogleAccountDto }>;
    setNotes: (
      accountId: string,
      notes: string | null,
    ) => Promise<{ account: GoogleAccountDto }>;
    openBrowser: (
      accountId: string,
      target?: 'gemini' | 'drive' | 'notebook',
    ) => Promise<{ account: GoogleAccountDto }>;
    closeBrowser: (accountId: string) => Promise<{ account: GoogleAccountDto }>;
    testSession: (accountId: string) => Promise<{
      account: GoogleAccountDto;
      usable: boolean;
      email: string | null;
      reason?: string;
    }>;
    completeLogin: (
      accountId: string,
      input?: { email?: string; label?: string },
    ) => Promise<{ account: GoogleAccountDto }>;
    connectDrive: (accountId: string) => Promise<{ account: GoogleAccountDto }>;
    connectDriveWithAuth: (
      accountId: string,
      authPayload: string,
    ) => Promise<{ account: GoogleAccountDto }>;
    disconnectDrive: (accountId: string) => Promise<{ account: GoogleAccountDto }>;
    disable: (accountId: string) => Promise<{ account: GoogleAccountDto }>;
    enable: (accountId: string) => Promise<{ account: GoogleAccountDto }>;
    remove: (accountId: string) => Promise<{ ok: true }>;
  };
  projects: {
    list: () => Promise<{ projects: ProjectDto[] }>;
    create: (input: {
      title: string;
      genre?: string | null;
      description?: string | null;
      sourceLanguage?: string;
      targetLanguage?: string;
      sampleText?: string;
    }) => Promise<{
      project: ProjectDto;
      sourceDetection?: {
        code: string;
        displayNameVi: string;
        displayNameNative: string;
        confidence: number;
        method: 'heuristic' | 'ai' | 'hint' | 'fallback';
        needsUserConfirm: boolean;
      } | null;
    }>;
    get: (projectId: string) => Promise<{ project: ProjectDto }>;
    delete: (projectId: string) => Promise<{ ok: true }>;
    updateLanguages: (input: {
      projectId: string;
      sourceLanguage: string;
      targetLanguage: string;
    }) => Promise<{ project: ProjectDto }>;
    resolveWorker: (input: {
      projectId: string;
      purpose?:
        | 'translation'
        | 'notebook'
        | 'research'
        | 'drive_sync'
        | 'preprocess'
        | 'diagnostics';
      preferredAccountId?: string | null;
      jobId?: string | null;
    }) => Promise<import('../schemas/project-worker').ProjectWorkerResolutionDto>;
    setWorker: (input: {
      projectId: string;
      accountId: string;
      ensureNotebook?: boolean;
    }) => Promise<import('../schemas/project-worker').ProjectWorkerSetResponse>;
  };
  editions: {
    list: (projectId: string) => Promise<{
      editions: {
        id: string;
        projectId: string;
        targetLanguage: string;
        name: string;
        status: string;
        styleConfig: string | null;
        createdAt: string;
        updatedAt: string;
        isActive: boolean;
      }[];
    }>;
    create: (input: {
      projectId: string;
      targetLanguage: string;
      name?: string;
      activate?: boolean;
    }) => Promise<{
      edition: {
        id: string;
        projectId: string;
        targetLanguage: string;
        name: string;
        status: string;
        styleConfig: string | null;
        createdAt: string;
        updatedAt: string;
        isActive: boolean;
      };
      editions: {
        id: string;
        projectId: string;
        targetLanguage: string;
        name: string;
        status: string;
        styleConfig: string | null;
        createdAt: string;
        updatedAt: string;
        isActive: boolean;
      }[];
    }>;
    switch: (input: {
      projectId: string;
      editionId: string;
    }) => Promise<{
      edition: {
        id: string;
        projectId: string;
        targetLanguage: string;
        name: string;
        status: string;
        styleConfig: string | null;
        createdAt: string;
        updatedAt: string;
        isActive: boolean;
      };
      editions: {
        id: string;
        projectId: string;
        targetLanguage: string;
        name: string;
        status: string;
        styleConfig: string | null;
        createdAt: string;
        updatedAt: string;
        isActive: boolean;
      }[];
    }>;
  };
  languages: {
    list: () => Promise<{
      languages: import('../schemas/language-profile').LanguageProfileDto[];
    }>;
    detect: (input: {
      sampleText: string;
      hintCode?: string;
    }) => Promise<import('../schemas/language-profile').LanguageDetectResponse>;
  };
  import: {
    selectFile: () => Promise<{ canceled: boolean; filePath: string | null }>;
    preview: (filePath: string) => Promise<{ preview: ImportPreviewDto }>;
    updatePreview: (input: {
      previewId: string;
      redetect?: boolean;
      manualSplits?: { offset: number; title?: string }[];
      chapterPatches?: {
        chapterNumber: number;
        title?: string;
        include?: boolean;
      }[];
    }) => Promise<{ preview: ImportPreviewDto }>;
    commit: (input: {
      previewId: string;
      projectTitle: string;
      projectId?: string;
    }) => Promise<{
      project: ProjectDto;
      chapterCount: number;
      paragraphCount: number;
    }>;
    discard: (previewId: string) => Promise<{ ok: true }>;
  };
  sourceFolder: {
    selectFolder: () => Promise<{ canceled: boolean; folderPath: string | null }>;
    scanPreview: (input: {
      folderPath: string;
      expectedStartChapter?: number;
      expectedEndChapter?: number;
    }) => Promise<{ preview: FolderPreviewDto }>;
    scan: (projectId: string) => Promise<{ scanResult: FolderScanResultDto }>;
    import: (input: {
      previewId?: string;
      projectId?: string;
      projectTitle: string;
      genre?: string | null;
      description?: string | null;
      chineseTitle?: string | null;
      sourceLanguage?: string | null;
      targetLanguage?: string | null;
      accountId?: string | null;
      styleConfig?: Record<string, unknown> | null;
      expectedStartChapter?: number | null;
      expectedEndChapter?: number | null;
      chapterNumbers?: number[];
    }) => Promise<{
      project: ProjectDto;
      chapterCount: number;
      paragraphCount: number;
    }>;
    getStatus: (projectId: string) => Promise<{
      projectId: string;
      settings: SourceFolderSettingsDto;
      scanSummary: {
        filesTotal: number;
        recognizedFiles: number;
        newCount: number;
        modifiedCount: number;
        missingCount: number;
        conflictCount: number;
        errorCount: number;
        watching: boolean;
      } | null;
    }>;
    updateSettings: (input: {
      projectId: string;
      watchFolderEnabled?: boolean;
      scanOnStartup?: boolean;
      autoImportNewChapters?: boolean;
      autoQueueNewChapters?: boolean;
      autoTranslateNewChapters?: boolean;
      expectedStartChapter?: number | null;
      expectedEndChapter?: number | null;
    }) => Promise<{ settings: SourceFolderSettingsDto }>;
    changeFolder: (input: {
      projectId: string;
      newFolderPath: string;
      confirm?: boolean;
    }) => Promise<{ preview: FolderScanResultDto; applied: boolean }>;
    resolveConflict: (input: {
      projectId: string;
      chapterNumber: number;
      chosenFilePath: string;
    }) => Promise<{ ok: true }>;
    markRetranslate: (input: {
      projectId: string;
      chapterId: string;
    }) => Promise<{ ok: true }>;
    getSourceDiff: (input: {
      projectId: string;
      chapterId: string;
    }) => Promise<{ oldText: string; newText: string; lines: { kind: string; lineNumber: number; oldLine?: string; newLine?: string }[] }>;
    openFolder: (projectId: string) => Promise<{ ok: true }>;
    cancelScan: (projectId: string) => Promise<{ ok: true }>;
    onEvent: (callback: (event: SourceFolderEventDto) => void) => () => void;
  };
  bookMetadata: {
    get: (projectId: string) => Promise<{ metadata: ProjectMetadataDto }>;
    update: (input: {
      projectId: string;
      metadata: Partial<ProjectMetadataDto>;
    }) => Promise<{ metadata: ProjectMetadataDto }>;
    listDocuments: (projectId: string) => Promise<{
      documents: {
        id: string;
        documentType: string;
        title: string | null;
        sourceFileName: string | null;
        sourceFilePath: string | null;
        status: string;
        updatedAt: string;
      }[];
    }>;
    syncProfile: (projectId: string) => Promise<{ ok: true }>;
  };
  terms: {
    search: (filters?: {
      chinese?: string;
      vietnamese?: string;
      pinyin?: string;
      type?: TermType;
      scope?: TermScope;
      scopeRef?: string;
      status?: TermStatus;
      genre?: string;
      projectId?: string;
      limit?: number;
      offset?: number;
    }) => Promise<{ terms: TermDto[] }>;
    reviewQueue: () => Promise<{ terms: TermDto[] }>;
    get: (termId: string) => Promise<{ term: TermDto }>;
    upsert: (input: {
      id?: string;
      sourceText: string;
      simplified?: string;
      traditional?: string | null;
      pinyin?: string | null;
      preferredTranslation?: string;
      alternativeTranslations?: string[];
      type?: TermType;
      meaning?: string | null;
      scope: TermScope;
      scopeRef?: string | null;
      genre?: string | null;
      confidence?: number | null;
      status?: TermStatus;
      notes?: string | null;
      locked?: boolean;
    }) => Promise<{ term: TermDto }>;
    review: (input: {
      action: ReviewAction;
      termIds: string[];
      patch?: Record<string, unknown>;
      mergeIntoTermId?: string;
      targetScope?: TermScope;
      scopeRef?: string | null;
    }) => Promise<{ terms: TermDto[]; affected: number }>;
    listCandidates: (input?: {
      projectId?: string;
      limit?: number;
    }) => Promise<{ candidates: TermCandidateDto[] }>;
    candidateReview: (input: {
      candidateIds: string[];
      action: 'accept' | 'reject';
      patch?: Record<string, unknown>;
    }) => Promise<{ terms: TermDto[]; affected: number }>;
    import: (input: {
      format: 'csv' | 'json';
      content: string;
      scope?: TermScope;
      scopeRef?: string | null;
    }) => Promise<{ terms: TermDto[] }>;
    export: (input: {
      format: 'csv' | 'json';
      filters?: Record<string, unknown>;
    }) => Promise<{ format: 'csv' | 'json'; content: string; count: number }>;
    previewImport: (input: {
      format: 'csv' | 'json';
      content: string;
      projectId?: string;
    }) => Promise<z.infer<typeof TermImportPreviewResponseSchema>>;
    commitImport: (input: {
      format: 'csv' | 'json';
      content: string;
      scope: TermScope;
      scopeRef?: string | null;
      duplicateStrategy?: TermImportDuplicateStrategy;
    }) => Promise<z.infer<typeof TermCommitImportResponseSchema>>;
  };
  memory: {
    listCharacters: (projectId: string) => Promise<{ characters: CharacterDto[] }>;
    upsertCharacter: (input: {
      id?: string;
      projectId: string;
      canonicalName: string;
      translatedName?: string | null;
      aliases?: string[];
      gender?: string | null;
      role?: string | null;
      description?: string | null;
      firstChapter?: number | null;
      lastChapter?: number | null;
      status?: CharacterStatus;
      locked?: boolean;
    }) => Promise<{ character: CharacterDto }>;
    listRelationships: (input: {
      projectId: string;
      atChapter?: number;
    }) => Promise<{ relationships: RelationshipDto[] }>;
    upsertRelationship: (input: {
      id?: string;
      projectId: string;
      fromCharacterId: string;
      toCharacterId: string;
      relationshipType: string;
      description?: string | null;
      aCallsB?: string | null;
      bCallsA?: string | null;
      validFromChapter?: number | null;
      validToChapter?: number | null;
      confidence?: number | null;
      source?: string;
      locked?: boolean;
    }) => Promise<{ relationship: RelationshipDto }>;
    getStoryState: (projectId: string) => Promise<{ storyState: StoryStateDto }>;
    patchStoryState: (input: {
      projectId: string;
      summaryText?: string | null;
      cultivationState?: Record<string, unknown>;
      locationState?: Record<string, unknown>;
      importantItems?: Record<string, unknown>[];
      unresolvedPlotPoints?: string[];
      currentChapterNumber?: number | null;
      locked?: boolean;
    }) => Promise<{ storyState: StoryStateDto }>;
    applyDelta: (input: {
      projectId: string;
      delta: unknown;
      chapterNumber?: number;
    }) => Promise<{
      applied: number;
      skipped: number;
      conflicts: MemoryConflictDto[];
    }>;
    listConflicts: (projectId: string) => Promise<{ conflicts: MemoryConflictDto[] }>;
    resolveConflict: (input: {
      conflictId: string;
      status: 'RESOLVED' | 'DISCARDED';
    }) => Promise<{ conflict: MemoryConflictDto }>;
    buildContext: (input: {
      projectId: string;
      chapterIds: string[];
      tokenBudget?: number;
      recentWindow?: number;
    }) => Promise<{ context: MemoryContextDto }>;
  };
  pack: {
    listChapters: (projectId: string) => Promise<{ chapters: ChapterSummaryDto[] }>;
    build: (input: {
      projectId: string;
      chapterIds: string[];
      style?: TranslationStyle;
      tokenBudget?: number;
      recentWindow?: number;
      extraRules?: string[];
    }) => Promise<{ pack: TranslationPackDto }>;
  };
  drive: {
    oauthStatus: () =>
      Promise<{
        configured: boolean;
        clientIdHint: string | null;
        redirectUri: string;
      }>;
    setOAuthClient: (input: {
      clientId: string;
      clientSecret?: string;
    }) => Promise<{ ok: true }>;
    getStatus: (projectId: string) => Promise<{ status: DriveSyncStatusDto }>;
    assignWorker: (input: {
      projectId: string;
      accountId: string;
    }) => Promise<{ status: DriveSyncStatusDto }>;
    setSchedule: (input: {
      projectId: string;
      everyNChapters: number;
    }) => Promise<{ status: DriveSyncStatusDto }>;
    provision: (projectId: string) => Promise<{ status: DriveSyncStatusDto }>;
    sync: (input: {
      projectId: string;
      force?: boolean;
    }) => Promise<{
      result: { updated: number; skipped: number; errors: string[] };
      status: DriveSyncStatusDto;
    }>;
    retry: (projectId: string) => Promise<{
      result: { updated: number; skipped: number; errors: string[] };
      status: DriveSyncStatusDto;
    }>;
  };
  notebook: {
    list: (projectId: string) => Promise<{ mappings: NotebookMappingDto[] }>;
    get: (
      projectId: string,
      accountId: string,
    ) => Promise<{ mapping: NotebookMappingDto | null }>;
    provision: (input: {
      projectId: string;
      accountId: string;
      headless?: boolean;
      role?: 'SINGLE' | 'RESEARCH' | 'TRANSLATION';
    }) => Promise<{
      mapping: NotebookMappingDto;
      assisted: boolean;
      message: string;
    }>;
    resume: (input: {
      projectId: string;
      accountId: string;
      headless?: boolean;
      role?: 'SINGLE' | 'RESEARCH' | 'TRANSLATION';
    }) => Promise<{
      mapping: NotebookMappingDto;
      assisted: boolean;
      message: string;
    }>;
    health: (input: {
      projectId: string;
      accountId?: string;
      role?: 'SINGLE' | 'RESEARCH' | 'TRANSLATION';
      dual?: boolean;
    }) => Promise<
      | import('../schemas/notebook').NotebookHealthDto
      | import('../schemas/notebook').NotebookDualHealthDto
    >;
    syncNow: (input: {
      projectId: string;
      accountId?: string;
    }) => Promise<import('../schemas/notebook').NotebookHealthDto>;
    rebuild: (
      projectId: string,
    ) => Promise<import('../schemas/notebook').NotebookHealthDto>;
    bootstrap: (input: {
      projectId: string;
      seed?: boolean;
    }) => Promise<{
      rebuilt: boolean;
      seeded: boolean;
      chapterCount: number;
      message: string;
    }>;
    prepareForTranslate: (input: {
      projectId: string;
      accountId?: string | null;
    }) => Promise<{
      ready: boolean;
      usedFallback: boolean;
      message: string;
      notebookStatus: string | null;
      needsAssisted: boolean;
    }>;
    ensureForTranslate: (input: {
      projectId: string;
      accountId?: string | null;
    }) => Promise<import('../schemas/translate-readiness').TranslateEnsureReadyResponse>;
    runBootstrapAnalysis: (input: {
      projectId: string;
      mode?: 'SAFE' | 'BALANCED' | 'DEEP';
      googleAccountId?: string | null;
      rebootstrap?: boolean;
    }) => Promise<{
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
    }>;
    skipBootstrap: (projectId: string) => Promise<{
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
    }>;
    getBootstrapStatus: (projectId: string) => Promise<{
      status: string;
      throughChapter: number | null;
      version: string;
      chapterCount: number;
      startedAt: string | null;
      completedAt: string | null;
      characterCount: number;
      relationshipCount: number;
      termCandidateCount: number;
    }>;
    packNovelCorpus: (input: {
      projectId: string;
      outputDir?: string;
    }) => Promise<{
      outputDir: string;
      parts: {
        fileName: string;
        filePath: string;
        wordCount: number;
        byteLength: number;
        chapterFrom: number;
        chapterTo: number;
      }[];
      totalWords: number;
      totalChapters: number;
      underSinglePartLimit: boolean;
    }>;
    getPreprocessPrompt: (input: {
      projectId: string;
      partFileNames?: string[];
    }) => Promise<{
      prompt: string;
      promptPath: string | null;
      partFileNames: string[];
    }>;
    importPreprocessResult: (input: {
      projectId: string;
      text?: string;
      filePath?: string;
      syncDrive?: boolean;
    }) => Promise<{
      foundKeys: string[];
      missingKeys: string[];
      charactersUpserted: number;
      relationshipsUpserted: number;
      termCandidatesCreated: number;
      message: string;
    }>;
    selectPreprocessResultPath: () => Promise<{
      canceled: boolean;
      filePath: string | null;
    }>;
    runAutoPreprocess: (input: {
      projectId: string;
      forceFull?: boolean;
      googleAccountId?: string | null;
    }) => Promise<{
      mode: 'quick' | 'full';
      status: 'completed' | 'completed_with_warnings' | 'failed' | 'needs_assisted';
      message: string;
      foundKeys: string[];
      needsAssisted: boolean;
      steps: string[];
      accountId: string | null;
    }>;
    getAutoPreprocessProgress: (projectId: string) => Promise<{
      projectId: string;
      step: string | null;
      message: string | null;
      mode: 'quick' | 'full' | null;
      updatedAt: number | null;
    }>;
    resetAiMemory: (input: {
      projectId: string;
      confirm: true;
      runInitAfter?: boolean;
      forceFull?: boolean;
      googleAccountId?: string | null;
    }) => Promise<{
      charactersDeleted: number;
      relationshipsDeleted: number;
      memoryEventsDeleted: number;
      termCandidatesDeleted: number;
      projectTermsUnlinked: number;
      projectScopedTermsDeleted: number;
      storyCleared: boolean;
      conflictsDeleted: number;
      archivesDeleted: number;
      message: string;
      init?: {
        mode: 'quick' | 'full';
        status: string;
        message: string;
        foundKeys: string[];
        needsAssisted: boolean;
        steps: string[];
        accountId: string | null;
      } | null;
    }>;
  };
  gemini: {
    send: (input: {
      projectId: string;
      accountId: string;
      pack: TranslationPackDto;
      headless?: boolean;
      maxTimeoutMs?: number;
      stabilizationWindowMs?: number;
    }) => Promise<GeminiSendResponse>;
  };
  jobs: {
    list: (projectId?: string) => Promise<{ jobs: JobDto[] }>;
    get: (jobId: string) => Promise<{ job: JobDto; attempts: JobAttemptDto[] }>;
    attention: (input: {
      jobId: string;
      action: AttentionAction;
      note?: string;
    }) => Promise<{ job: JobDto; message: string }>;
    recover: (jobId: string) => Promise<{ job: JobDto; crashed: number }>;
    enqueue: (input: {
      projectId: string;
      chapterFrom: number;
      chapterTo: number;
      priority?: number;
      workerMode?: 'PINNED' | 'POOL';
      pinnedAccountId?: string | null;
      sourceParagraphIds: string[];
      batchParagraphs: { paragraphId: string; sourceText: string }[];
      maxRepairAttempts?: number;
    }) => Promise<{ job: JobDto }>;
    enqueueNovel: (input: {
      projectId: string;
      chapterFrom?: number;
      chapterTo?: number;
      chapterIds?: string[];
      skipTranslated?: boolean;
      priority?: number;
      workerMode?: 'PINNED' | 'POOL';
      pinnedAccountId?: string | null;
      maxRepairAttempts?: number;
    }) => Promise<{
      jobs: JobDto[];
      queuedCount: number;
      skippedCount: number;
    }>;
    cancel: (jobId: string) => Promise<{ job: JobDto | null; message: string }>;
    retry: (jobId: string) => Promise<{ job: JobDto | null; message: string }>;
    bulk: (input: {
      jobIds: string[];
      action: 'cancel' | 'delete' | 'retry';
    }) => Promise<{
      action: 'cancel' | 'delete' | 'retry';
      affected: number;
      skipped: number;
      failed: { jobId: string; error: string }[];
      message: string;
    }>;
    move: (
      jobId: string,
      priority: number,
    ) => Promise<{ job: JobDto | null; message: string }>;
    changeWorker: (input: {
      jobId: string;
      workerMode: 'PINNED' | 'POOL';
      pinnedAccountId?: string | null;
    }) => Promise<{ job: JobDto | null; message: string }>;
    pauseAll: () => Promise<{
      job: JobDto | null;
      message: string;
      affected?: number;
    }>;
    resumeAll: () => Promise<{
      job: JobDto | null;
      message: string;
      affected?: number;
    }>;
    schedulerStatus: () => Promise<{
      running: boolean;
      paused: boolean;
      inFlight: number;
      maxConcurrent: number;
      globalMaxMode: 'AUTO' | number;
      autoCap: number;
      perProjectMax: number;
      perProviderMax: number;
      perAccountPlaywrightMax: number;
      perAccountWebApiMax: number;
      allowSameProjectParallel: boolean;
      parallelTranslationWaves: boolean;
      parallelWavesWarning: string;
    }>;
    updateSchedulerSettings: (input: {
      globalMaxWorkers?: 'AUTO' | number;
      autoCap?: number;
      perProjectMax?: number;
      perProviderMax?: number;
      perAccountPlaywrightMax?: number;
      perAccountWebApiMax?: number;
      allowSameProjectParallel?: boolean;
      parallelTranslationWaves?: boolean;
    }) => Promise<{
      running: boolean;
      paused: boolean;
      inFlight: number;
      maxConcurrent: number;
      globalMaxMode: 'AUTO' | number;
      autoCap: number;
      perProjectMax: number;
      perProviderMax: number;
      perAccountPlaywrightMax: number;
      perAccountWebApiMax: number;
      allowSameProjectParallel: boolean;
      parallelTranslationWaves: boolean;
      parallelWavesWarning: string;
    }>;
    workers: () => Promise<{
      workers: {
        id: string;
        accountId: string;
        health: string;
        priority: number;
        currentJobId: string | null;
        limitedUntil: string | null;
        lastError: string | null;
      }[];
    }>;
  };
  learning: {
    dashboard: (projectId: string) => Promise<LearningDashboardResponse>;
  };
  editor: {
    getChapter: (input: {
      projectId: string;
      chapterId: string;
    }) => Promise<z.infer<typeof EditorGetChapterResponseSchema>>;
    saveParagraph: (input: {
      projectId: string;
      chapterId: string;
      stableParagraphId: string;
      translatedText: string;
    }) => Promise<z.infer<typeof EditorSaveParagraphResponseSchema>>;
    listVersions: (
      translationId: string,
    ) => Promise<z.infer<typeof EditorListVersionsResponseSchema>>;
    revertVersion: (input: {
      projectId: string;
      chapterId: string;
      translationId: string;
      version: number;
    }) => Promise<z.infer<typeof EditorRevertVersionResponseSchema>>;
    getContext: (input: {
      projectId: string;
      chapterNumber: number;
    }) => Promise<z.infer<typeof EditorContextResponseSchema>>;
    clearChapterTranslations: (input: {
      projectId: string;
      chapterId: string;
    }) => Promise<z.infer<typeof EditorClearChapterTranslationsResponseSchema>>;
    clearChaptersTranslations: (input: {
      projectId: string;
      chapterIds: string[];
    }) => Promise<z.infer<typeof EditorClearChaptersTranslationsResponseSchema>>;
    retranslateChapter: (input: {
      projectId: string;
      chapterId: string;
    }) => Promise<z.infer<typeof EditorRetranslateChapterResponseSchema>>;
    retranslateChapters: (input: {
      projectId: string;
      chapterIds: string[];
    }) => Promise<z.infer<typeof EditorRetranslateChaptersResponseSchema>>;
  };
  portability: {
    exportNovel: (input: {
      projectId: string;
      format: NovelExportFormat;
      chapterFrom?: number;
      chapterTo?: number;
      translatedOnly?: boolean;
      includeChapterTitles?: boolean;
      includeParagraphIds?: boolean;
      outputPath?: string;
    }) => Promise<z.infer<typeof NovelExportResponseSchema>>;
    selectExportPath: (input: {
      defaultName: string;
      format: NovelExportFormat;
    }) => Promise<z.infer<typeof SelectExportPathResponseSchema>>;
    createBackup: (input: {
      kind: 'full' | 'project';
      projectId?: string;
      outputPath?: string;
      includeCredentials?: boolean;
    }) => Promise<z.infer<typeof CreateBackupResponseSchema>>;
    previewRestore: (input: {
      archivePath: string;
    }) => Promise<z.infer<typeof PreviewRestoreResponseSchema>>;
    restoreBackup: (input: {
      archivePath: string;
      confirmOverwrite: boolean;
    }) => Promise<z.infer<typeof RestoreBackupResponseSchema>>;
    getAutoBackupConfig: () => Promise<z.infer<typeof AutoBackupConfigSchema>>;
    setAutoBackupConfig: (input: {
      enabled: boolean;
      intervalHours: number;
      retentionCount: number;
    }) => Promise<z.infer<typeof AutoBackupConfigSchema>>;
    listBackups: () => Promise<z.infer<typeof ListBackupsResponseSchema>>;
    createManualBackup: () => Promise<{ filePath: string }>;
    selectBackupPath: () => Promise<{ canceled: boolean; filePath: string | null }>;
  };
  diagnostics: {
    listProviders: () => Promise<z.infer<typeof ListProviderStatusResponseSchema>>;
    healthReport: () => Promise<z.infer<typeof GetHealthReportResponseSchema>>;
    export: (input?: {
      outputPath?: string;
      accountId?: string;
    }) => Promise<z.infer<typeof ExportDiagnosticsResponseSchema>>;
    connectionTest: (input: {
      kind: 'gemini' | 'notebook' | 'drive' | 'browserProfile';
      accountId: string;
    }) => Promise<z.infer<typeof ConnectionTestResponseSchema>>;
    aiBrowserProbe: (input: {
      kind: 'browser' | 'login' | 'notebook' | 'composer' | 'send' | 'trialTranslate';
      accountId: string;
      projectId?: string;
    }) => Promise<z.infer<typeof AiBrowserProbeResponseSchema>>;
    googleSmoke: (input: {
      accountId: string;
      notebookUrl: string;
      smokeProjectLabel?: string;
      headless?: boolean;
      scenarios?: ('A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H')[];
    }) => Promise<z.infer<typeof GoogleSmokeRunResponseSchema>>;
    notebookGroundingSmoke: (input: {
      accountId: string;
      notebookUrl: string;
      smokeProjectLabel?: string;
      headless?: boolean;
      tests?: ('A' | 'B' | 'C' | 'D')[];
      groundingKnowledgeDriveFileId?: string;
      groundingSyncStateDriveFileId?: string;
    }) => Promise<z.infer<typeof NotebookGroundingSmokeRunResponseSchema>>;
    getOverrides: () => Promise<z.infer<typeof GetSelectorOverridesResponseSchema>>;
    loadOverrides: (input?: {
      filePath?: string;
    }) => Promise<z.infer<typeof LoadSelectorOverridesResponseSchema>>;
    saveOverrides: (input: {
      file: SelectorOverrideFile;
    }) => Promise<z.infer<typeof SaveSelectorOverridesResponseSchema>>;
    reloadOverrides: () => Promise<z.infer<typeof LoadSelectorOverridesResponseSchema>>;
    repairStart: (input: {
      accountId: string;
      providerId: AutomationProviderId;
      selectorKey: string;
      startUrl?: string;
    }) => Promise<z.infer<typeof InteractiveRepairStartResponseSchema>>;
    repairCapture: (input: {
      sessionId: string;
      timeoutMs?: number;
    }) => Promise<z.infer<typeof InteractiveRepairCaptureResponseSchema>>;
    repairApply: (input: {
      sessionId: string;
      mode?: 'prepend' | 'append' | 'replace';
    }) => Promise<z.infer<typeof InteractiveRepairApplyResponseSchema>>;
    repairCancel: (input: { sessionId: string }) => Promise<{ ok: boolean }>;
    selectExportPath: () => Promise<{ canceled: boolean; filePath: string | null }>;
    selectOverridePath: () => Promise<{ canceled: boolean; filePath: string | null }>;
  };
  aiProviders: {
    list: () => Promise<z.infer<typeof AiProviderListResponseSchema>>;
    health: () => Promise<z.infer<typeof AiProviderHealthResponseSchema>>;
    setPriority: (input: {
      providerId: string;
      priority?: number;
      promote?: boolean;
    }) => Promise<z.infer<typeof AiProviderListResponseSchema>>;
    setEnabled: (input: {
      providerId: string;
      enabled: boolean;
    }) => Promise<z.infer<typeof AiProviderListResponseSchema>>;
    check: (input: {
      providerId: string;
    }) => Promise<{ ok: boolean; status: string; message: string }>;
    setFallback: (input: {
      enabled: boolean;
      statuses?: AiResponseStatus[];
    }) => Promise<z.infer<typeof AiProviderListResponseSchema>>;
    installWorker: () => Promise<z.infer<typeof AiWorkerInstallResponseSchema>>;
  };
  aiAccounts: {
    list: (input?: {
      providerId?: string;
    }) => Promise<z.infer<typeof AiAccountListResponseSchema>>;
    create: (input: {
      providerId: string;
      googleAccountId?: string | null;
      googleEmail?: string | null;
    }) => Promise<z.infer<typeof AiAccountActionResponseSchema>>;
    pasteCookies: (input: {
      accountId: string;
      secure1psid: string;
      secure1psidts?: string;
      googleEmail?: string;
    }) => Promise<z.infer<typeof AiAccountActionResponseSchema>>;
    check: (input: {
      accountId: string;
    }) => Promise<z.infer<typeof AiAccountActionResponseSchema>>;
    disable: (input: {
      accountId: string;
    }) => Promise<z.infer<typeof AiAccountActionResponseSchema>>;
    delete: (input: { accountId: string }) => Promise<{ ok: boolean }>;
  };
  aiModels: {
    list: (input: {
      providerId: string;
    }) => Promise<z.infer<typeof AiModelsListResponseSchema>>;
    sync: (input: {
      accountId: string;
    }) => Promise<z.infer<typeof AiModelsListResponseSchema>>;
  };
}

declare global {
  interface Window {
    novelTrans: NovelTransApi;
  }
}

export {};
