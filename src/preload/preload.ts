import { contextBridge, ipcRenderer } from 'electron';
import {
  ALLOWED_IPC_CHANNELS,
  IPC_CHANNELS,
} from '@shared/constants/ipc-channels';
import type { AppPathKey } from '@shared/constants/paths';
import type { GoogleAccountPlan } from '@shared/constants/google-account';
import type { NovelTransApi } from '@shared/types/ipc';

function invokeChannel<T>(channel: string, payload?: unknown): Promise<T> {
  if (!ALLOWED_IPC_CHANNELS.has(channel)) {
    return Promise.reject(new Error(`IPC channel not allowed: ${channel}`));
  }
  if (payload === undefined) {
    return ipcRenderer.invoke(channel) as Promise<T>;
  }
  return ipcRenderer.invoke(channel, payload) as Promise<T>;
}

const api: NovelTransApi = {
  ping: () => invokeChannel(IPC_CHANNELS.APP_PING),
  getVersion: () => invokeChannel(IPC_CHANNELS.APP_GET_VERSION),
  getInfo: () => invokeChannel(IPC_CHANNELS.APP_GET_INFO),
  getPaths: () => invokeChannel(IPC_CHANNELS.APP_GET_PATHS),
  openFolder: (pathKey: AppPathKey) =>
    invokeChannel(IPC_CHANNELS.APP_OPEN_FOLDER, { pathKey }),
  openGuide: (guideId) =>
    invokeChannel(IPC_CHANNELS.APP_OPEN_GUIDE, { guideId }),
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
    connectDrive: (accountId) =>
      invokeChannel(IPC_CHANNELS.ACCOUNT_CONNECT_DRIVE, { accountId }),
    connectDriveWithAuth: (accountId, authPayload) =>
      invokeChannel(IPC_CHANNELS.ACCOUNT_CONNECT_DRIVE_AUTH, { accountId, authPayload }),
    disconnectDrive: (accountId) =>
      invokeChannel(IPC_CHANNELS.ACCOUNT_DISCONNECT_DRIVE, { accountId }),
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
  drive: {
    oauthStatus: () => invokeChannel(IPC_CHANNELS.DRIVE_OAUTH_STATUS),
    setOAuthClient: (input) =>
      invokeChannel(IPC_CHANNELS.DRIVE_SET_OAUTH_CLIENT, input),
    getStatus: (projectId) =>
      invokeChannel(IPC_CHANNELS.DRIVE_GET_STATUS, { projectId }),
    assignWorker: (input) => invokeChannel(IPC_CHANNELS.DRIVE_ASSIGN_WORKER, input),
    setSchedule: (input) => invokeChannel(IPC_CHANNELS.DRIVE_SET_SCHEDULE, input),
    provision: (projectId) => invokeChannel(IPC_CHANNELS.DRIVE_PROVISION, { projectId }),
    sync: (input) => invokeChannel(IPC_CHANNELS.DRIVE_SYNC, input),
    retry: (projectId) => invokeChannel(IPC_CHANNELS.DRIVE_RETRY, { projectId }),
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
  },
  diagnostics: {
    listProviders: () => invokeChannel(IPC_CHANNELS.DIAGNOSTICS_LIST_PROVIDERS),
    healthReport: () => invokeChannel(IPC_CHANNELS.DIAGNOSTICS_HEALTH_REPORT),
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
  },
  setup: {
    getStatus: () => invokeChannel(IPC_CHANNELS.SETUP_GET_STATUS),
    setStep: (input) => invokeChannel(IPC_CHANNELS.SETUP_SET_STEP, input),
    skipDrive: (input) => invokeChannel(IPC_CHANNELS.SETUP_SKIP_DRIVE, input),
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
    installWorker: () => invokeChannel(IPC_CHANNELS.AI_PROVIDER_INSTALL_WORKER),
  },
  aiAccounts: {
    list: (input) => invokeChannel(IPC_CHANNELS.AI_ACCOUNT_LIST, input ?? {}),
    create: (input) => invokeChannel(IPC_CHANNELS.AI_ACCOUNT_CREATE, input),
    pasteCookies: (input) => invokeChannel(IPC_CHANNELS.AI_ACCOUNT_PASTE_COOKIES, input),
    check: (input) => invokeChannel(IPC_CHANNELS.AI_ACCOUNT_CHECK, input),
    disable: (input) => invokeChannel(IPC_CHANNELS.AI_ACCOUNT_DISABLE, input),
    delete: (input) => invokeChannel(IPC_CHANNELS.AI_ACCOUNT_DELETE, input),
  },
  aiModels: {
    list: (input) => invokeChannel(IPC_CHANNELS.AI_MODELS_LIST, input),
    sync: (input) => invokeChannel(IPC_CHANNELS.AI_MODELS_SYNC, input),
  },
  checkForUpdates: () => invokeChannel(IPC_CHANNELS.APP_CHECK_FOR_UPDATES),
};

contextBridge.exposeInMainWorld('novelTrans', api);

