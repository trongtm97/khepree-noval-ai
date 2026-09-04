import { contextBridge, ipcRenderer } from 'electron';
import {
  ALLOWED_IPC_CHANNELS,
  IPC_CHANNELS,
} from '@shared/constants/ipc-channels';
import type { AppPathKey } from '@shared/constants/paths';
import type { GoogleAccountPlan } from '@shared/constants/google-account';
import type { KhepreeNovelAIApi } from '@shared/types/ipc';

function invokeChannel<T>(channel: string, payload?: unknown): Promise<T> {
  if (!ALLOWED_IPC_CHANNELS.has(channel)) {
    return Promise.reject(new Error(`IPC channel not allowed: ${channel}`));
  }
  if (payload === undefined) {
    return ipcRenderer.invoke(channel) as Promise<T>;
  }
  return ipcRenderer.invoke(channel, payload) as Promise<T>;
}

const api: KhepreeNovelAIApi = {
  ping: () => invokeChannel(IPC_CHANNELS.APP_PING),
  getVersion: () => invokeChannel(IPC_CHANNELS.APP_GET_VERSION),
  getInfo: () => invokeChannel(IPC_CHANNELS.APP_GET_INFO),
  getPaths: () => invokeChannel(IPC_CHANNELS.APP_GET_PATHS),
  openFolder: (pathKey: AppPathKey) =>
    invokeChannel(IPC_CHANNELS.APP_OPEN_FOLDER, { pathKey }),
  openOfficialContact: (channel) =>
    invokeChannel(IPC_CHANNELS.APP_OPEN_OFFICIAL_CONTACT, { channel }),
  securityHealthCheck: () => invokeChannel(IPC_CHANNELS.SECURITY_HEALTH_CHECK),
  accounts: {
    list: () => invokeChannel(IPC_CHANNELS.ACCOUNT_LIST),
    get: (accountId) => invokeChannel(IPC_CHANNELS.ACCOUNT_GET, { accountId }),
    add: (input) => invokeChannel(IPC_CHANNELS.ACCOUNT_ADD, input ?? {}),
    rename: (accountId, label) =>
      invokeChannel(IPC_CHANNELS.ACCOUNT_RENAME, { accountId, label }),
    setPlan: (accountId, plan: GoogleAccountPlan) =>
      invokeChannel(IPC_CHANNELS.ACCOUNT_SET_PLAN, { accountId, plan }),
    setNotes: (accountId, notes) =>
      invokeChannel(IPC_CHANNELS.ACCOUNT_SET_NOTES, { accountId, notes }),
    openBrowser: (accountId, target) =>
      invokeChannel(IPC_CHANNELS.ACCOUNT_OPEN_BROWSER, { accountId, target }),
    closeBrowser: (accountId) =>
      invokeChannel(IPC_CHANNELS.ACCOUNT_CLOSE_BROWSER, { accountId }),
    testSession: (accountId) =>
      invokeChannel(IPC_CHANNELS.ACCOUNT_TEST_SESSION, { accountId }),
    completeLogin: (accountId, input) =>
      invokeChannel(IPC_CHANNELS.ACCOUNT_COMPLETE_LOGIN, {
        accountId,
        ...input,
      }),
    disable: (accountId) =>
      invokeChannel(IPC_CHANNELS.ACCOUNT_DISABLE, { accountId }),
    enable: (accountId) =>
      invokeChannel(IPC_CHANNELS.ACCOUNT_ENABLE, { accountId }),
    remove: (accountId) =>
      invokeChannel(IPC_CHANNELS.ACCOUNT_REMOVE, { accountId, confirm: true }),
  },
  projects: {
    list: () => invokeChannel(IPC_CHANNELS.PROJECT_LIST),
    create: (input) => invokeChannel(IPC_CHANNELS.PROJECT_CREATE, input),
    get: (projectId) => invokeChannel(IPC_CHANNELS.PROJECT_GET, { projectId }),
    delete: (projectId) =>
      invokeChannel(IPC_CHANNELS.PROJECT_DELETE, { projectId }),
    updateLanguages: (input) =>
      invokeChannel(IPC_CHANNELS.PROJECT_UPDATE_LANGUAGES, input),
    redetectSourceLanguage: (input) =>
      invokeChannel(IPC_CHANNELS.PROJECT_REDETECT_SOURCE_LANGUAGE, input),
    resolveWorker: (input) =>
      invokeChannel(IPC_CHANNELS.PROJECT_RESOLVE_WORKER, input),
    setWorker: (input) => invokeChannel(IPC_CHANNELS.PROJECT_SET_WORKER, input),
    getTranslatePackSettings: (projectId) =>
      invokeChannel(IPC_CHANNELS.PROJECT_GET_TRANSLATE_PACK_SETTINGS, { projectId }),
    setPreferNotebookPack: (input) =>
      invokeChannel(IPC_CHANNELS.PROJECT_SET_PREFER_NOTEBOOK_PACK, input),
    setPrimaryProvider: (input) =>
      invokeChannel(IPC_CHANNELS.PROJECT_SET_PRIMARY_PROVIDER, input),
    setAiPreference: (input) =>
      invokeChannel(IPC_CHANNELS.PROJECT_SET_AI_PREFERENCE, input),
  },
  editions: {
    list: (projectId) =>
      invokeChannel(IPC_CHANNELS.EDITION_LIST, { projectId }),
    create: (input) => invokeChannel(IPC_CHANNELS.EDITION_CREATE, input),
    switch: (input) => invokeChannel(IPC_CHANNELS.EDITION_SWITCH, input),
  },
  languages: {
    list: () => invokeChannel(IPC_CHANNELS.LANGUAGE_LIST),
    detect: (input) => invokeChannel(IPC_CHANNELS.LANGUAGE_DETECT, input),
  },
  translationSettings: {
    get: () => invokeChannel(IPC_CHANNELS.TRANSLATION_SETTINGS_GET),
    setDefaultTarget: (input) =>
      invokeChannel(IPC_CHANNELS.TRANSLATION_SETTINGS_SET_DEFAULT_TARGET, input),
  },
  translationRecipe: {
    list: (input) =>
      invokeChannel(IPC_CHANNELS.TRANSLATION_RECIPE_LIST, input ?? { locale: 'en' }),
    getDefault: () => invokeChannel(IPC_CHANNELS.TRANSLATION_RECIPE_GET_DEFAULT),
    setDefault: (input) =>
      invokeChannel(IPC_CHANNELS.TRANSLATION_RECIPE_SET_DEFAULT, input),
    clone: (input) => invokeChannel(IPC_CHANNELS.TRANSLATION_RECIPE_CLONE, input),
    create: (input) => invokeChannel(IPC_CHANNELS.TRANSLATION_RECIPE_CREATE, input),
    update: (input) => invokeChannel(IPC_CHANNELS.TRANSLATION_RECIPE_UPDATE, input),
    delete: (id) => invokeChannel(IPC_CHANNELS.TRANSLATION_RECIPE_DELETE, { id }),
    export: (id) => invokeChannel(IPC_CHANNELS.TRANSLATION_RECIPE_EXPORT, { id }),
    import: (input) => invokeChannel(IPC_CHANNELS.TRANSLATION_RECIPE_IMPORT, input),
    resolveProject: (input) =>
      invokeChannel(IPC_CHANNELS.TRANSLATION_RECIPE_RESOLVE_PROJECT, input),
    setProject: (input) =>
      invokeChannel(IPC_CHANNELS.TRANSLATION_RECIPE_SET_PROJECT, input),
  },
  translationCampaign: {
    create: (input) => invokeChannel(IPC_CHANNELS.TRANSLATION_CAMPAIGN_CREATE, input),
    get: (campaignId) =>
      invokeChannel(IPC_CHANNELS.TRANSLATION_CAMPAIGN_GET, { campaignId }),
    list: () => invokeChannel(IPC_CHANNELS.TRANSLATION_CAMPAIGN_LIST),
    setProjectOverride: (input) =>
      invokeChannel(IPC_CHANNELS.TRANSLATION_CAMPAIGN_SET_PROJECT_OVERRIDE, input),
    addProjects: (input) =>
      invokeChannel(IPC_CHANNELS.TRANSLATION_CAMPAIGN_ADD_PROJECTS, input),
    removeProject: (input) =>
      invokeChannel(IPC_CHANNELS.TRANSLATION_CAMPAIGN_REMOVE_PROJECT, input),
    preflight: (campaignId) =>
      invokeChannel(IPC_CHANNELS.TRANSLATION_CAMPAIGN_PREFLIGHT, { campaignId }),
    start: (input) => invokeChannel(IPC_CHANNELS.TRANSLATION_CAMPAIGN_START, input),
    pause: (campaignId) =>
      invokeChannel(IPC_CHANNELS.TRANSLATION_CAMPAIGN_PAUSE, { campaignId }),
    resume: (campaignId) =>
      invokeChannel(IPC_CHANNELS.TRANSLATION_CAMPAIGN_RESUME, { campaignId }),
    cancel: (campaignId) =>
      invokeChannel(IPC_CHANNELS.TRANSLATION_CAMPAIGN_CANCEL, { campaignId }),
    controlProject: (input) =>
      invokeChannel(IPC_CHANNELS.TRANSLATION_CAMPAIGN_CONTROL_PROJECT, input),
  },
  import: {
    selectFile: () => invokeChannel(IPC_CHANNELS.IMPORT_SELECT_FILE),
    preview: (filePath) =>
      invokeChannel(IPC_CHANNELS.IMPORT_PREVIEW, { filePath }),
    updatePreview: (input) =>
      invokeChannel(IPC_CHANNELS.IMPORT_UPDATE_PREVIEW, input),
    commit: (input) => invokeChannel(IPC_CHANNELS.IMPORT_COMMIT, input),
    discard: (previewId) =>
      invokeChannel(IPC_CHANNELS.IMPORT_DISCARD, { previewId }),
  },
  sourceFolder: {
    selectFolder: () => invokeChannel(IPC_CHANNELS.SOURCE_FOLDER_SELECT_FOLDER),
    scanPreview: (input) =>
      invokeChannel(IPC_CHANNELS.SOURCE_FOLDER_SCAN_PREVIEW, input),
    scan: (projectId) =>
      invokeChannel(IPC_CHANNELS.SOURCE_FOLDER_SCAN, { projectId }),
    detectLanguage: (input) =>
      invokeChannel(IPC_CHANNELS.SOURCE_FOLDER_DETECT_LANGUAGE, input),
    import: (input) => invokeChannel(IPC_CHANNELS.SOURCE_FOLDER_IMPORT, input),
    getStatus: (projectId) =>
      invokeChannel(IPC_CHANNELS.SOURCE_FOLDER_GET_STATUS, { projectId }),
    updateSettings: (input) =>
      invokeChannel(IPC_CHANNELS.SOURCE_FOLDER_UPDATE_SETTINGS, input),
    changeFolder: (input) =>
      invokeChannel(IPC_CHANNELS.SOURCE_FOLDER_CHANGE_FOLDER, input),
    resolveConflict: (input) =>
      invokeChannel(IPC_CHANNELS.SOURCE_FOLDER_RESOLVE_CONFLICT, input),
    markRetranslate: (input) =>
      invokeChannel(IPC_CHANNELS.SOURCE_FOLDER_MARK_RETRANSLATE, input),
    getSourceDiff: (input) =>
      invokeChannel(IPC_CHANNELS.SOURCE_FOLDER_GET_DIFF, input),
    openFolder: (projectId) =>
      invokeChannel(IPC_CHANNELS.SOURCE_FOLDER_OPEN_FOLDER, { projectId }),
    cancelScan: (projectId) =>
      invokeChannel(IPC_CHANNELS.SOURCE_FOLDER_CANCEL_SCAN, { projectId }),
    onEvent: (callback) => {
      const listener = (_event: Electron.IpcRendererEvent, payload: unknown) => {
        callback(payload as import('@shared/schemas/source-folder').SourceFolderEventDto);
      };
      ipcRenderer.on(IPC_CHANNELS.SOURCE_FOLDER_ON_SCAN_PROGRESS, listener);
      return () => {
        ipcRenderer.removeListener(IPC_CHANNELS.SOURCE_FOLDER_ON_SCAN_PROGRESS, listener);
      };
    },
  },
  batchImport: {
    selectSource: (input) =>
      invokeChannel(IPC_CHANNELS.BATCH_IMPORT_SELECT_SOURCE, input ?? { preferredKind: 'folder' }),
    scan: (input) => invokeChannel(IPC_CHANNELS.BATCH_IMPORT_SCAN, input),
    cancel: (input) => invokeChannel(IPC_CHANNELS.BATCH_IMPORT_CANCEL, input ?? {}),
    discard: (sessionId) =>
      invokeChannel(IPC_CHANNELS.BATCH_IMPORT_DISCARD, { sessionId }),
    updateCandidate: (input) =>
      invokeChannel(IPC_CHANNELS.BATCH_IMPORT_UPDATE_CANDIDATE, input),
    listProjects: () => invokeChannel(IPC_CHANNELS.BATCH_IMPORT_LIST_PROJECTS),
    commit: (sessionId) =>
      invokeChannel(IPC_CHANNELS.BATCH_IMPORT_COMMIT, { sessionId }),
    retryCandidate: (input) =>
      invokeChannel(IPC_CHANNELS.BATCH_IMPORT_RETRY_CANDIDATE, input),
    getSession: (sessionId) =>
      invokeChannel(IPC_CHANNELS.BATCH_IMPORT_GET_SESSION, { sessionId }),
    listSessions: () => invokeChannel(IPC_CHANNELS.BATCH_IMPORT_LIST_SESSIONS),
    onProgress: (callback) => {
      const listener = (_event: Electron.IpcRendererEvent, payload: unknown) => {
        callback(payload as import('@shared/schemas/batch-import').BatchImportProgressEventDto);
      };
      ipcRenderer.on(IPC_CHANNELS.BATCH_IMPORT_ON_PROGRESS, listener);
      return () => {
        ipcRenderer.removeListener(IPC_CHANNELS.BATCH_IMPORT_ON_PROGRESS, listener);
      };
    },
  },
  bookMetadata: {
    get: (projectId) => invokeChannel(IPC_CHANNELS.BOOK_METADATA_GET, { projectId }),
    update: (input) => invokeChannel(IPC_CHANNELS.BOOK_METADATA_UPDATE, input),
    listDocuments: (projectId) =>
      invokeChannel(IPC_CHANNELS.BOOK_METADATA_LIST_DOCUMENTS, { projectId }),
    syncProfile: (projectId) =>
      invokeChannel(IPC_CHANNELS.BOOK_METADATA_SYNC_PROFILE, { projectId }),
  },
  terms: {
    search: (filters) => invokeChannel(IPC_CHANNELS.TERM_SEARCH, filters ?? {}),
    countByProject: (projectId) =>
      invokeChannel(IPC_CHANNELS.TERM_COUNT_BY_PROJECT, { projectId }),
    reviewQueue: () => invokeChannel(IPC_CHANNELS.TERM_REVIEW_QUEUE),
    get: (termId) => invokeChannel(IPC_CHANNELS.TERM_GET, { termId }),
    upsert: (input) => invokeChannel(IPC_CHANNELS.TERM_UPSERT, input),
    review: (input) => invokeChannel(IPC_CHANNELS.TERM_REVIEW, input),
    listCandidates: (input) =>
      invokeChannel(IPC_CHANNELS.TERM_LIST_CANDIDATES, input ?? {}),
    candidateReview: (input) =>
      invokeChannel(IPC_CHANNELS.TERM_CANDIDATE_REVIEW, input),
    import: (input) => invokeChannel(IPC_CHANNELS.TERM_IMPORT, input),
    export: (input) => invokeChannel(IPC_CHANNELS.TERM_EXPORT, input),
    previewImport: (input) => invokeChannel(IPC_CHANNELS.TERM_PREVIEW_IMPORT, input),
    commitImport: (input) => invokeChannel(IPC_CHANNELS.TERM_COMMIT_IMPORT, input),
  },
  tabular: {
    selectImportFile: (input) =>
      invokeChannel(IPC_CHANNELS.TABULAR_SELECT_IMPORT_FILE, input),
    preview: (input) => invokeChannel(IPC_CHANNELS.TABULAR_PREVIEW, input),
    commit: (input) => invokeChannel(IPC_CHANNELS.TABULAR_COMMIT, input),
    discardPreview: (input) =>
      invokeChannel(IPC_CHANNELS.TABULAR_DISCARD_PREVIEW, input),
    selectExportPath: (input) =>
      invokeChannel(IPC_CHANNELS.TABULAR_SELECT_EXPORT_PATH, input),
    export: (input) => invokeChannel(IPC_CHANNELS.TABULAR_EXPORT, input),
    undoLast: (input) => invokeChannel(IPC_CHANNELS.TABULAR_UNDO_LAST, input ?? {}),
    listHistory: (input) => invokeChannel(IPC_CHANNELS.TABULAR_LIST_HISTORY, input ?? {}),
    downloadTermTemplate: (input) =>
      invokeChannel(IPC_CHANNELS.TABULAR_DOWNLOAD_TERM_TEMPLATE, input ?? {}),
  },
  memory: {
    listCharacters: (projectId) =>
      invokeChannel(IPC_CHANNELS.CHARACTER_LIST, { projectId }),
    upsertCharacter: (input) =>
      invokeChannel(IPC_CHANNELS.CHARACTER_UPSERT, input),
    listRelationships: (input) =>
      invokeChannel(IPC_CHANNELS.RELATIONSHIP_LIST, input),
    upsertRelationship: (input) =>
      invokeChannel(IPC_CHANNELS.RELATIONSHIP_UPSERT, input),
    getStoryState: (projectId) =>
      invokeChannel(IPC_CHANNELS.MEMORY_STORY_STATE_GET, { projectId }),
    patchStoryState: (input) =>
      invokeChannel(IPC_CHANNELS.MEMORY_STORY_STATE_PATCH, input),
    applyDelta: (input) => invokeChannel(IPC_CHANNELS.MEMORY_APPLY_DELTA, input),
    listConflicts: (projectId) =>
      invokeChannel(IPC_CHANNELS.MEMORY_CONFLICT_LIST, { projectId }),
    resolveConflict: (input) =>
      invokeChannel(IPC_CHANNELS.MEMORY_CONFLICT_RESOLVE, input),
    buildContext: (input) =>
      invokeChannel(IPC_CHANNELS.MEMORY_BUILD_CONTEXT, input),
  },
  pack: {
    listChapters: (projectId) =>
      invokeChannel(IPC_CHANNELS.PACK_LIST_CHAPTERS, { projectId }),
    build: (input) => invokeChannel(IPC_CHANNELS.PACK_BUILD, input),
  },
  notebook: {
    list: (projectId) =>
      invokeChannel(IPC_CHANNELS.NOTEBOOK_LIST, { projectId }),
    get: (projectId, accountId) =>
      invokeChannel(IPC_CHANNELS.NOTEBOOK_GET, { projectId, accountId }),
    provision: (input: {
      projectId: string;
      accountId: string;
      headless?: boolean;
      role?: 'SINGLE' | 'RESEARCH' | 'TRANSLATION';
    }) => invokeChannel(IPC_CHANNELS.NOTEBOOK_PROVISION, input),
    resume: (input: {
      projectId: string;
      accountId: string;
      headless?: boolean;
      role?: 'SINGLE' | 'RESEARCH' | 'TRANSLATION';
    }) => invokeChannel(IPC_CHANNELS.NOTEBOOK_RESUME, input),
    health: (input: { projectId: string; accountId?: string; dual?: boolean; role?: string }) =>
      invokeChannel(IPC_CHANNELS.NOTEBOOK_HEALTH, input),
    syncNow: (input) => invokeChannel(IPC_CHANNELS.NOTEBOOK_SYNC_NOW, input),
    rebuild: (projectId) =>
      invokeChannel(IPC_CHANNELS.NOTEBOOK_REBUILD, { projectId }),
    bootstrap: (input) => invokeChannel(IPC_CHANNELS.NOTEBOOK_BOOTSTRAP, input),
    prepareForTranslate: (input) =>
      invokeChannel(IPC_CHANNELS.NOTEBOOK_PREPARE_FOR_TRANSLATE, input),
    ensureForTranslate: (input) =>
      invokeChannel(IPC_CHANNELS.TRANSLATE_ENSURE_READY, input),
    runBootstrapAnalysis: (input) =>
      invokeChannel(IPC_CHANNELS.NOTEBOOK_RUN_BOOTSTRAP_ANALYSIS, input),
    skipBootstrap: (projectId) =>
      invokeChannel(IPC_CHANNELS.NOTEBOOK_SKIP_BOOTSTRAP, { projectId }),
    getBootstrapStatus: (projectId) =>
      invokeChannel(IPC_CHANNELS.NOTEBOOK_GET_BOOTSTRAP_STATUS, { projectId }),
    researchQuery: (input) =>
      invokeChannel(IPC_CHANNELS.NOTEBOOK_RESEARCH_QUERY, input),
    openResearch: (input) =>
      invokeChannel(IPC_CHANNELS.NOTEBOOK_OPEN_RESEARCH, input),
    listDuplicateCandidates: (input) =>
      invokeChannel(IPC_CHANNELS.NOTEBOOK_LIST_DUPLICATE_CANDIDATES, input),
    resolvePrimaryBinding: (input) =>
      invokeChannel(IPC_CHANNELS.NOTEBOOK_RESOLVE_PRIMARY_BINDING, input),
    listSyncStatus: (input) =>
      invokeChannel(IPC_CHANNELS.NOTEBOOK_LIST_SYNC_STATUS, input),
    packNovelCorpus: (input) =>
      invokeChannel(IPC_CHANNELS.BOOTSTRAP_PACK_NOVEL_CORPUS, input),
    getPreprocessPrompt: (input) =>
      invokeChannel(IPC_CHANNELS.BOOTSTRAP_GET_PREPROCESS_PROMPT, input),
    importPreprocessResult: (input) =>
      invokeChannel(IPC_CHANNELS.BOOTSTRAP_IMPORT_PREPROCESS_RESULT, input),
    selectPreprocessResultPath: () =>
      invokeChannel(IPC_CHANNELS.BOOTSTRAP_SELECT_RESULT_PATH),
    runAutoPreprocess: (input) =>
      invokeChannel(IPC_CHANNELS.BOOTSTRAP_RUN_AUTO_PREPROCESS, input),
    getAutoPreprocessProgress: (projectId) =>
      invokeChannel(IPC_CHANNELS.BOOTSTRAP_GET_AUTO_PREPROCESS_PROGRESS, { projectId }),
    resetAiMemory: (input) =>
      invokeChannel(IPC_CHANNELS.BOOTSTRAP_RESET_AI_MEMORY, input),
  },
  gemini: {
    send: (input) => invokeChannel(IPC_CHANNELS.GEMINI_SEND, input),
  },
  jobs: {
    list: (projectId) =>
      invokeChannel(IPC_CHANNELS.JOB_LIST, projectId ? { projectId } : {}),
    get: (jobId) => invokeChannel(IPC_CHANNELS.JOB_GET, { jobId }),
    attention: (input) => invokeChannel(IPC_CHANNELS.JOB_ATTENTION, input),
    recover: (jobId) => invokeChannel(IPC_CHANNELS.JOB_RECOVER, { jobId }),
    enqueue: (input) => invokeChannel(IPC_CHANNELS.JOB_ENQUEUE, input),
    enqueueNovel: (input) => invokeChannel(IPC_CHANNELS.JOB_ENQUEUE_NOVEL, input),
    cancel: (jobId) => invokeChannel(IPC_CHANNELS.JOB_CANCEL, { jobId }),
    retry: (jobId) => invokeChannel(IPC_CHANNELS.JOB_RETRY, { jobId }),
    bulk: (input) => invokeChannel(IPC_CHANNELS.JOB_BULK, input),
    move: (jobId, priority) =>
      invokeChannel(IPC_CHANNELS.JOB_MOVE, { jobId, priority }),
    changeWorker: (input) => invokeChannel(IPC_CHANNELS.JOB_CHANGE_WORKER, input),
    pauseAll: () => invokeChannel(IPC_CHANNELS.JOB_PAUSE_ALL),
    resumeAll: () => invokeChannel(IPC_CHANNELS.JOB_RESUME_ALL),
    schedulerStatus: () => invokeChannel(IPC_CHANNELS.JOB_SCHEDULER_STATUS),
    updateSchedulerSettings: (input) =>
      invokeChannel(IPC_CHANNELS.JOB_SCHEDULER_UPDATE_SETTINGS, input),
    workers: () => invokeChannel(IPC_CHANNELS.JOB_WORKERS),
  },
  learning: {
    dashboard: (projectId) =>
      invokeChannel(IPC_CHANNELS.LEARNING_DASHBOARD, { projectId }),
  },
  editor: {
    getChapter: (input) => invokeChannel(IPC_CHANNELS.EDITOR_GET_CHAPTER, input),
    saveParagraph: (input) => invokeChannel(IPC_CHANNELS.EDITOR_SAVE_PARAGRAPH, input),
    listVersions: (translationId) =>
      invokeChannel(IPC_CHANNELS.EDITOR_LIST_VERSIONS, { translationId }),
    revertVersion: (input) => invokeChannel(IPC_CHANNELS.EDITOR_REVERT_VERSION, input),
    getContext: (input) => invokeChannel(IPC_CHANNELS.EDITOR_GET_CONTEXT, input),
    clearChapterTranslations: (input) =>
      invokeChannel(IPC_CHANNELS.EDITOR_CLEAR_CHAPTER_TRANSLATIONS, input),
    clearChaptersTranslations: (input) =>
      invokeChannel(IPC_CHANNELS.EDITOR_CLEAR_CHAPTERS_TRANSLATIONS, input),
    retranslateChapter: (input) =>
      invokeChannel(IPC_CHANNELS.EDITOR_RETRANSLATE_CHAPTER, input),
    retranslateChapters: (input) =>
      invokeChannel(IPC_CHANNELS.EDITOR_RETRANSLATE_CHAPTERS, input),
  },
  portability: {
    exportNovel: (input) => invokeChannel(IPC_CHANNELS.PORTABILITY_EXPORT_NOVEL, input),
    selectExportPath: (input) =>
      invokeChannel(IPC_CHANNELS.PORTABILITY_SELECT_EXPORT_PATH, input),
    createBackup: (input) => invokeChannel(IPC_CHANNELS.PORTABILITY_CREATE_BACKUP, input),
    previewRestore: (input) =>
      invokeChannel(IPC_CHANNELS.PORTABILITY_PREVIEW_RESTORE, input),
    restoreBackup: (input) => invokeChannel(IPC_CHANNELS.PORTABILITY_RESTORE_BACKUP, input),
    getAutoBackupConfig: () => invokeChannel(IPC_CHANNELS.PORTABILITY_GET_AUTO_BACKUP),
    setAutoBackupConfig: (input) =>
      invokeChannel(IPC_CHANNELS.PORTABILITY_SET_AUTO_BACKUP, input),
    listBackups: () => invokeChannel(IPC_CHANNELS.PORTABILITY_LIST_BACKUPS),
    createManualBackup: () => invokeChannel(IPC_CHANNELS.PORTABILITY_CREATE_MANUAL_BACKUP),
    selectBackupPath: () => invokeChannel(IPC_CHANNELS.PORTABILITY_SELECT_BACKUP_PATH),
    getBackupDirectory: () => invokeChannel(IPC_CHANNELS.PORTABILITY_GET_BACKUP_DIRECTORY),
    setBackupDirectory: (input) =>
      invokeChannel(IPC_CHANNELS.PORTABILITY_SET_BACKUP_DIRECTORY, input),
    selectBackupDirectory: () =>
      invokeChannel(IPC_CHANNELS.PORTABILITY_SELECT_BACKUP_DIRECTORY),
    resolveExportDirectory: (input) =>
      invokeChannel(IPC_CHANNELS.PORTABILITY_RESOLVE_EXPORT_DIRECTORY, input),
    getDefaultExportDirectory: () =>
      invokeChannel(IPC_CHANNELS.PORTABILITY_GET_DEFAULT_EXPORT_DIRECTORY),
    setDefaultExportDirectory: (input) =>
      invokeChannel(IPC_CHANNELS.PORTABILITY_SET_DEFAULT_EXPORT_DIRECTORY, input),
    openDefaultExportDirectory: () =>
      invokeChannel(IPC_CHANNELS.PORTABILITY_OPEN_DEFAULT_EXPORT_DIRECTORY),
    selectExportDirectory: () =>
      invokeChannel(IPC_CHANNELS.PORTABILITY_SELECT_EXPORT_DIRECTORY),
    getProjectExportSettings: (input) =>
      invokeChannel(IPC_CHANNELS.PORTABILITY_GET_PROJECT_EXPORT_SETTINGS, input),
    setProjectExportDirectory: (input) =>
      invokeChannel(IPC_CHANNELS.PORTABILITY_SET_PROJECT_EXPORT_DIRECTORY, input),
    persistExportDirectory: (input) =>
      invokeChannel(IPC_CHANNELS.PORTABILITY_PERSIST_EXPORT_DIRECTORY, input),
    openExportDirectory: (input) =>
      invokeChannel(IPC_CHANNELS.PORTABILITY_OPEN_EXPORT_DIRECTORY, input),
    openExportedFile: (input) =>
      invokeChannel(IPC_CHANNELS.PORTABILITY_OPEN_EXPORTED_FILE, input),
    exportChapter: (input) => invokeChannel(IPC_CHANNELS.PORTABILITY_EXPORT_CHAPTER, input),
    exportChapterRange: (input) =>
      invokeChannel(IPC_CHANNELS.PORTABILITY_EXPORT_CHAPTER_RANGE, input),
    setupStorageRoot: (input) =>
      invokeChannel(IPC_CHANNELS.PORTABILITY_SETUP_STORAGE_ROOT, input),
    checkStorageHealth: () => invokeChannel(IPC_CHANNELS.PORTABILITY_CHECK_STORAGE_HEALTH),
    backupNow: () => invokeChannel(IPC_CHANNELS.PORTABILITY_BACKUP_NOW),
  },
  diagnostics: {
    listProviders: () => invokeChannel(IPC_CHANNELS.DIAGNOSTICS_LIST_PROVIDERS),
    healthReport: () => invokeChannel(IPC_CHANNELS.DIAGNOSTICS_HEALTH_REPORT),
    runSystemHealth: () => invokeChannel(IPC_CHANNELS.DIAGNOSTICS_RUN_SYSTEM_HEALTH),
    export: (input) => invokeChannel(IPC_CHANNELS.DIAGNOSTICS_EXPORT, input ?? {}),
    connectionTest: (input) =>
      invokeChannel(IPC_CHANNELS.DIAGNOSTICS_CONNECTION_TEST, input),
    aiBrowserProbe: (input) =>
      invokeChannel(IPC_CHANNELS.DIAGNOSTICS_AI_BROWSER_PROBE, input),
    googleSmoke: (input) => invokeChannel(IPC_CHANNELS.DIAGNOSTICS_GOOGLE_SMOKE, input),
    notebookGroundingSmoke: (input) =>
      invokeChannel(IPC_CHANNELS.DIAGNOSTICS_NOTEBOOK_GROUNDING_SMOKE, input),
    getOverrides: () => invokeChannel(IPC_CHANNELS.DIAGNOSTICS_GET_OVERRIDES),
    loadOverrides: (input) =>
      invokeChannel(IPC_CHANNELS.DIAGNOSTICS_LOAD_OVERRIDES, input ?? {}),
    saveOverrides: (input) => invokeChannel(IPC_CHANNELS.DIAGNOSTICS_SAVE_OVERRIDES, input),
    reloadOverrides: () => invokeChannel(IPC_CHANNELS.DIAGNOSTICS_RELOAD_OVERRIDES),
    repairStart: (input) => invokeChannel(IPC_CHANNELS.DIAGNOSTICS_REPAIR_START, input),
    repairCapture: (input) => invokeChannel(IPC_CHANNELS.DIAGNOSTICS_REPAIR_CAPTURE, input),
    repairApply: (input) => invokeChannel(IPC_CHANNELS.DIAGNOSTICS_REPAIR_APPLY, input),
    repairCancel: (input) => invokeChannel(IPC_CHANNELS.DIAGNOSTICS_REPAIR_CANCEL, input),
    selectExportPath: () => invokeChannel(IPC_CHANNELS.DIAGNOSTICS_SELECT_EXPORT_PATH),
    selectOverridePath: () => invokeChannel(IPC_CHANNELS.DIAGNOSTICS_SELECT_OVERRIDE_PATH),
    listFailureShots: () => invokeChannel(IPC_CHANNELS.DIAGNOSTICS_LIST_FAILURE_SHOTS),
    deleteFailureShot: (input) =>
      invokeChannel(IPC_CHANNELS.DIAGNOSTICS_DELETE_FAILURE_SHOT, input),
    purgeFailureShots: () => invokeChannel(IPC_CHANNELS.DIAGNOSTICS_PURGE_FAILURE_SHOTS),
  },
  browserAttention: {
    list: () => invokeChannel(IPC_CHANNELS.BROWSER_ATTENTION_LIST),
    resolve: (input) => invokeChannel(IPC_CHANNELS.BROWSER_ATTENTION_RESOLVE, input),
  },
  attentionInbox: {
    list: () => invokeChannel(IPC_CHANNELS.ATTENTION_INBOX_LIST),
    countOpen: () => invokeChannel(IPC_CHANNELS.ATTENTION_INBOX_COUNT),
    act: (input) => invokeChannel(IPC_CHANNELS.ATTENTION_INBOX_ACT, input),
    bulkRetry: (input) => invokeChannel(IPC_CHANNELS.ATTENTION_INBOX_BULK_RETRY, input),
    reconcile: () => invokeChannel(IPC_CHANNELS.ATTENTION_INBOX_RECONCILE),
  },
  fictionSeries: {
    list: () => invokeChannel(IPC_CHANNELS.FICTION_SERIES_LIST),
    get: (seriesId) => invokeChannel(IPC_CHANNELS.FICTION_SERIES_GET, { seriesId }),
    create: (input) => invokeChannel(IPC_CHANNELS.FICTION_SERIES_CREATE, input),
    listVolumes: (seriesId) =>
      invokeChannel(IPC_CHANNELS.FICTION_SERIES_LIST_VOLUMES, { seriesId }),
    addVolume: (input) => invokeChannel(IPC_CHANNELS.FICTION_SERIES_ADD_VOLUME, input),
    removeVolume: (input) =>
      invokeChannel(IPC_CHANNELS.FICTION_SERIES_REMOVE_VOLUME, input),
    reorderVolumes: (input) =>
      invokeChannel(IPC_CHANNELS.FICTION_SERIES_REORDER_VOLUMES, input),
    previewMembership: (input) =>
      invokeChannel(IPC_CHANNELS.FICTION_SERIES_PREVIEW_MEMBERSHIP, input),
    assignProject: (input) =>
      invokeChannel(IPC_CHANNELS.FICTION_SERIES_ASSIGN_PROJECT, input),
    exportKnowledge: (input) =>
      invokeChannel(IPC_CHANNELS.FICTION_SERIES_EXPORT_KNOWLEDGE, input),
    getWorld: (input) => invokeChannel(IPC_CHANNELS.FICTION_SERIES_GET_WORLD, input),
    setWorld: (input) => invokeChannel(IPC_CHANNELS.FICTION_SERIES_SET_WORLD, input),
    listStyleRules: (seriesId) =>
      invokeChannel(IPC_CHANNELS.FICTION_SERIES_LIST_STYLE_RULES, { seriesId }),
    upsertStyleRule: (input) =>
      invokeChannel(IPC_CHANNELS.FICTION_SERIES_UPSERT_STYLE_RULE, input),
    deleteStyleRule: (input) =>
      invokeChannel(IPC_CHANNELS.FICTION_SERIES_DELETE_STYLE_RULE, input),
    update: (input) => invokeChannel(IPC_CHANNELS.FICTION_SERIES_UPDATE, input),
  },
  setup: {
    getStatus: () => invokeChannel(IPC_CHANNELS.SETUP_GET_STATUS),
    setStep: (input) => invokeChannel(IPC_CHANNELS.SETUP_SET_STEP, input),
    explore: (input) => invokeChannel(IPC_CHANNELS.SETUP_EXPLORE, input),
    complete: (input) => invokeChannel(IPC_CHANNELS.SETUP_COMPLETE, input),
  },
  logs: {
    tail: (input) => invokeChannel(IPC_CHANNELS.LOGS_TAIL, input ?? {}),
    openDir: () => invokeChannel(IPC_CHANNELS.LOGS_OPEN_DIR),
  },
  aiProviders: {
    list: () => invokeChannel(IPC_CHANNELS.AI_PROVIDER_LIST),
    health: () => invokeChannel(IPC_CHANNELS.AI_PROVIDER_HEALTH),
    setPriority: (input) => invokeChannel(IPC_CHANNELS.AI_PROVIDER_SET_PRIORITY, input),
    setEnabled: (input) => invokeChannel(IPC_CHANNELS.AI_PROVIDER_SET_ENABLED, input),
    check: (input) => invokeChannel(IPC_CHANNELS.AI_PROVIDER_CHECK, input),
    setFallback: (input) => invokeChannel(IPC_CHANNELS.AI_PROVIDER_SET_FALLBACK, input),
    getRouting: (input) => invokeChannel(IPC_CHANNELS.AI_PROVIDER_GET_ROUTING, input ?? {}),
    setPrimary: (input) => invokeChannel(IPC_CHANNELS.AI_PROVIDER_SET_PRIMARY, input),
    setPreference: (input) => invokeChannel(IPC_CHANNELS.AI_PROVIDER_SET_PREFERENCE, input),
    checkAll: () => invokeChannel(IPC_CHANNELS.AI_PROVIDER_CHECK_ALL),
    installWorker: () => invokeChannel(IPC_CHANNELS.AI_PROVIDER_INSTALL_WORKER),
    autoSetupStatus: () => invokeChannel(IPC_CHANNELS.AI_AUTO_SETUP_STATUS),
    autoSetupRun: () => invokeChannel(IPC_CHANNELS.AI_AUTO_SETUP_RUN),
  },
  aiAccounts: {
    list: (input) => invokeChannel(IPC_CHANNELS.AI_ACCOUNT_LIST, input ?? {}),
    create: (input) => invokeChannel(IPC_CHANNELS.AI_ACCOUNT_CREATE, input),
    pasteCookies: (input) => invokeChannel(IPC_CHANNELS.AI_ACCOUNT_PASTE_COOKIES, input),
    check: (input) => invokeChannel(IPC_CHANNELS.AI_ACCOUNT_CHECK, input),
    disable: (input) => invokeChannel(IPC_CHANNELS.AI_ACCOUNT_DISABLE, input),
    delete: (input) => invokeChannel(IPC_CHANNELS.AI_ACCOUNT_DELETE, input),
    openBrowserLogin: (input) =>
      invokeChannel(IPC_CHANNELS.AI_BROWSER_ACCOUNT_OPEN_LOGIN, input),
    verifyBrowser: (input) => invokeChannel(IPC_CHANNELS.AI_BROWSER_ACCOUNT_VERIFY, input),
    updateDisplayName: (input) =>
      invokeChannel(IPC_CHANNELS.AI_ACCOUNT_UPDATE_DISPLAY_NAME, input),
  },
  aiModels: {
    list: (input) => invokeChannel(IPC_CHANNELS.AI_MODELS_LIST, input),
    sync: (input) => invokeChannel(IPC_CHANNELS.AI_MODELS_SYNC, input),
  },
  khepree: {
    getAccessState: () => invokeChannel(IPC_CHANNELS.KHEPREE_GET_ACCESS_STATE),
    startLogin: () => invokeChannel(IPC_CHANNELS.KHEPREE_START_LOGIN),
    retryColdStart: () => invokeChannel(IPC_CHANNELS.KHEPREE_RETRY_COLD_START),
    retryActivation: () => invokeChannel(IPC_CHANNELS.KHEPREE_RETRY_ACTIVATION),
    refreshEntitlement: () => invokeChannel(IPC_CHANNELS.KHEPREE_REFRESH_ENTITLEMENT),
    startCheckout: (input) => invokeChannel(IPC_CHANNELS.KHEPREE_START_CHECKOUT, input),
    cancelCheckout: () => invokeChannel(IPC_CHANNELS.KHEPREE_CANCEL_CHECKOUT),
    checkCheckout: () => invokeChannel(IPC_CHANNELS.KHEPREE_CHECK_CHECKOUT),
    reopenCheckout: () => invokeChannel(IPC_CHANNELS.KHEPREE_REOPEN_CHECKOUT),
    getPlanCatalog: () => invokeChannel(IPC_CHANNELS.KHEPREE_GET_PLAN_CATALOG),
    signOut: () => invokeChannel(IPC_CHANNELS.KHEPREE_SIGN_OUT),
    openExternal: (input) => invokeChannel(IPC_CHANNELS.KHEPREE_OPEN_EXTERNAL, input),
    listAnnouncements: () => invokeChannel(IPC_CHANNELS.KHEPREE_ANNOUNCEMENTS_LIST),
    syncAnnouncements: () => invokeChannel(IPC_CHANNELS.KHEPREE_ANNOUNCEMENTS_SYNC),
    markAnnouncementRead: (input) =>
      invokeChannel(IPC_CHANNELS.KHEPREE_ANNOUNCEMENT_MARK_READ, input),
    dismissAnnouncement: (input) =>
      invokeChannel(IPC_CHANNELS.KHEPREE_ANNOUNCEMENT_DISMISS, input),
    onAccessState: (callback) => {
      const listener = (_event: Electron.IpcRendererEvent, payload: unknown) => {
        callback(payload as import('@shared/schemas/khepree').KhepreeAccessState);
      };
      ipcRenderer.on(IPC_CHANNELS.KHEPREE_ACCESS_STATE, listener);
      return () => {
        ipcRenderer.removeListener(IPC_CHANNELS.KHEPREE_ACCESS_STATE, listener);
      };
    },
  },
  uiLanguage: {
    get: () => invokeChannel(IPC_CHANNELS.UI_LANGUAGE_GET),
    set: (input) => invokeChannel(IPC_CHANNELS.UI_LANGUAGE_SET, input),
    completeFirstRun: (input) =>
      invokeChannel(IPC_CHANNELS.UI_LANGUAGE_COMPLETE_FIRST_RUN, input),
  },
  checkForUpdates: () => invokeChannel(IPC_CHANNELS.APP_CHECK_FOR_UPDATES),
  production: {
    onCompletion: (callback) => {
      const listener = (_event: Electron.IpcRendererEvent, payload: unknown) => {
        callback(
          payload as import('@shared/schemas/delivery-completion').ProductionCompletionEvent,
        );
      };
      ipcRenderer.on(IPC_CHANNELS.PRODUCTION_ON_COMPLETION, listener);
      return () => {
        ipcRenderer.removeListener(IPC_CHANNELS.PRODUCTION_ON_COMPLETION, listener);
      };
    },
  },
  notify: {
    getDesktopEnabled: () => invokeChannel(IPC_CHANNELS.NOTIFY_GET_DESKTOP_ENABLED),
    setDesktopEnabled: (input) =>
      invokeChannel(IPC_CHANNELS.NOTIFY_SET_DESKTOP_ENABLED, input),
  },
  librarySearch: {
    query: (input) => invokeChannel(IPC_CHANNELS.LIBRARY_SEARCH_QUERY, input),
    cancelQuery: () => invokeChannel(IPC_CHANNELS.LIBRARY_SEARCH_CANCEL),
    getSettings: () => invokeChannel(IPC_CHANNELS.LIBRARY_SEARCH_GET_SETTINGS),
    updateSettings: (input) =>
      invokeChannel(IPC_CHANNELS.LIBRARY_SEARCH_UPDATE_SETTINGS, input),
    startReindex: (input) => invokeChannel(IPC_CHANNELS.LIBRARY_SEARCH_START_REINDEX, input),
    cancelReindex: () => invokeChannel(IPC_CHANNELS.LIBRARY_SEARCH_CANCEL_REINDEX),
    getReindexProgress: () =>
      invokeChannel(IPC_CHANNELS.LIBRARY_SEARCH_GET_REINDEX_PROGRESS),
    onReindexProgress: (callback) => {
      const listener = (_event: Electron.IpcRendererEvent, payload: unknown) => {
        callback(payload as import('@shared/schemas/library-search').LibrarySearchIndexProgressDto);
      };
      ipcRenderer.on(IPC_CHANNELS.LIBRARY_SEARCH_ON_REINDEX_PROGRESS, listener);
      return () => {
        ipcRenderer.removeListener(IPC_CHANNELS.LIBRARY_SEARCH_ON_REINDEX_PROGRESS, listener);
      };
    },
  },
  featureIntro: {
    getState: () => invokeChannel(IPC_CHANNELS.FEATURE_INTRO_GET_STATE),
    dismiss: (input) => invokeChannel(IPC_CHANNELS.FEATURE_INTRO_DISMISS, input),
    updateTour: (input) => invokeChannel(IPC_CHANNELS.FEATURE_INTRO_UPDATE_TOUR, input),
  },
  updates: {
    getStatus: () => invokeChannel(IPC_CHANNELS.UPDATE_GET_STATUS),
    checkNow: () => invokeChannel(IPC_CHANNELS.UPDATE_CHECK_NOW),
    installAndRestart: () => invokeChannel(IPC_CHANNELS.UPDATE_INSTALL_AND_RESTART),
    postpone: (input?: { untilMs?: number }) =>
      invokeChannel(IPC_CHANNELS.UPDATE_POSTPONE, input ?? {}),
    onStatus: (callback) => {
      const listener = (_event: Electron.IpcRendererEvent, payload: unknown) => {
        callback(payload as import('@shared/schemas/updates').UpdateStatus);
      };
      ipcRenderer.on(IPC_CHANNELS.UPDATE_STATUS, listener);
      return () => {
        ipcRenderer.removeListener(IPC_CHANNELS.UPDATE_STATUS, listener);
      };
    },
  },
};

contextBridge.exposeInMainWorld('khepreeNovelAI', api);

