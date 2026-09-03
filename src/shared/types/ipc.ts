import type {
  GetInfoResponse,
  GetPathsResponse,
  GetVersionResponse,
  OpenFolderResponse,
  PingResponse,
  SecurityHealthCheckResponse,
} from '../schemas/ipc';
import type { GoogleAccountDto } from '../schemas/account';
import type { AttentionInboxItemDto } from '../schemas/attention-inbox';
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
  TabularCommitResponse,
  TabularExportResponse,
  TabularImportHistoryEntry,
  TabularPreviewResponse,
  TabularSelectFileResponse,
  TabularUndoLastResponse,
} from '../schemas/tabular';
import type { TabularDataType, TabularFormat, TabularImportMode } from '../constants/tabular';
import type {
  TermTabularDefaultStatus,
  TermTabularDuplicateStrategy,
  TermTabularExportScope,
} from '../constants/term-tabular';
import type { TranslationSpreadsheetConflictStrategy } from '../constants/translation-spreadsheet';
import type { SourceWorkbookImportMode } from '../constants/source-workbook-tabular';
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
  BackupDirectorySchema,
  CreateBackupResponseSchema,
  DefaultExportDirectorySchema,
  ExportChapterResponseSchema,
  ListBackupsResponseSchema,
  NovelExportResponseSchema,
  OpenExportDirectoryResponseSchema,
  OpenExportedFileResponseSchema,
  PreviewRestoreResponseSchema,
  ProjectExportSettingsSchema,
  ResolveExportDirectoryResponseSchema,
  RestoreBackupResponseSchema,
  SelectExportDirectoryResponseSchema,
  SelectExportPathResponseSchema,
  SetupStorageRootResponseSchema,
  StorageHealthResultSchema,
  TermCommitImportResponseSchema,
  TermImportPreviewResponseSchema,
} from '../schemas/portability';
import type { ExportDirectoryScope } from '../constants/export-settings';
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
import type { SystemHealthResultSchema } from '../schemas/system-health';
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
  AiBrowserAccountOpenLoginResponseSchema,
  AiModelsListResponseSchema,
  AiProviderHealthResponseSchema,
  AiProviderListResponseSchema,
  AiWorkerInstallResponseSchema,
} from '../schemas/ai-provider';
import type {
  AiAutoSetupResultSchema,
  AiStatusSnapshotSchema,
} from '../schemas/ai-auto-setup';
import type { AiResponseStatus } from '../constants/ai-provider';

export interface KhepreeNovelAIApi {
  ping: () => Promise<PingResponse>;
  getVersion: () => Promise<GetVersionResponse>;
  getInfo: () => Promise<GetInfoResponse>;
  getPaths: () => Promise<GetPathsResponse>;
  openFolder: (pathKey: AppPathKey) => Promise<OpenFolderResponse>;
  openOfficialContact: (
    channel: import('../constants/official-contacts').OfficialContactChannel,
  ) => Promise<import('../schemas/ipc').OpenOfficialContactResponse>;
  securityHealthCheck: () => Promise<SecurityHealthCheckResponse>;
  checkForUpdates: () => Promise<z.infer<typeof CheckForUpdatesResponseSchema>>;
  updates: {
    getStatus: () => Promise<import('../schemas/updates').UpdateStatus>;
    checkNow: () => Promise<import('../schemas/updates').UpdateStatus>;
    installAndRestart: () => Promise<{ ok: boolean; reason?: string }>;
    postpone: (input?: {
      untilMs?: number;
    }) => Promise<import('../schemas/updates').UpdatePostponeResponse>;
    onStatus: (
      callback: (status: import('../schemas/updates').UpdateStatus) => void,
    ) => () => void;
  };
  setup: {
    getStatus: () => Promise<z.infer<typeof SetupStatusSchema>>;
    setStep: (input: { step: SetupWizardStep }) => Promise<z.infer<typeof SetupStatusSchema>>;
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
      target?: 'gemini' | 'notebook',
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
    redetectSourceLanguage: (input: {
      projectId: string;
      apply?: boolean;
    }) => Promise<import('../schemas/source-language').SourceLanguageRedetectResponse>;
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
    getTranslatePackSettings: (projectId: string) => Promise<{
      preferNotebookPack: boolean;
      useGlobalPrimary: boolean;
      primaryProviderId: string | null;
      aiPreference: import('../constants/ai-preference').AiPreference | null;
      useGlobalPreference: boolean;
    }>;
    setPreferNotebookPack: (input: {
      projectId: string;
      preferNotebookPack: boolean;
    }) => Promise<{ preferNotebookPack: boolean }>;
    setPrimaryProvider: (input: {
      projectId: string;
      useGlobalPrimary: boolean;
      primaryProviderId?: string | null;
    }) => Promise<{
      preferNotebookPack: boolean;
      useGlobalPrimary: boolean;
      primaryProviderId: string | null;
      aiPreference: import('../constants/ai-preference').AiPreference | null;
      useGlobalPreference: boolean;
    }>;
    setAiPreference: (input: {
      projectId: string;
      useGlobalPreference: boolean;
      aiPreference?: import('../constants/ai-preference').AiPreference;
    }) => Promise<{
      preferNotebookPack: boolean;
      useGlobalPrimary: boolean;
      primaryProviderId: string | null;
      aiPreference: import('../constants/ai-preference').AiPreference | null;
      useGlobalPreference: boolean;
    }>;
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
  translationSettings: {
    get: () => Promise<
      import('../schemas/translation-settings').DefaultTargetLanguageSettings
    >;
    setDefaultTarget: (input: {
      defaultTargetLanguage: string;
    }) => Promise<
      import('../schemas/translation-settings').DefaultTargetLanguageSettings
    >;
  };
  translationRecipe: {
    list: (input?: {
      locale?: 'en' | 'vi';
    }) => Promise<{
      recipes: import('../schemas/translation-recipe').RecipeListItemDto[];
      defaultRecipeId: string;
    }>;
    getDefault: () => Promise<{ ok: true; id: string }>;
    setDefault: (input: { id: string }) => Promise<{ ok: true; id: string }>;
    clone: (input: {
      name: string;
      description?: string;
      cloneFromId?: string;
    }) => Promise<{ recipe: import('../schemas/translation-recipe').RecipeListItemDto }>;
    create: (input: {
      name: string;
      description?: string;
      cloneFromId?: string;
      config?: import('../schemas/translation-recipe').TranslationRecipeConfigDto;
    }) => Promise<{ recipe: import('../schemas/translation-recipe').RecipeListItemDto }>;
    update: (input: {
      id: string;
      name?: string;
      description?: string | null;
      config?: import('../schemas/translation-recipe').TranslationRecipeConfigDto;
    }) => Promise<{ recipe: import('../schemas/translation-recipe').RecipeListItemDto }>;
    delete: (id: string) => Promise<{ ok: true }>;
    export: (id: string) => Promise<{
      envelope: import('../schemas/translation-recipe').RecipeExportEnvelope;
    }>;
    import: (input: {
      payload: unknown;
      name?: string;
    }) => Promise<{ recipe: import('../schemas/translation-recipe').RecipeListItemDto }>;
    resolveProject: (input: {
      projectId: string;
      campaignId?: string;
    }) => Promise<{
      resolved: import('../schemas/translation-recipe').RecipeResolveResultDto;
    }>;
    setProject: (input: {
      projectId: string;
      recipeId?: string | null;
      override?: import('../schemas/translation-recipe').TranslationRecipeOverrideDto | null;
    }) => Promise<{
      resolved: import('../schemas/translation-recipe').RecipeResolveResultDto;
    }>;
  };
  translationCampaign: {
    create: (input: {
      title: string;
      recipeId: string;
      projectIds?: string[];
    }) => Promise<{ plan: import('../schemas/translation-campaign').CampaignPlanDto }>;
    get: (campaignId: string) => Promise<{
      campaign: import('zod').infer<
        typeof import('../schemas/translation-campaign').CampaignDetailSchema
      >;
    }>;
    list: () => Promise<{
      campaigns: import('zod').infer<
        typeof import('../schemas/translation-campaign').CampaignListItemSchema
      >[];
    }>;
    setProjectOverride: (input: {
      campaignId: string;
      projectId: string;
      override: import('../schemas/translation-recipe').TranslationRecipeOverrideDto | null;
    }) => Promise<{ plan: import('../schemas/translation-campaign').CampaignPlanDto }>;
    addProjects: (input: {
      campaignId: string;
      projectIds: string[];
    }) => Promise<{ plan: import('../schemas/translation-campaign').CampaignPlanDto }>;
    removeProject: (input: {
      campaignId: string;
      projectId: string;
    }) => Promise<{ plan: import('../schemas/translation-campaign').CampaignPlanDto }>;
    preflight: (
      campaignId: string,
    ) => Promise<{ plan: import('../schemas/translation-campaign').CampaignPlanDto }>;
    start: (input: {
      campaignId: string;
      startToken: string;
    }) => Promise<{ result: import('../schemas/translation-campaign').CampaignStartResultDto }>;
    pause: (
      campaignId: string,
    ) => Promise<{ plan: import('../schemas/translation-campaign').CampaignPlanDto }>;
    resume: (
      campaignId: string,
    ) => Promise<{ plan: import('../schemas/translation-campaign').CampaignPlanDto }>;
    cancel: (
      campaignId: string,
    ) => Promise<{ plan: import('../schemas/translation-campaign').CampaignPlanDto }>;
    controlProject: (input: {
      campaignId: string;
      projectId: string;
      action: 'pause' | 'resume' | 'retry' | 'setPriority';
      priority?: number;
    }) => Promise<{
      campaign: import('../schemas/translation-campaign').CampaignDetailDto;
    }>;
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
    detectLanguage: (input: {
      previewId: string;
      sourceLanguageHint?: string | null;
      sourceLanguageMode?: 'AUTO' | 'HINTED';
    }) => Promise<{ detection: import('../schemas/source-language').SourceLanguageDetection }>;
    import: (input: {
      previewId?: string;
      projectId?: string;
      projectTitle: string;
      genre?: string | null;
      description?: string | null;
      chineseTitle?: string | null;
      sourceLanguageHint?: string | null;
      sourceLanguageMode?: 'AUTO' | 'HINTED';
      /** @deprecated */
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
  batchImport: {
    selectSource: (input?: {
      preferredKind?: 'folder' | 'zip';
    }) => Promise<import('../schemas/batch-import').BatchImportSelectSourceResponse>;
    scan: (input: {
      sourceKind: 'folder' | 'zip';
      sourcePath: string;
    }) => Promise<{ preflight: import('../schemas/batch-import').BatchImportPreflightDto }>;
    cancel: (input?: { sessionId?: string }) => Promise<{ ok: true; cancelled: boolean }>;
    discard: (sessionId: string) => Promise<{ ok: true }>;
    updateCandidate: (input: {
      sessionId: string;
      candidateId: string;
      selected?: boolean;
      predictedTitle?: string;
      proposedAction?: import('../constants/batch-import').BatchImportProposedAction;
      targetProjectId?: string | null;
    }) => Promise<{ preflight: import('../schemas/batch-import').BatchImportPreflightDto }>;
    listProjects: () => Promise<{
      projects: { id: string; title: string }[];
    }>;
    commit: (
      sessionId: string,
    ) => Promise<{ session: import('../schemas/batch-import').BatchImportSessionDetailDto }>;
    retryCandidate: (input: {
      sessionId: string;
      candidateId: string;
    }) => Promise<{ session: import('../schemas/batch-import').BatchImportSessionDetailDto }>;
    getSession: (
      sessionId: string,
    ) => Promise<{ session: import('../schemas/batch-import').BatchImportSessionDetailDto }>;
    listSessions: () => Promise<{
      sessions: import('../schemas/batch-import').BatchImportSessionDetailDto[];
      incomplete: import('../schemas/batch-import').BatchImportSessionDetailDto[];
    }>;
    onProgress: (
      callback: (event: import('../schemas/batch-import').BatchImportProgressEventDto) => void,
    ) => () => void;
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
    countByProject: (projectId: string) => Promise<{ count: number }>;
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
  tabular: {
    selectImportFile: (input: {
      dataType: TabularDataType;
      format?: 'csv' | 'xlsx' | 'any';
    }) => Promise<TabularSelectFileResponse>;
    preview: (input: {
      filePath: string;
      projectId?: string;
      editionId?: string;
      dataTypeHint?: TabularDataType;
      duplicateStrategy?: TermTabularDuplicateStrategy;
      defaultImportStatus?: TermTabularDefaultStatus;
      allowElevatedStatus?: boolean;
    conflictStrategy?: TranslationSpreadsheetConflictStrategy;
    sourceImportMode?: SourceWorkbookImportMode;
    columnMapping?: Record<string, string>;
    }) => Promise<TabularPreviewResponse>;
    commit: (input: {
      previewId: string;
      mode?: TabularImportMode;
      projectId?: string;
      editionId?: string;
      duplicateStrategy?: TermTabularDuplicateStrategy;
      defaultImportStatus?: TermTabularDefaultStatus;
      allowElevatedStatus?: boolean;
      conflictStrategy?: TranslationSpreadsheetConflictStrategy;
      sourceImportMode?: SourceWorkbookImportMode;
    }) => Promise<TabularCommitResponse>;
    discardPreview: (input: { previewId: string }) => Promise<{ ok: true }>;
    selectExportPath: (input: {
      dataType: TabularDataType;
      format: TabularFormat;
      defaultName: string;
    }) => Promise<{ canceled: boolean; filePath: string | null }>;
    export: (input: {
      dataType: TabularDataType;
      format: TabularFormat;
      outputPath?: string;
      projectId?: string;
      editionId?: string;
      utf8Bom?: boolean;
      exportScope?: TermTabularExportScope;
      operationalOptions?: { sanitizeEmail?: boolean; limit?: number };
    }) => Promise<TabularExportResponse>;
    undoLast: (input?: { projectId?: string }) => Promise<TabularUndoLastResponse>;
    listHistory: (input?: { projectId?: string }) => Promise<{
      entries: TabularImportHistoryEntry[];
    }>;
    downloadTermTemplate: (input?: { outputPath?: string }) => Promise<{ filePath: string }>;
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
      hasLegacyDriveConfig?: boolean;
    }>;
    researchQuery: (input: {
      projectId: string;
      accountId?: string;
      question: string;
    }) => Promise<{
      status: 'candidate';
      question: string;
      answer: string;
      disclaimer: string;
    }>;
    openResearch: (input: {
      projectId: string;
      accountId?: string;
    }) => Promise<{ ok: boolean; url: string | null }>;
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
      syncLocalKnowledge?: boolean;
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
      projectId?: string;
      editionId?: string | null;
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
      retentionDaily: number;
      retentionWeekly: number;
      retentionMonthly: number;
    }) => Promise<z.infer<typeof AutoBackupConfigSchema>>;
    listBackups: () => Promise<z.infer<typeof ListBackupsResponseSchema>>;
    createManualBackup: () => Promise<{ filePath: string }>;
    selectBackupPath: () => Promise<{ canceled: boolean; filePath: string | null }>;
    getBackupDirectory: () => Promise<z.infer<typeof BackupDirectorySchema>>;
    setBackupDirectory: (input: {
      directory: string | null;
    }) => Promise<z.infer<typeof BackupDirectorySchema>>;
    selectBackupDirectory: () => Promise<{
      canceled: boolean;
      directory: string | null;
    }>;
    resolveExportDirectory: (input: {
      projectId: string;
      editionId?: string | null;
    }) => Promise<z.infer<typeof ResolveExportDirectoryResponseSchema>>;
    getDefaultExportDirectory: () => Promise<z.infer<typeof DefaultExportDirectorySchema>>;
    setDefaultExportDirectory: (input: {
      directory: string | null;
    }) => Promise<z.infer<typeof DefaultExportDirectorySchema>>;
    openDefaultExportDirectory: () => Promise<z.infer<typeof OpenExportDirectoryResponseSchema>>;
    selectExportDirectory: () => Promise<z.infer<typeof SelectExportDirectoryResponseSchema>>;
    getProjectExportSettings: (input: {
      projectId: string;
    }) => Promise<z.infer<typeof ProjectExportSettingsSchema>>;
    setProjectExportDirectory: (input: {
      projectId: string;
      directory: string | null;
    }) => Promise<z.infer<typeof ProjectExportSettingsSchema>>;
    persistExportDirectory: (input: {
      projectId: string;
      directory: string;
      scope: ExportDirectoryScope;
    }) => Promise<z.infer<typeof ResolveExportDirectoryResponseSchema>>;
    openExportDirectory: (input: {
      projectId: string;
      editionId?: string | null;
    }) => Promise<z.infer<typeof OpenExportDirectoryResponseSchema>>;
    openExportedFile: (input: {
      projectId: string;
      filePath: string;
      editionId?: string | null;
    }) => Promise<z.infer<typeof OpenExportedFileResponseSchema>>;
    exportChapter: (input: {
      projectId: string;
      chapterNumber: number;
      chapterTitle?: string | null;
      format: 'txt' | 'docx';
      editionId?: string | null;
      outputDirectory?: string;
    }) => Promise<z.infer<typeof ExportChapterResponseSchema>>;
    exportChapterRange: (input: {
      projectId: string;
      chapterFrom: number;
      chapterTo: number;
      format: 'txt' | 'docx';
      editionId?: string | null;
      outputDirectory?: string;
    }) => Promise<z.infer<typeof ExportChapterResponseSchema>>;
    setupStorageRoot: (input: {
      root: string;
    }) => Promise<z.infer<typeof SetupStorageRootResponseSchema>>;
    checkStorageHealth: () => Promise<z.infer<typeof StorageHealthResultSchema>>;
    backupNow: () => Promise<{ filePath: string }>;
  };
  diagnostics: {
    listProviders: () => Promise<z.infer<typeof ListProviderStatusResponseSchema>>;
    healthReport: () => Promise<z.infer<typeof GetHealthReportResponseSchema>>;
    runSystemHealth: () => Promise<z.infer<typeof SystemHealthResultSchema>>;
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
    listFailureShots: () => Promise<{
      files: {
        name: string;
        path: string;
        sizeBytes: number;
        modifiedAt: string;
      }[];
    }>;
    deleteFailureShot: (input: { path: string }) => Promise<{ ok: boolean }>;
    purgeFailureShots: () => Promise<{ deleted: number; kept: number }>;
  };
  browserAttention: {
    list: () => Promise<{
      items: {
        id: string;
        accountKind: string;
        accountId: string;
        providerId: string | null;
        providerType: string | null;
        kind: string;
        poolState: string;
        summary: string;
        suggestedAction: string;
        diagnosticsPath: string | null;
        status: string;
        createdAt: string;
      }[];
    }>;
    resolve: (input: {
      id: string;
      status?: 'RESOLVED' | 'DISMISSED';
    }) => Promise<{ ok: boolean }>;
  };
  attentionInbox: {
    list: () => Promise<{
      items: AttentionInboxItemDto[];
      openCount: number;
    }>;
    countOpen: () => Promise<{ openCount: number }>;
    act: (input: {
      itemId: string;
      action:
        | 'RESOLVE'
        | 'DISMISS'
        | 'SNOOZE'
        | 'RETRY'
        | 'SKIP'
        | 'OPEN_LOGIN'
        | 'VIEW_ERROR'
        | 'CHOOSE_SOURCE'
        | 'SWITCH_PROVIDER'
        | 'OPEN_FOLDER';
      snoozeMinutes?: number;
    }) => Promise<{ item: AttentionInboxItemDto | null }>;
    bulkRetry: (input: {
      itemIds?: string[];
      allRetryable?: boolean;
    }) => Promise<{
      attempted: number;
      skippedProactive: number;
      retriedJobIds: string[];
    }>;
    reconcile: () => Promise<{ resolved: number }>;
  };
  fictionSeries: {
    list: () => Promise<{
      series: z.infer<typeof import('../schemas/fiction-series').FictionSeriesDtoSchema>[];
    }>;
    get: (seriesId: string) => Promise<{
      series: z.infer<typeof import('../schemas/fiction-series').FictionSeriesDtoSchema>;
    }>;
    create: (input: {
      title: string;
      description?: string | null;
      genre?: string | null;
    }) => Promise<{
      series: z.infer<typeof import('../schemas/fiction-series').FictionSeriesDtoSchema>;
    }>;
    listVolumes: (seriesId: string) => Promise<{
      volumes: z.infer<typeof import('../schemas/fiction-series').FictionSeriesVolumeDtoSchema>[];
    }>;
    addVolume: (input: {
      seriesId: string;
      projectId: string;
      volumeOrder?: number;
      volumeLabel?: string | null;
      force?: boolean;
    }) => Promise<{
      volume: z.infer<typeof import('../schemas/fiction-series').FictionSeriesVolumeDtoSchema>;
    }>;
    removeVolume: (input: { seriesId: string; projectId: string }) => Promise<{ ok: true }>;
    reorderVolumes: (input: {
      seriesId: string;
      orderedProjectIds: string[];
    }) => Promise<{ ok: true }>;
    previewMembership: (input: {
      projectId: string;
      toSeriesId: string;
    }) => Promise<z.infer<typeof import('../schemas/fiction-series').SeriesMembershipConflictPreviewSchema>>;
    assignProject: (input: {
      seriesId: string;
      projectId: string;
      volumeLabel?: string | null;
      force?: boolean;
    }) => Promise<{
      volume: z.infer<typeof import('../schemas/fiction-series').FictionSeriesVolumeDtoSchema>;
    }>;
    exportKnowledge: (input: { seriesId: string }) => Promise<
      z.infer<typeof import('../schemas/fiction-series').ExportSeriesKnowledgeResponseSchema>
    >;
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
    getRouting: (input?: { projectId?: string }) => Promise<
      z.infer<typeof import('../schemas/ai-provider').AiProviderRoutingResponseSchema>
    >;
    setPrimary: (input: {
      providerId: string;
    }) => Promise<z.infer<typeof AiProviderListResponseSchema>>;
    setPreference: (input: {
      preference: import('../constants/ai-preference').AiPreference;
    }) => Promise<z.infer<typeof AiProviderListResponseSchema>>;
    checkAll: () => Promise<{ ok: boolean; message: string }>;
    installWorker: () => Promise<z.infer<typeof AiWorkerInstallResponseSchema>>;
    autoSetupStatus: () => Promise<z.infer<typeof AiStatusSnapshotSchema>>;
    autoSetupRun: () => Promise<z.infer<typeof AiAutoSetupResultSchema>>;
  };
  aiAccounts: {
    list: (input?: {
      providerId?: string;
    }) => Promise<z.infer<typeof AiAccountListResponseSchema>>;
    create: (input: {
      providerId: string;
      googleAccountId?: string | null;
      googleEmail?: string | null;
      displayName?: string;
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
    openBrowserLogin: (input: {
      accountId: string;
    }) => Promise<z.infer<typeof AiBrowserAccountOpenLoginResponseSchema>>;
    verifyBrowser: (input: {
      accountId: string;
    }) => Promise<z.infer<typeof AiAccountActionResponseSchema>>;
    updateDisplayName: (input: {
      accountId: string;
      displayName: string;
    }) => Promise<z.infer<typeof AiAccountActionResponseSchema>>;
  };
  aiModels: {
    list: (input: {
      providerId: string;
    }) => Promise<z.infer<typeof AiModelsListResponseSchema>>;
    sync: (input: {
      accountId: string;
    }) => Promise<z.infer<typeof AiModelsListResponseSchema>>;
  };
  khepree: {
    getAccessState: () => Promise<import('../schemas/khepree').KhepreeAccessState>;
    startLogin: () => Promise<{ ok: true; state: import('../schemas/khepree').KhepreeAccessState }>;
    retryColdStart: () => Promise<{ ok: boolean; state: import('../schemas/khepree').KhepreeAccessState }>;
    retryActivation: () => Promise<{ ok: boolean; state: import('../schemas/khepree').KhepreeAccessState }>;
    refreshEntitlement: () => Promise<{ ok: boolean; state: import('../schemas/khepree').KhepreeAccessState }>;
    startCheckout: (input: {
      planId: string;
    }) => Promise<{ ok: boolean; state: import('../schemas/khepree').KhepreeAccessState }>;
    cancelCheckout: () => Promise<{ ok: true; state: import('../schemas/khepree').KhepreeAccessState }>;
    checkCheckout: () => Promise<{ ok: boolean; state: import('../schemas/khepree').KhepreeAccessState }>;
    reopenCheckout: () => Promise<{ ok: boolean; state: import('../schemas/khepree').KhepreeAccessState }>;
    getPlanCatalog: () => Promise<{
      ok: boolean;
      catalog: {
        plans: import('../schemas/khepree-api').KhepreePlanCatalogItem[];
        currentPlanId: string | null;
      };
    }>;
    signOut: () => Promise<{ ok: true; state: import('../schemas/khepree').KhepreeAccessState }>;
    openExternal: (input: {
      target: import('../constants/khepree').KhepreeExternalLinkTarget;
    }) => Promise<{ ok: boolean }>;
    listAnnouncements: () => Promise<import('../schemas/khepree-announcements').KhepreeAnnouncementsListResponse>;
    syncAnnouncements: () => Promise<import('../schemas/khepree-announcements').KhepreeAnnouncementsListResponse>;
    markAnnouncementRead: (input: {
      publicId: string;
    }) => Promise<import('../schemas/khepree-announcements').KhepreeAnnouncementsListResponse>;
    dismissAnnouncement: (input: {
      publicId: string;
    }) => Promise<import('../schemas/khepree-announcements').KhepreeAnnouncementsListResponse>;
    onAccessState: (
      callback: (state: import('../schemas/khepree').KhepreeAccessState) => void,
    ) => () => void;
  };
  production: {
    onCompletion: (
      callback: (
        event: import('../schemas/delivery-completion').ProductionCompletionEvent,
      ) => void,
    ) => () => void;
  };
  notify: {
    getDesktopEnabled: () => Promise<{ enabled: boolean }>;
    setDesktopEnabled: (input: { enabled: boolean }) => Promise<{ enabled: boolean }>;
  };
  librarySearch: {
    query: (
      input: import('../schemas/library-search').LibrarySearchQueryInput,
    ) => Promise<import('../schemas/library-search').LibrarySearchQueryResultDto>;
    cancelQuery: () => Promise<{ ok: boolean }>;
    getSettings: () => Promise<import('../schemas/library-search').LibrarySearchSettingsDto>;
    updateSettings: (
      input: Partial<import('../schemas/library-search').LibrarySearchSettingsDto>,
    ) => Promise<import('../schemas/library-search').LibrarySearchSettingsDto>;
    startReindex: (input?: { force?: boolean }) => Promise<
      import('../schemas/library-search').LibrarySearchIndexProgressDto
    >;
    cancelReindex: () => Promise<
      import('../schemas/library-search').LibrarySearchIndexProgressDto | null
    >;
    getReindexProgress: () => Promise<
      import('../schemas/library-search').LibrarySearchIndexProgressDto | null
    >;
    onReindexProgress: (
      callback: (
        progress: import('../schemas/library-search').LibrarySearchIndexProgressDto,
      ) => void,
    ) => () => void;
  };
  featureIntro: {
    getState: () => Promise<import('../schemas/feature-intro').FeatureIntroStateDto>;
    dismiss: (
      input: import('../schemas/feature-intro').FeatureIntroDismissRequest,
    ) => Promise<import('../schemas/feature-intro').FeatureIntroStateDto>;
    updateTour: (
      input: import('../schemas/feature-intro').FeatureIntroTourUpdate,
    ) => Promise<import('../schemas/feature-intro').FeatureIntroStateDto>;
  };
  uiLanguage: {
    get: () => Promise<import('../schemas/ui-language').UiLanguageStatus>;
    set: (input: {
      preference: import('../types/ui-locale').UiLocalePreference;
    }) => Promise<import('../schemas/ui-language').UiLanguageStatus>;
    completeFirstRun: (input: {
      preference: import('../types/ui-locale').UiLocaleCode;
    }) => Promise<import('../schemas/ui-language').UiLanguageStatus>;
  };
}

declare global {
  interface Window {
    khepreeNovelAI: KhepreeNovelAIApi;
  }
}

export {};
