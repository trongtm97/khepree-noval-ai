import { app, dialog, ipcMain, shell } from 'electron';
import path from 'node:path';
import { IPC_CHANNELS } from './channels';
import {
  GetInfoResponseSchema,
  GetPathsResponseSchema,
  GetVersionResponseSchema,
  OpenFolderRequestSchema,
  OpenFolderResponseSchema,
  OpenOfficialContactRequestSchema,
  OpenOfficialContactResponseSchema,
  PingResponseSchema,
  SecurityHealthCheckResponseSchema,
} from '@shared/schemas/ipc';
import {
  LogsTailRequestSchema,
  LogsTailResponseSchema,
} from '@shared/schemas/logs';
import { tailApplicationLogs } from '../services/log-reader-service';
import {
  AccountActionResponseSchema,
  AccountAddRequestSchema,
  AccountCompleteLoginRequestSchema,
  AccountIdRequestSchema,
  AccountListResponseSchema,
  AccountOpenBrowserRequestSchema,
  AccountRemoveRequestSchema,
  AccountRemoveResponseSchema,
  AccountRenameRequestSchema,
  AccountSetNotesRequestSchema,
  AccountSetPlanRequestSchema,
  AccountTestSessionResponseSchema,
  GoogleAccountDtoSchema,
} from '@shared/schemas/account';
import {
  ImportCommitRequestSchema,
  ImportCommitResponseSchema,
  ImportDiscardRequestSchema,
  ImportDiscardResponseSchema,
  ImportPreviewRequestSchema,
  ImportPreviewResponseSchema,
  ImportSelectFileResponseSchema,
  ImportUpdatePreviewRequestSchema,
  ProjectCreateRequestSchema,
  ProjectCreateResponseSchema,
  ProjectDeleteResponseSchema,
  ProjectDtoSchema,
  ProjectIdRequestSchema,
  ProjectListResponseSchema,
  ProjectUpdateLanguagesRequestSchema,
  ProjectUpdateLanguagesResponseSchema,
} from '@shared/schemas/import';
import {
  BatchImportCancelResponseSchema,
  BatchImportCommitRequestSchema,
  BatchImportCommitResponseSchema,
  BatchImportDiscardResponseSchema,
  BatchImportGetSessionResponseSchema,
  BatchImportListProjectsResponseSchema,
  BatchImportListSessionsResponseSchema,
  BatchImportRetryCandidateRequestSchema,
  BatchImportRetryCandidateResponseSchema,
  BatchImportScanRequestSchema,
  BatchImportScanResponseSchema,
  BatchImportSelectSourceRequestSchema,
  BatchImportSelectSourceResponseSchema,
  BatchImportSessionIdRequestSchema,
  BatchImportUpdateCandidateRequestSchema,
  BatchImportUpdateCandidateResponseSchema,
} from '@shared/schemas/batch-import';
import {
  LanguageDetectRequestSchema,
  LanguageDetectResponseSchema,
  LanguageListResponseSchema,
  LanguageProfileDtoSchema,
} from '@shared/schemas/language-profile';
import {
  listLanguageProfiles,
  normalizeLanguageCode,
  DEFAULT_TARGET_LANGUAGE,
  LANGUAGE_AUTO,
} from '@shared/constants/language-profile';
import {
  DefaultTargetLanguageSettingsSchema,
  SetDefaultTargetLanguageRequestSchema,
  SetDefaultTargetLanguageResponseSchema,
} from '@shared/schemas/translation-settings';
import {
  readDefaultTargetLanguage,
  setDefaultTargetLanguage,
} from '../services/translation-settings-service';
import { getTranslationRecipeService } from '../services/translation-recipe-service';
import {
  CampaignIdRequestSchema,
  ProjectRecipeOverrideRequestSchema,
  RecipeCreateRequestSchema,
  RecipeDeleteResponseSchema,
  RecipeExportResponseSchema,
  RecipeIdRequestSchema,
  RecipeImportRequestSchema,
  RecipeItemResponseSchema,
  RecipeListRequestSchema,
  RecipeListResponseSchema,
  RecipeResolveProjectRequestSchema,
  RecipeResolveResponseSchema,
  RecipeSetDefaultRequestSchema,
  RecipeSetDefaultResponseSchema,
  RecipeUpdateRequestSchema,
} from '@shared/schemas/translation-recipe';
import {
  CampaignAddProjectsRequestSchema,
  CampaignControlRequestSchema,
  CampaignCreateWithProjectsRequestSchema,
  CampaignDetailResponseSchema,
  CampaignListResponseSchema as CampaignOrchestrationListResponseSchema,
  CampaignPlanResponseSchema,
  CampaignPreflightRequestSchema,
  CampaignProjectControlRequestSchema,
  CampaignRemoveProjectRequestSchema,
  CampaignSetProjectOverrideRequestSchema as CampaignOrchestrationOverrideRequestSchema,
  CampaignStartRequestSchema,
  CampaignStartResponseSchema,
} from '@shared/schemas/translation-campaign';
import { getTranslationCampaignService } from '../services/translation-campaign-service';
import {
  SourceLanguageRedetectRequestSchema,
  SourceLanguageRedetectResponseSchema,
} from '@shared/schemas/source-language';
import { redetectProjectSourceLanguage } from '../services/source-language-redetect';
import { resolveProjectSourceLanguage } from '../services/resolve-project-source-language';
import {
  detectSourceLanguage,
  toLegacyLanguageDetectResponse,
  resolveSourceLanguageInput,
} from '../language/language-detect';
import {
  ProjectWorkerResolveRequestSchema,
  ProjectWorkerResolutionDtoSchema,
  ProjectWorkerSetRequestSchema,
  ProjectWorkerSetResponseSchema,
} from '@shared/schemas/project-worker';
import { ProjectWorkerResolver } from '../services/project-worker-resolver';
import { APP_NAME } from '@shared/constants/app';
import { createIpcHandler, createIpcHandlerNoArg } from './validate';
import { pathsService } from '../services/paths-service';
import { logger } from '../logging/logger';
import { assertIpcAuditComplete } from '../security/ipc-audit';
import { getSecretStorage, getAuditLog } from '../security';
import { getAccountWorkerService } from '../services/account-worker-singleton';
import type { GoogleAccountDetail } from '../db/repositories/google-account-repository';
import { toGoogleAccountDto } from '../services/account-dto';
import { getAccountAvailabilityService } from '../services/account-availability-service';
import { getLibrarySearchService } from '../library-search/library-search-service';
import { getAttentionInboxService } from '../services/attention-inbox-service';
import { getFeatureIntroService } from '../services/feature-intro-service';
import { getDatabase } from '../db/connection';
import { toProjectDto, toProjectDtoFromDb } from '../services/project-dto';
import {
  createEdition,
  ensureDefaultEdition,
  listEditions,
  switchEdition,
} from '../services/edition-service';
import {
  EditionCreateRequestSchema,
  EditionCreateResponseSchema,
  EditionListRequestSchema,
  EditionListResponseSchema,
  EditionSwitchRequestSchema,
  EditionSwitchResponseSchema,
} from '@shared/schemas/edition';
import { getImportService } from '../import/import-service-singleton';
import { getBatchImportPreflightService, getBatchImportCommitService } from '../batch-import/batch-import-singleton';
import {
  getSourceFolderService,
  getSourceWatcherManager,
} from '../source-folder/source-folder-singleton';
import {
  FolderPreviewDtoSchema,
  SourceFolderChangeFolderRequestSchema,
  SourceFolderGetDiffRequestSchema,
  SourceFolderGetDiffResponseSchema,
  SourceFolderDetectLanguageRequestSchema,
  SourceFolderImportRequestSchema,
  SourceFolderMarkRetranslateRequestSchema,
  SourceFolderResolveConflictRequestSchema,
  SourceFolderScanPreviewRequestSchema,
  SourceFolderScanRequestSchema,
  SourceFolderSelectFolderResponseSchema,
  SourceFolderStatusSchema,
  SourceFolderUpdateSettingsRequestSchema,
} from '@shared/schemas/source-folder';
import {
  BookMetadataGetRequestSchema,
  BookMetadataListDocumentsRequestSchema,
  BookMetadataUpdateRequestSchema,
  ProjectMetadataDtoSchema,
} from '@shared/schemas/book-metadata';
import {
  projectRowToMetadataDto,
  updateMetadataFromUserEdit,
} from '../source-folder/book-metadata-service';
import { getTermService } from '../services/term-service-singleton';
import { getTabularService } from '../services/tabular-service-singleton';
import {
  TermBulkResponseSchema,
  TermCandidateListRequestSchema,
  TermCandidateListResponseSchema,
  TermCandidateReviewRequestSchema,
  TermCountByProjectResponseSchema,
  TermExportRequestSchema,
  TermExportResponseSchema,
  TermGetRequestSchema,
  TermGetResponseSchema,
  TermImportRequestSchema,
  TermListResponseSchema,
  TermMatchChapterRequestSchema,
  TermMatchChapterResponseSchema,
  TermExtractCandidatesRequestSchema,
  TermReviewActionRequestSchema,
  TermSearchRequestSchema,
  TermUpsertRequestSchema,
} from '@shared/schemas/term';
import {
  CharacterListRequestSchema,
  CharacterListResponseSchema,
  CharacterUpsertRequestSchema,
  CharacterUpsertResponseSchema,
  MemoryApplyDeltaRequestSchema,
  MemoryApplyDeltaResponseSchema,
  MemoryBuildContextRequestSchema,
  MemoryBuildContextResponseSchema,
  MemoryConflictListRequestSchema,
  MemoryConflictResolveRequestSchema,
  RelationshipListRequestSchema,
  RelationshipListResponseSchema,
  RelationshipUpsertRequestSchema,
  StoryStateGetRequestSchema,
  StoryStatePatchRequestSchema,
  StoryStateDtoSchema,
  MemoryConflictDtoSchema,
} from '@shared/schemas/memory';
import { getMemoryService } from '../services/memory-service-singleton';
import { getTranslationPackService } from '../services/translation-pack-service-singleton';
import { getNotebookService } from '../services/notebook-service-singleton';
import { getGeminiService } from '../services/gemini-service-singleton';
import {
  BuildTranslationPackRequestSchema,
  BuildTranslationPackResponseSchema,
  ListChaptersRequestSchema,
  ListChaptersResponseSchema,
} from '@shared/schemas/translation-pack';
import { NotebookBootstrapService } from '../notebook/notebook-bootstrap-service';
import { BootstrapAnalysisService } from '../bootstrap/bootstrap-analysis-service';
import { FullNovelPreprocessService } from '../bootstrap/full-novel-preprocess-service';
import { getNotebookSyncService } from '../notebook/notebook-sync-service-singleton';
import {
  NotebookGetRequestSchema,
  NotebookGetResponseSchema,
  NotebookListRequestSchema,
  NotebookListResponseSchema,
  NotebookProvisionRequestSchema,
  NotebookProvisionResponseSchema,
  NotebookResumeRequestSchema,
  NotebookHealthRequestSchema,
  NotebookHealthDtoSchema,
  NotebookDualHealthDtoSchema,
  NotebookSyncNowRequestSchema,
  NotebookRebuildRequestSchema,
  NotebookBootstrapRequestSchema,
  NotebookBootstrapResponseSchema,
  NotebookPrepareForTranslateRequestSchema,
  NotebookPrepareForTranslateResponseSchema,
  NotebookRunBootstrapAnalysisRequestSchema,
  NotebookBootstrapAnalysisResponseSchema,
  NotebookSkipBootstrapRequestSchema,
  NotebookBootstrapStatusRequestSchema,
  NotebookBootstrapStatusResponseSchema,
  NotebookResearchQueryRequestSchema,
  NotebookResearchQueryResponseSchema,
  NotebookOpenResearchRequestSchema,
  NotebookOpenResearchResponseSchema,
} from '@shared/schemas/notebook';
import {
  TranslateEnsureReadyRequestSchema,
  TranslateEnsureReadyResponseSchema,
} from '@shared/schemas/translate-readiness';
import { TranslateReadinessService } from '../services/translate-readiness-service';
import { getJobService } from '../services/job-service-singleton';
import { getLearningService } from '../services/learning-service-singleton';
import { getTranslationEditorService } from '../services/translation-editor-service-singleton';
import { getPortabilityService } from '../services/portability-service-singleton';
import {
  isDesktopNotifyEnabled,
  setDesktopNotifyEnabled,
} from '../production/completion-notify-bridge';
import { getFictionSeriesService } from '../services/fiction-series-service';
import {
  AddSeriesVolumeRequestSchema,
  CreateFictionSeriesRequestSchema,
  DeleteSeriesStyleRuleRequestSchema,
  ExportSeriesKnowledgeRequestSchema,
  ExportSeriesKnowledgeResponseSchema,
  FictionSeriesDtoSchema,
  FictionSeriesVolumeDtoSchema,
  GetSeriesWorldRequestSchema,
  ListSeriesStyleRulesRequestSchema,
  ListSeriesStyleRulesResponseSchema,
  PreviewSeriesMembershipRequestSchema,
  RemoveSeriesVolumeRequestSchema,
  ReorderSeriesVolumesRequestSchema,
  SeriesMembershipConflictPreviewSchema,
  SeriesStyleRuleDtoSchema,
  SetSeriesWorldRequestSchema,
  UpdateFictionSeriesRequestSchema,
  UpsertSeriesStyleRuleRequestSchema,
  UpsertSeriesStyleRuleResponseSchema,
} from '@shared/schemas/fiction-series';
import {
  LearningDashboardRequestSchema,
  LearningDashboardResponseSchema,
} from '@shared/schemas/learning';
import {
  EditorContextRequestSchema,
  EditorContextResponseSchema,
  EditorGetChapterRequestSchema,
  EditorGetChapterResponseSchema,
  EditorListVersionsRequestSchema,
  EditorListVersionsResponseSchema,
  EditorRevertVersionRequestSchema,
  EditorRevertVersionResponseSchema,
  EditorSaveParagraphRequestSchema,
  EditorSaveParagraphResponseSchema,
  EditorClearChapterTranslationsRequestSchema,
  EditorClearChapterTranslationsResponseSchema,
  EditorClearChaptersTranslationsRequestSchema,
  EditorClearChaptersTranslationsResponseSchema,
  EditorRetranslateChapterRequestSchema,
  EditorRetranslateChapterResponseSchema,
  EditorRetranslateChaptersRequestSchema,
  EditorRetranslateChaptersResponseSchema,
} from '@shared/schemas/translation-editor';
import {
  AutoBackupConfigSchema,
  CreateBackupRequestSchema,
  CreateBackupResponseSchema,
  ListBackupsResponseSchema,
  NovelExportRequestSchema,
  NovelExportResponseSchema,
  PreviewRestoreRequestSchema,
  PreviewRestoreResponseSchema,
  RestoreBackupRequestSchema,
  RestoreBackupResponseSchema,
  SelectExportPathRequestSchema,
  SelectExportPathResponseSchema,
  SetAutoBackupConfigRequestSchema,
  BackupDirectorySchema,
  SetBackupDirectoryRequestSchema,
  SelectBackupDirectoryResponseSchema,
  ResolveExportDirectoryRequestSchema,
  ResolveExportDirectoryResponseSchema,
  DefaultExportDirectorySchema,
  SetDefaultExportDirectoryRequestSchema,
  ProjectExportSettingsSchema,
  SetProjectExportDirectoryRequestSchema,
  PersistExportDirectoryRequestSchema,
  OpenExportDirectoryRequestSchema,
  OpenExportDirectoryResponseSchema,
  OpenExportedFileRequestSchema,
  OpenExportedFileResponseSchema,
  ExportChapterRequestSchema,
  ExportChapterRangeRequestSchema,
  ExportChapterResponseSchema,
  SelectExportDirectoryResponseSchema,
  SetupStorageRootRequestSchema,
  SetupStorageRootResponseSchema,
  StorageHealthResultSchema,
  TermCommitImportRequestSchema,
  TermCommitImportResponseSchema,
  TermImportPreviewRequestSchema,
  TermImportPreviewResponseSchema,
} from '@shared/schemas/portability';
import {
  GetPreprocessPromptRequestSchema,
  GetPreprocessPromptResponseSchema,
  ImportPreprocessResultRequestSchema,
  ImportPreprocessResultResponseSchema,
  PackNovelCorpusRequestSchema,
  PackNovelCorpusResponseSchema,
  SelectBackupPathResponseSchema,
  RunAutoPreprocessRequestSchema,
  RunAutoPreprocessResponseSchema,
  GetAutoPreprocessProgressRequestSchema,
  GetAutoPreprocessProgressResponseSchema,
  ResetAiMemoryRequestSchema,
  ResetAiMemoryResponseSchema,
} from '@shared/schemas/notebooklm-preprocess';
import {
  TabularCommitRequestSchema,
  TabularCommitResponseSchema,
  TabularDiscardPreviewRequestSchema,
  TabularDownloadTermTemplateRequestSchema,
  TabularDownloadTermTemplateResponseSchema,
  TabularExportRequestSchema,
  TabularExportResponseSchema,
  TabularListHistoryResponseSchema,
  TabularPreviewRequestSchema,
  TabularPreviewResponseSchema,
  TabularSelectExportPathRequestSchema,
  TabularSelectFileRequestSchema,
  TabularSelectFileResponseSchema,
  TabularUndoLastRequestSchema,
  TabularUndoLastResponseSchema,
} from '@shared/schemas/tabular';
import { FullNovelPreprocessAutoService } from '../bootstrap/full-novel-preprocess-auto-service';
import { AiMemoryResetService } from '../bootstrap/ai-memory-reset-service';
import { getAutoPreprocessProgress } from '../bootstrap/auto-preprocess-progress';
import {
  AiBrowserProbeRequestSchema,
  AiBrowserProbeResponseSchema,
  GoogleSmokeRunRequestSchema,
  GoogleSmokeRunResponseSchema,
  NotebookGroundingSmokeRunRequestSchema,
  NotebookGroundingSmokeRunResponseSchema,
  ConnectionTestRequestSchema,
  ConnectionTestResponseSchema,
  ExportDiagnosticsRequestSchema,
  ExportDiagnosticsResponseSchema,
  GetHealthReportResponseSchema,
  InteractiveRepairApplyRequestSchema,
  InteractiveRepairApplyResponseSchema,
  InteractiveRepairCancelRequestSchema,
  InteractiveRepairCaptureRequestSchema,
  InteractiveRepairCaptureResponseSchema,
  InteractiveRepairStartRequestSchema,
  InteractiveRepairStartResponseSchema,
  ListProviderStatusResponseSchema,
} from '@shared/schemas/diagnostics';
import { SystemHealthResultSchema } from '@shared/schemas/system-health';
import {
  BrowserAttentionListResponseSchema,
  BrowserAttentionResolveRequestSchema,
  BrowserAttentionResolveResponseSchema,
  DiagnosticsDeleteFailureShotRequestSchema,
  DiagnosticsDeleteFailureShotResponseSchema,
  DiagnosticsListFailureShotsResponseSchema,
  DiagnosticsPurgeFailureShotsResponseSchema,
} from '@shared/schemas/browser-attention';
import {
  AttentionInboxActRequestSchema,
  AttentionInboxBulkRetryRequestSchema,
  AttentionInboxCountResponseSchema,
  AttentionInboxListResponseSchema,
} from '@shared/schemas/attention-inbox';
import {
  FeatureIntroDismissRequestSchema,
  FeatureIntroStateSchema,
  FeatureIntroTourUpdateSchema,
} from '@shared/schemas/feature-intro';
import {
  LibrarySearchIndexProgressSchema,
  LibrarySearchQueryInputSchema,
  LibrarySearchSettingsSchema,
} from '@shared/schemas/library-search';
import {
  deleteFailureDiagnostic,
  listFailureDiagnostics,
  purgeFailureDiagnosticsOlderThan,
} from '../automation/diagnostics-retention';
import { getBrowserCircuitBreaker } from '../automation/browser-pool/circuit-breaker';
import { runSystemHealthCheck } from '../services/system-health-service';
import {
  GetSelectorOverridesResponseSchema,
  LoadSelectorOverridesRequestSchema,
  LoadSelectorOverridesResponseSchema,
  SaveSelectorOverridesRequestSchema,
  SaveSelectorOverridesResponseSchema,
} from '@shared/schemas/selector-override';
import { getDiagnosticsService } from '../services/diagnostics-service-singleton';
import { getSetupService } from '../services/setup-service-singleton';
import { getKhepreeAccessService } from '../khepree/khepree-access-singleton';
import { KHEPREE_FEATURES } from '@shared/constants/khepree';
import { assertKhepreeProductAccess } from '../khepree/product-access-boundary';
import { getUiLanguageService } from '../services/ui-language-service-singleton';
import {
  KhepreeCancelCheckoutResponseSchema,
  KhepreeCheckCheckoutResponseSchema,
  KhepreeGetAccessStateResponseSchema,
  KhepreeGetPlanCatalogResponseSchema,
  KhepreeOpenExternalRequestSchema,
  KhepreeOpenExternalResponseSchema,
  KhepreeRefreshEntitlementResponseSchema,
  KhepreeReopenCheckoutResponseSchema,
  KhepreeRetryActivationResponseSchema,
  KhepreeSignOutResponseSchema,
  KhepreeStartCheckoutRequestSchema,
  KhepreeStartCheckoutResponseSchema,
  KhepreeStartLoginResponseSchema,
} from '@shared/schemas/khepree';
import {
  UiLanguageCompleteFirstRunRequestSchema,
  UiLanguageSetRequestSchema,
  UiLanguageSetResponseSchema,
  UiLanguageStatusSchema,
} from '@shared/schemas/ui-language';
import { openKhepreeExternal } from '../khepree/external-links';
import {
  getUpdateProvider,
} from '../updates/update-provider';
import {
  getUpdateService,
  initializeUpdateService,
} from '../updates/update-singleton';
import {
  getAnnouncementSyncService,
  initializeAnnouncementSyncService,
} from '../khepree/announcement-sync-singleton';
import {
  KhepreeAnnouncementsListResponseSchema,
  KhepreeAnnouncementMarkReadRequestSchema,
  KhepreeAnnouncementDismissRequestSchema,
} from '@shared/schemas/khepree-announcements';
import {
  UpdateStatusSchema,
  UpdatePostponeRequestSchema,
  UpdatePostponeResponseSchema,
} from '@shared/schemas/updates';
import {
  CheckForUpdatesResponseSchema,
  SetupCompleteRequestSchema,
  SetupCompleteResponseSchema,
  SetupExploreRequestSchema,
  SetupExploreResponseSchema,
  SetupSetStepRequestSchema,
  SetupStatusSchema,
} from '@shared/schemas/setup';
import {
  GeminiSendRequestSchema,
  GeminiSendResponseSchema,
} from '@shared/schemas/gemini';
import {
  JobAttentionActionRequestSchema,
  JobAttentionActionResponseSchema,
  JobChangeWorkerRequestSchema,
  JobControlRequestSchema,
  JobBulkRequestSchema,
  JobBulkResponseSchema,
  JobControlResponseSchema,
  JobEnqueueRequestSchema,
  JobEnqueueResponseSchema,
  JobEnqueueNovelRequestSchema,
  JobEnqueueNovelResponseSchema,
  JobGetRequestSchema,
  JobGetResponseSchema,
  JobListRequestSchema,
  JobListResponseSchema,
  JobMoveRequestSchema,
  JobRecoverRequestSchema,
  JobRecoverResponseSchema,
  SchedulerStatusResponseSchema,
  SchedulerSettingsUpdateSchema,
  WorkerListResponseSchema,
} from '@shared/schemas/job';
import type { RepairSender } from '../jobs/repair-loop';
import type { TranslationPackDto } from '@shared/schemas/translation-pack';
import { createHash } from 'node:crypto';
import { newId } from '../db/utils/uuid';
import { getAiProviderService } from '../ai/ai-provider-singleton';
import {
  AiAccountActionResponseSchema,
  AiAccountCreateRequestSchema,
  AiAccountIdRequestSchema,
  AiAccountUpdateDisplayNameRequestSchema,
  AiAccountListRequestSchema,
  AiAccountListResponseSchema,
  AiAccountPasteCookiesRequestSchema,
  AiBrowserAccountOpenLoginResponseSchema,
  AiFallbackConfigRequestSchema,
  AiModelsListRequestSchema,
  AiModelsListResponseSchema,
  AiProviderCheckRequestSchema,
  AiProviderHealthResponseSchema,
  AiProviderGetRoutingRequestSchema,
  AiProviderListResponseSchema,
  AiProviderRoutingResponseSchema,
  AiProviderSetPrimaryRequestSchema,
  AiProviderSetPreferenceRequestSchema,
  AiProviderSetEnabledRequestSchema,
  AiProviderSetPriorityRequestSchema,
  ProjectSetAiPreferenceRequestSchema,
  ProjectSetPrimaryProviderRequestSchema,
  ProjectTranslateAiSettingsResponseSchema,
  AiWorkerInstallResponseSchema,
} from '@shared/schemas/ai-provider';
import {
  AiAutoSetupResultSchema,
  AiStatusSnapshotSchema,
} from '@shared/schemas/ai-auto-setup';
import { AiAutoSetupService } from '../ai/ai-auto-setup-service';
import { z } from 'zod';
import {
  mergePreferNotebookPack,
  mergeProjectAiPreference,
  mergeProjectPrimaryProvider,
  projectUsesGlobalPrimary,
  readPreferNotebookPack,
  readProjectAiPreferenceOverride,
  readProjectPrimaryProviderOverride,
} from '@shared/constants/project-style-config';

function accountDto(accountId: string) {
  const detail = getAccountWorkerService().getAccount(accountId);
  if (!detail) {
    throw new Error(`Account not found: ${accountId}`);
  }
  const availability = getAccountAvailabilityService(getDatabase()).resolve(accountId);
  return GoogleAccountDtoSchema.parse(toGoogleAccountDto(detail, availability));
}

function accountDtoFromDetail(detail: GoogleAccountDetail) {
  const availability = getAccountAvailabilityService(getDatabase()).resolve(detail.id);
  return GoogleAccountDtoSchema.parse(toGoogleAccountDto(detail, availability));
}

export function registerIpcHandlers(): void {
  assertIpcAuditComplete();

  ipcMain.handle(
    IPC_CHANNELS.APP_PING,
    createIpcHandlerNoArg(
      () => ({
        ok: true as const,
        timestamp: new Date().toISOString(),
      }),
      PingResponseSchema,
    ),
  );

  ipcMain.handle(
    IPC_CHANNELS.APP_GET_VERSION,
    createIpcHandlerNoArg(
      () => ({
        version: app.getVersion(),
        name: APP_NAME,
      }),
      GetVersionResponseSchema,
    ),
  );

  ipcMain.handle(
    IPC_CHANNELS.APP_GET_INFO,
    createIpcHandlerNoArg(
      () => ({
        name: APP_NAME,
        version: app.getVersion(),
        platform: process.platform,
        arch: process.arch,
        electronVersion: process.versions.electron,
        nodeVersion: process.versions.node,
        isPackaged: app.isPackaged,
      }),
      GetInfoResponseSchema,
    ),
  );

  ipcMain.handle(
    IPC_CHANNELS.APP_GET_PATHS,
    createIpcHandlerNoArg(
      () => pathsService.getPaths(),
      GetPathsResponseSchema,
    ),
  );

  ipcMain.handle(
    IPC_CHANNELS.APP_OPEN_FOLDER,
    createIpcHandler(
      OpenFolderRequestSchema,
      async (request) => {
        const targetPath = pathsService.getPath(request.pathKey);
        if (!pathsService.isManagedPath(targetPath)) {
          throw new Error('Path is outside managed application directories');
        }

        const result = await shell.openPath(targetPath);
        if (result) {
          logger.warn('Failed to open folder', { pathKey: request.pathKey, result });
          throw new Error(result);
        }

        logger.info('Opened managed folder', { pathKey: request.pathKey });
        return { ok: true as const, path: targetPath };
      },
      OpenFolderResponseSchema,
    ),
  );

  ipcMain.handle(
    IPC_CHANNELS.APP_OPEN_OFFICIAL_CONTACT,
    createIpcHandler(
      OpenOfficialContactRequestSchema,
      async (request) => {
        const { openOfficialContact } = await import('../app/official-contact-links');
        const ok = await openOfficialContact(request.channel);
        return OpenOfficialContactResponseSchema.parse({ ok });
      },
      OpenOfficialContactResponseSchema,
    ),
  );

  ipcMain.handle(
    IPC_CHANNELS.SECURITY_HEALTH_CHECK,
    createIpcHandlerNoArg(async () => {
      const health = await getSecretStorage().healthCheck();
      return SecurityHealthCheckResponseSchema.parse(health);
    }, SecurityHealthCheckResponseSchema),
  );

  ipcMain.handle(
    IPC_CHANNELS.ACCOUNT_LIST,
    createIpcHandlerNoArg(() => {
      const availabilitySvc = getAccountAvailabilityService(getDatabase());
      const byId = availabilitySvc.resolveAll();
      const accounts = getAccountWorkerService()
        .listAccounts()
        .map((row) => {
          const availability =
            byId.get(row.id) ?? availabilitySvc.resolve(row.id);
          return GoogleAccountDtoSchema.parse(
            toGoogleAccountDto(row, availability),
          );
        });
      return AccountListResponseSchema.parse({
        accounts,
        summary: availabilitySvc.summarize(),
      });
    }, AccountListResponseSchema),
  );

  ipcMain.handle(
    IPC_CHANNELS.ACCOUNT_GET,
    createIpcHandler(AccountIdRequestSchema, (request) =>
      AccountActionResponseSchema.parse({ account: accountDto(request.accountId) }),
    ),
  );

  ipcMain.handle(
    IPC_CHANNELS.ACCOUNT_ADD,
    createIpcHandler(AccountAddRequestSchema, async (request) => {
      const detail = await getAccountWorkerService().addAccount({
        label: request.label,
        email: request.email,
        skipBrowser: request.skipBrowser,
      });
      return AccountActionResponseSchema.parse({
        account: accountDtoFromDetail(detail),
      });
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.ACCOUNT_RENAME,
    createIpcHandler(AccountRenameRequestSchema, (request) => {
      const detail = getAccountWorkerService().rename(request.accountId, request.label);
      return AccountActionResponseSchema.parse({
        account: accountDtoFromDetail(detail),
      });
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.ACCOUNT_SET_PLAN,
    createIpcHandler(AccountSetPlanRequestSchema, (request) => {
      const detail = getAccountWorkerService().setPlan(request.accountId, request.plan);
      return AccountActionResponseSchema.parse({
        account: accountDtoFromDetail(detail),
      });
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.ACCOUNT_SET_NOTES,
    createIpcHandler(AccountSetNotesRequestSchema, (request) => {
      const detail = getAccountWorkerService().setNotes(request.accountId, request.notes);
      return AccountActionResponseSchema.parse({
        account: accountDtoFromDetail(detail),
      });
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.ACCOUNT_OPEN_BROWSER,
    createIpcHandler(AccountOpenBrowserRequestSchema, async (request) => {
      const detail = await getAccountWorkerService().openBrowser(
        request.accountId,
        request.target ?? 'gemini',
      );
      return AccountActionResponseSchema.parse({
        account: accountDtoFromDetail(detail),
      });
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.ACCOUNT_CLOSE_BROWSER,
    createIpcHandler(AccountIdRequestSchema, async (request) => {
      const detail = await getAccountWorkerService().closeBrowser(request.accountId);
      return AccountActionResponseSchema.parse({
        account: accountDtoFromDetail(detail),
      });
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.ACCOUNT_TEST_SESSION,
    createIpcHandler(AccountIdRequestSchema, async (request) => {
      const result = await getAccountWorkerService().testSession(request.accountId);
      return AccountTestSessionResponseSchema.parse({
        account: accountDtoFromDetail(result.account),
        usable: result.usable,
        email: result.email,
        reason: result.reason,
      });
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.ACCOUNT_COMPLETE_LOGIN,
    createIpcHandler(AccountCompleteLoginRequestSchema, async (request) => {
      const detail = await getAccountWorkerService().completeLogin(request.accountId, {
        email: request.email,
        label: request.label,
      });
      return AccountActionResponseSchema.parse({
        account: accountDtoFromDetail(detail),
      });
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.ACCOUNT_DISABLE,
    createIpcHandler(AccountIdRequestSchema, (request) => {
      const detail = getAccountWorkerService().disableWorker(request.accountId);
      return AccountActionResponseSchema.parse({
        account: accountDtoFromDetail(detail),
      });
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.ACCOUNT_ENABLE,
    createIpcHandler(AccountIdRequestSchema, (request) => {
      const detail = getAccountWorkerService().enableWorker(request.accountId);
      return AccountActionResponseSchema.parse({
        account: accountDtoFromDetail(detail),
      });
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.ACCOUNT_REMOVE,
    createIpcHandler(AccountRemoveRequestSchema, async (request) => {
      const result = await getAccountWorkerService().removeAccount(
        request.accountId,
        request.confirm,
      );
      return AccountRemoveResponseSchema.parse(result);
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.PROJECT_LIST,
    createIpcHandlerNoArg(() => {
      const db = getDatabase();
      const projects = db.projects.list().map((row) => {
        return ProjectDtoSchema.parse(toProjectDtoFromDb(db, row));
      });
      return ProjectListResponseSchema.parse({ projects });
    }, ProjectListResponseSchema),
  );

  ipcMain.handle(
    IPC_CHANNELS.PROJECT_CREATE,
    createIpcHandler(ProjectCreateRequestSchema, async (request) => {
      const resolved = await resolveSourceLanguageInput({
        sourceLanguage: LANGUAGE_AUTO,
        sampleText: request.sampleText,
        hintCode: request.sourceLanguageHint,
      });
      const targetLanguage = normalizeLanguageCode(
        request.targetLanguage ?? DEFAULT_TARGET_LANGUAGE,
      );
      if (resolved.code === targetLanguage) {
        throw new Error('SOURCE_TARGET_SAME');
      }
      const row = getDatabase().projects.create({
        title: request.title,
        genre: request.genre,
        description: request.description,
        source_language: resolved.code,
        target_language: targetLanguage,
        source_language_mode: request.sourceLanguageHint ? 'HINTED' : 'AUTO',
        source_language_hint: request.sourceLanguageHint ?? null,
        source_language_confidence: resolved.detection.confidence,
        source_language_detection_method: resolved.detection.method,
        source_language_detection_checked_at: new Date().toISOString(),
      });
      ensureDefaultEdition(getDatabase(), row.id);
      const refreshed = getDatabase().projects.getById(row.id);
      if (!refreshed) {
        throw new Error(`Project not found after create: ${row.id}`);
      }
      return ProjectCreateResponseSchema.parse({
        project: ProjectDtoSchema.parse(toProjectDto(refreshed, 0)),
        sourceDetection: resolved.detection,
      });
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.PROJECT_UPDATE_LANGUAGES,
    createIpcHandler(ProjectUpdateLanguagesRequestSchema, (request) => {
      const db = getDatabase();
      const existing = db.projects.getById(request.projectId);
      if (!existing) throw new Error(`Project not found: ${request.projectId}`);
      ensureDefaultEdition(db, request.projectId);

      // Source language is detection truth — only target may change here.
      const source = resolveProjectSourceLanguage(existing);
      db.projects.updateLanguages(
        request.projectId,
        source,
        existing.target_language,
      );
      createEdition(db, {
        projectId: request.projectId,
        targetLanguage: request.targetLanguage,
        activate: true,
      });
      const row = db.projects.getById(request.projectId);
      if (!row) throw new Error(`Project not found: ${request.projectId}`);
      return ProjectUpdateLanguagesResponseSchema.parse({
        project: ProjectDtoSchema.parse(toProjectDtoFromDb(db, row)),
      });
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.PROJECT_REDETECT_SOURCE_LANGUAGE,
    createIpcHandler(SourceLanguageRedetectRequestSchema, async (request) => {
      const result = await redetectProjectSourceLanguage(
        getDatabase(),
        request.projectId,
        { apply: request.apply },
      );
      return SourceLanguageRedetectResponseSchema.parse(result);
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.EDITION_LIST,
    createIpcHandler(EditionListRequestSchema, (request) => {
      const editions = listEditions(getDatabase(), request.projectId);
      return EditionListResponseSchema.parse({ editions });
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.EDITION_CREATE,
    createIpcHandler(EditionCreateRequestSchema, (request) => {
      const result = createEdition(getDatabase(), request);
      return EditionCreateResponseSchema.parse(result);
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.EDITION_SWITCH,
    createIpcHandler(EditionSwitchRequestSchema, (request) => {
      const result = switchEdition(getDatabase(), request);
      return EditionSwitchResponseSchema.parse(result);
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.LANGUAGE_LIST,
    createIpcHandlerNoArg(() => {
      return LanguageListResponseSchema.parse({
        languages: listLanguageProfiles().map((p) =>
          LanguageProfileDtoSchema.parse(p),
        ),
      });
    }, LanguageListResponseSchema),
  );

  ipcMain.handle(
    IPC_CHANNELS.LANGUAGE_DETECT,
    createIpcHandler(LanguageDetectRequestSchema, async (request) => {
      const result = toLegacyLanguageDetectResponse(
        await detectSourceLanguage({
          sampleText: request.sampleText,
          hintCode: request.hintCode,
        }),
      );
      return LanguageDetectResponseSchema.parse(result);
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.TRANSLATION_SETTINGS_GET,
    createIpcHandlerNoArg(() => {
      return DefaultTargetLanguageSettingsSchema.parse(
        readDefaultTargetLanguage(getDatabase()),
      );
    }, DefaultTargetLanguageSettingsSchema),
  );

  ipcMain.handle(
    IPC_CHANNELS.TRANSLATION_SETTINGS_SET_DEFAULT_TARGET,
    createIpcHandler(SetDefaultTargetLanguageRequestSchema, (request) => {
      try {
        return SetDefaultTargetLanguageResponseSchema.parse(
          setDefaultTargetLanguage(getDatabase(), request.defaultTargetLanguage),
        );
      } catch (err: unknown) {
        if (err instanceof Error && err.message === 'INVALID_LANGUAGE_CODE') {
          throw new Error('INVALID_LANGUAGE_CODE');
        }
        throw err;
      }
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.TRANSLATION_RECIPE_LIST,
    createIpcHandler(RecipeListRequestSchema, (request) => {
      const service = getTranslationRecipeService();
      return RecipeListResponseSchema.parse({
        recipes: service.list(request.locale),
        defaultRecipeId: service.getDefaultRecipeId(),
      });
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.TRANSLATION_RECIPE_GET_DEFAULT,
    createIpcHandlerNoArg(() => {
      const service = getTranslationRecipeService();
      return RecipeSetDefaultResponseSchema.parse({
        ok: true as const,
        id: service.getDefaultRecipeId(),
      });
    }, RecipeSetDefaultResponseSchema),
  );

  ipcMain.handle(
    IPC_CHANNELS.TRANSLATION_RECIPE_SET_DEFAULT,
    createIpcHandler(RecipeSetDefaultRequestSchema, (request) => {
      return RecipeSetDefaultResponseSchema.parse(
        getTranslationRecipeService().setDefaultRecipeId(request.id),
      );
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.TRANSLATION_RECIPE_CLONE,
    createIpcHandler(RecipeCreateRequestSchema, (request) => {
      const recipe = getTranslationRecipeService().clone({
        cloneFromId: request.cloneFromId ?? getTranslationRecipeService().getDefaultRecipeId(),
        name: request.name,
        description: request.description,
      });
      return RecipeItemResponseSchema.parse({ recipe });
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.TRANSLATION_RECIPE_CREATE,
    createIpcHandler(RecipeCreateRequestSchema, (request) => {
      const recipe = getTranslationRecipeService().create(request);
      return RecipeItemResponseSchema.parse({ recipe });
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.TRANSLATION_RECIPE_UPDATE,
    createIpcHandler(RecipeUpdateRequestSchema, (request) => {
      const recipe = getTranslationRecipeService().update(request);
      return RecipeItemResponseSchema.parse({ recipe });
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.TRANSLATION_RECIPE_DELETE,
    createIpcHandler(RecipeIdRequestSchema, (request) => {
      return RecipeDeleteResponseSchema.parse(
        getTranslationRecipeService().delete(request.id),
      );
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.TRANSLATION_RECIPE_EXPORT,
    createIpcHandler(RecipeIdRequestSchema, (request) => {
      return RecipeExportResponseSchema.parse({
        envelope: getTranslationRecipeService().exportRecipe(request.id),
      });
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.TRANSLATION_RECIPE_IMPORT,
    createIpcHandler(RecipeImportRequestSchema, (request) => {
      const recipe = getTranslationRecipeService().importRecipe(
        request.payload,
        request.name,
      );
      return RecipeItemResponseSchema.parse({ recipe });
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.TRANSLATION_RECIPE_RESOLVE_PROJECT,
    createIpcHandler(RecipeResolveProjectRequestSchema, (request) => {
      return RecipeResolveResponseSchema.parse({
        resolved: getTranslationRecipeService().resolveForProject(request.projectId, {
          campaignId: request.campaignId,
        }),
      });
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.TRANSLATION_RECIPE_SET_PROJECT,
    createIpcHandler(ProjectRecipeOverrideRequestSchema, (request) => {
      return RecipeResolveResponseSchema.parse({
        resolved: getTranslationRecipeService().setProjectRecipe(request),
      });
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.TRANSLATION_CAMPAIGN_CREATE,
    createIpcHandler(CampaignCreateWithProjectsRequestSchema, async (request) => {
      const plan = await getTranslationCampaignService().create(request);
      return CampaignPlanResponseSchema.parse({ plan });
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.TRANSLATION_CAMPAIGN_GET,
    createIpcHandler(CampaignIdRequestSchema, (request) => {
      return CampaignDetailResponseSchema.parse({
        campaign: getTranslationCampaignService().getDetail(request.campaignId),
      });
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.TRANSLATION_CAMPAIGN_LIST,
    createIpcHandlerNoArg(() => {
      return CampaignOrchestrationListResponseSchema.parse({
        campaigns: getTranslationCampaignService().list(),
      });
    }, CampaignOrchestrationListResponseSchema),
  );

  ipcMain.handle(
    IPC_CHANNELS.TRANSLATION_CAMPAIGN_SET_PROJECT_OVERRIDE,
    createIpcHandler(CampaignOrchestrationOverrideRequestSchema, async (request) => {
      const plan = await getTranslationCampaignService().setProjectOverride(
        request.campaignId,
        request.projectId,
        request.override,
      );
      return CampaignPlanResponseSchema.parse({ plan });
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.TRANSLATION_CAMPAIGN_ADD_PROJECTS,
    createIpcHandler(CampaignAddProjectsRequestSchema, async (request) => {
      const plan = await getTranslationCampaignService().addProjects(
        request.campaignId,
        request.projectIds,
      );
      return CampaignPlanResponseSchema.parse({ plan });
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.TRANSLATION_CAMPAIGN_REMOVE_PROJECT,
    createIpcHandler(CampaignRemoveProjectRequestSchema, async (request) => {
      const plan = await getTranslationCampaignService().removeProject(
        request.campaignId,
        request.projectId,
      );
      return CampaignPlanResponseSchema.parse({ plan });
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.TRANSLATION_CAMPAIGN_PREFLIGHT,
    createIpcHandler(CampaignPreflightRequestSchema, async (request) => {
      const plan = await getTranslationCampaignService().runPreflight(request.campaignId);
      return CampaignPlanResponseSchema.parse({ plan });
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.TRANSLATION_CAMPAIGN_START,
    createIpcHandler(CampaignStartRequestSchema, async (request) => {
      const result = await getTranslationCampaignService().start(
        request.campaignId,
        request.startToken,
      );
      return CampaignStartResponseSchema.parse({ result });
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.TRANSLATION_CAMPAIGN_PAUSE,
    createIpcHandler(CampaignControlRequestSchema, (request) => {
      const plan = getTranslationCampaignService().pause(request.campaignId);
      return CampaignPlanResponseSchema.parse({ plan });
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.TRANSLATION_CAMPAIGN_RESUME,
    createIpcHandler(CampaignControlRequestSchema, (request) => {
      const plan = getTranslationCampaignService().resume(request.campaignId);
      return CampaignPlanResponseSchema.parse({ plan });
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.TRANSLATION_CAMPAIGN_CANCEL,
    createIpcHandler(CampaignControlRequestSchema, (request) => {
      const plan = getTranslationCampaignService().cancel(request.campaignId);
      return CampaignPlanResponseSchema.parse({ plan });
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.TRANSLATION_CAMPAIGN_CONTROL_PROJECT,
    createIpcHandler(CampaignProjectControlRequestSchema, (request) => {
      const campaign = getTranslationCampaignService().controlProject({
        campaignId: request.campaignId,
        projectId: request.projectId,
        action: request.action,
        priority: request.priority,
      });
      return CampaignDetailResponseSchema.parse({ campaign });
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.PROJECT_GET,
    createIpcHandler(ProjectIdRequestSchema, (request) => {
      const db = getDatabase();
      const row = db.projects.getById(request.projectId);
      if (!row || row.deleted_at) {
        throw new Error(`Project not found: ${request.projectId}`);
      }
      ensureDefaultEdition(db, request.projectId);
      const refreshed = db.projects.getById(request.projectId);
      if (!refreshed) {
        throw new Error(`Project not found: ${request.projectId}`);
      }
      return ProjectCreateResponseSchema.parse({
        project: ProjectDtoSchema.parse(toProjectDtoFromDb(db, refreshed)),
      });
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.PROJECT_DELETE,
    createIpcHandler(ProjectIdRequestSchema, (request) => {
      const db = getDatabase();
      const row = db.projects.getById(request.projectId);
      if (!row) {
        throw new Error(`Project not found: ${request.projectId}`);
      }

      getSourceWatcherManager().stopWatcher(request.projectId);

      const terminal = new Set([
        'COMPLETED',
        'ACCEPTED_WITH_WARNINGS',
        'FAILED',
        'CANCELLED',
        'SKIPPED',
      ]);
      for (const job of getJobService().list(request.projectId)) {
        if (!terminal.has(job.state)) {
          try {
            getJobService().cancelJob(job.id);
          } catch {
            // Best-effort cancel before soft-delete
          }
        }
      }

      const deleted = db.projects.softDelete(request.projectId);
      if (!deleted) {
        throw new Error(`Project not found: ${request.projectId}`);
      }

      getAuditLog().projectDeleted(request.projectId, row.title);
      return ProjectDeleteResponseSchema.parse({ ok: true });
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.PROJECT_RESOLVE_WORKER,
    createIpcHandler(ProjectWorkerResolveRequestSchema, (request) => {
      const resolution = new ProjectWorkerResolver(getDatabase()).resolve({
        projectId: request.projectId,
        purpose: request.purpose,
        preferredAccountId: request.preferredAccountId,
        jobId: request.jobId,
      });
      return ProjectWorkerResolutionDtoSchema.parse(resolution);
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.PROJECT_SET_WORKER,
    createIpcHandler(ProjectWorkerSetRequestSchema, async (request) => {
      const result = await new ProjectWorkerResolver(getDatabase()).setWorker({
        projectId: request.projectId,
        accountId: request.accountId,
        ensureNotebook: request.ensureNotebook,
      });
      return ProjectWorkerSetResponseSchema.parse(result);
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.PROJECT_GET_TRANSLATE_PACK_SETTINGS,
    createIpcHandler(
      z.object({ projectId: z.string().uuid() }),
      (request) => {
        const db = getDatabase();
        const project = db.projects.getById(request.projectId);
        if (!project) throw new Error(`Project not found: ${request.projectId}`);
        const preferNotebookPack = readPreferNotebookPack(
          db.projects.getStyleConfig(request.projectId),
        );
        const style = db.projects.getStyleConfig(request.projectId);
        return ProjectTranslateAiSettingsResponseSchema.parse({
          preferNotebookPack,
          useGlobalPrimary: projectUsesGlobalPrimary(style),
          primaryProviderId: readProjectPrimaryProviderOverride(style),
          aiPreference: readProjectAiPreferenceOverride(style),
          useGlobalPreference: projectUsesGlobalPrimary(style),
        });
      },
    ),
  );

  ipcMain.handle(
    IPC_CHANNELS.PROJECT_SET_PREFER_NOTEBOOK_PACK,
    createIpcHandler(
      z.object({
        projectId: z.string().uuid(),
        preferNotebookPack: z.boolean(),
      }),
      (request) => {
        const db = getDatabase();
        const project = db.projects.getById(request.projectId);
        if (!project) throw new Error(`Project not found: ${request.projectId}`);
        const merged = mergePreferNotebookPack(
          db.projects.getStyleConfig(request.projectId),
          request.preferNotebookPack,
        );
        db.projects.setStyleConfig(request.projectId, merged);
        return { preferNotebookPack: request.preferNotebookPack };
      },
    ),
  );

  ipcMain.handle(
    IPC_CHANNELS.PROJECT_SET_PRIMARY_PROVIDER,
    createIpcHandler(ProjectSetPrimaryProviderRequestSchema, (request) => {
      const db = getDatabase();
      const project = db.projects.getById(request.projectId);
      if (!project) throw new Error(`Project not found: ${request.projectId}`);
      const merged = mergeProjectPrimaryProvider(
        db.projects.getStyleConfig(request.projectId),
        {
          useGlobalPrimary: request.useGlobalPrimary,
          primaryProviderId: request.primaryProviderId ?? null,
        },
      );
      db.projects.setStyleConfig(request.projectId, merged);
      const style = db.projects.getStyleConfig(request.projectId);
      return ProjectTranslateAiSettingsResponseSchema.parse({
        preferNotebookPack: readPreferNotebookPack(style),
        useGlobalPrimary: projectUsesGlobalPrimary(style),
        primaryProviderId: readProjectPrimaryProviderOverride(style),
        aiPreference: readProjectAiPreferenceOverride(style),
        useGlobalPreference: projectUsesGlobalPrimary(style),
      });
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.PROJECT_SET_AI_PREFERENCE,
    createIpcHandler(ProjectSetAiPreferenceRequestSchema, (request) => {
      const db = getDatabase();
      const project = db.projects.getById(request.projectId);
      if (!project) throw new Error(`Project not found: ${request.projectId}`);
      const merged = mergeProjectAiPreference(
        db.projects.getStyleConfig(request.projectId),
        {
          useGlobalPreference: request.useGlobalPreference,
          aiPreference: request.aiPreference ?? null,
        },
      );
      db.projects.setStyleConfig(request.projectId, merged);
      const style = db.projects.getStyleConfig(request.projectId);
      return ProjectTranslateAiSettingsResponseSchema.parse({
        preferNotebookPack: readPreferNotebookPack(style),
        useGlobalPrimary: projectUsesGlobalPrimary(style),
        primaryProviderId: readProjectPrimaryProviderOverride(style),
        aiPreference: readProjectAiPreferenceOverride(style),
        useGlobalPreference: projectUsesGlobalPrimary(style),
      });
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.IMPORT_SELECT_FILE,
    createIpcHandlerNoArg(async () => {
      const result = await dialog.showOpenDialog({
        title: 'Import novel',
        properties: ['openFile'],
        filters: [
          { name: 'Novels', extensions: ['txt', 'epub', 'docx'] },
          { name: 'Text', extensions: ['txt'] },
          { name: 'EPUB', extensions: ['epub'] },
          { name: 'Word', extensions: ['docx'] },
        ],
      });
      if (result.canceled || result.filePaths.length === 0) {
        return ImportSelectFileResponseSchema.parse({
          canceled: true,
          filePath: null,
        });
      }
      return ImportSelectFileResponseSchema.parse({
        canceled: false,
        filePath: result.filePaths[0],
      });
    }, ImportSelectFileResponseSchema),
  );

  ipcMain.handle(
    IPC_CHANNELS.IMPORT_PREVIEW,
    createIpcHandler(ImportPreviewRequestSchema, async (request) => {
      const preview = await getImportService().createPreview(request.filePath);
      return ImportPreviewResponseSchema.parse({ preview });
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.IMPORT_UPDATE_PREVIEW,
    createIpcHandler(ImportUpdatePreviewRequestSchema, (request) => {
      const service = getImportService();
      if (request.chapterPatches && request.chapterPatches.length > 0) {
        const preview = service.patchPreviewChapters(
          request.previewId,
          request.chapterPatches,
        );
        return ImportPreviewResponseSchema.parse({ preview });
      }
      const preview = service.updatePreview(request.previewId, {
        redetect: request.redetect,
        manualSplits: request.manualSplits,
      });
      return ImportPreviewResponseSchema.parse({ preview });
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.IMPORT_COMMIT,
    createIpcHandler(ImportCommitRequestSchema, (request) => {
      const result = getImportService().commitPreview({
        previewId: request.previewId,
        projectTitle: request.projectTitle,
        projectId: request.projectId,
      });
      logger.info('Import committed', {
        projectId: result.project.id,
        chapters: result.chapterCount,
        paragraphs: result.paragraphCount,
      });
      return ImportCommitResponseSchema.parse({
        project: ProjectDtoSchema.parse(
          toProjectDto(result.project, result.chapterCount),
        ),
        chapterCount: result.chapterCount,
        paragraphCount: result.paragraphCount,
      });
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.IMPORT_DISCARD,
    createIpcHandler(ImportDiscardRequestSchema, (request) => {
      getImportService().discardPreview(request.previewId);
      return ImportDiscardResponseSchema.parse({ ok: true as const });
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.BATCH_IMPORT_SELECT_SOURCE,
    createIpcHandler(BatchImportSelectSourceRequestSchema, async (request) => {
      const result = await getBatchImportPreflightService().selectSource(
        request.preferredKind,
      );
      return BatchImportSelectSourceResponseSchema.parse(result);
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.BATCH_IMPORT_SCAN,
    createIpcHandler(BatchImportScanRequestSchema, async (request) => {
      const preflight = await getBatchImportPreflightService().scan(request);
      return BatchImportScanResponseSchema.parse({ preflight });
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.BATCH_IMPORT_CANCEL,
    createIpcHandler(BatchImportSessionIdRequestSchema.partial(), async (request) => {
      return BatchImportCancelResponseSchema.parse(
        await getBatchImportPreflightService().cancel(request.sessionId),
      );
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.BATCH_IMPORT_DISCARD,
    createIpcHandler(BatchImportSessionIdRequestSchema, async (request) => {
      return BatchImportDiscardResponseSchema.parse(
        await getBatchImportPreflightService().discard(request.sessionId),
      );
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.BATCH_IMPORT_UPDATE_CANDIDATE,
    createIpcHandler(BatchImportUpdateCandidateRequestSchema, (request) => {
      const preflight = getBatchImportPreflightService().updateCandidate(request);
      return BatchImportUpdateCandidateResponseSchema.parse({ preflight });
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.BATCH_IMPORT_LIST_PROJECTS,
    createIpcHandlerNoArg(() => {
      return BatchImportListProjectsResponseSchema.parse({
        projects: getBatchImportPreflightService().listProjectOptions(),
      });
    }, BatchImportListProjectsResponseSchema),
  );

  ipcMain.handle(
    IPC_CHANNELS.BATCH_IMPORT_COMMIT,
    createIpcHandler(BatchImportCommitRequestSchema, async (request) => {
      const session = await getBatchImportCommitService().commitFromPreflight(
        request.sessionId,
      );
      return BatchImportCommitResponseSchema.parse({ session });
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.BATCH_IMPORT_RETRY_CANDIDATE,
    createIpcHandler(BatchImportRetryCandidateRequestSchema, async (request) => {
      const session = await getBatchImportCommitService().retryCandidate(
        request.sessionId,
        request.candidateId,
      );
      return BatchImportRetryCandidateResponseSchema.parse({ session });
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.BATCH_IMPORT_GET_SESSION,
    createIpcHandler(BatchImportSessionIdRequestSchema, (request) => {
      return BatchImportGetSessionResponseSchema.parse({
        session: getBatchImportCommitService().getSession(request.sessionId),
      });
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.BATCH_IMPORT_LIST_SESSIONS,
    createIpcHandlerNoArg(() => {
      const commit = getBatchImportCommitService();
      return BatchImportListSessionsResponseSchema.parse({
        sessions: commit.listSessions(),
        incomplete: commit.listIncompleteSessions(),
      });
    }, BatchImportListSessionsResponseSchema),
  );

  ipcMain.handle(
    IPC_CHANNELS.SOURCE_FOLDER_SELECT_FOLDER,
    createIpcHandlerNoArg(async () => {
      return SourceFolderSelectFolderResponseSchema.parse(
        await getSourceFolderService().selectFolderDialog(),
      );
    }, SourceFolderSelectFolderResponseSchema),
  );

  ipcMain.handle(
    IPC_CHANNELS.SOURCE_FOLDER_SCAN_PREVIEW,
    createIpcHandler(SourceFolderScanPreviewRequestSchema, async (request) => {
      const preview = await getSourceFolderService().createFolderPreview({
        folderPath: request.folderPath,
        expectedStartChapter: request.expectedStartChapter,
        expectedEndChapter: request.expectedEndChapter,
      });
      return { preview: FolderPreviewDtoSchema.parse(preview) };
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.SOURCE_FOLDER_SCAN,
    createIpcHandler(SourceFolderScanRequestSchema, async (request) => {
      const scanResult = await getSourceFolderService().scanProject(request.projectId);
      return { scanResult };
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.SOURCE_FOLDER_DETECT_LANGUAGE,
    createIpcHandler(SourceFolderDetectLanguageRequestSchema, async (request) => {
      const detection = await getSourceFolderService().detectLanguageFromPreview({
        previewId: request.previewId,
        sourceLanguageHint: request.sourceLanguageHint,
        sourceLanguageMode: request.sourceLanguageMode,
      });
      return { detection };
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.SOURCE_FOLDER_IMPORT,
    createIpcHandler(SourceFolderImportRequestSchema, async (request) => {
      if (request.previewId) {
        const result = await getSourceFolderService().commitFolderImport({
          previewId: request.previewId,
          projectTitle: request.projectTitle,
          genre: request.genre,
          description: request.description,
          chineseTitle: request.chineseTitle,
          sourceLanguageHint: request.sourceLanguageHint,
          sourceLanguageMode: request.sourceLanguageMode,
          targetLanguage: request.targetLanguage,
          accountId: request.accountId,
          styleConfig: request.styleConfig,
          expectedStartChapter: request.expectedStartChapter,
          expectedEndChapter: request.expectedEndChapter,
        });
        getSourceWatcherManager().startWatcher(result.project.id);
        return {
          project: ProjectDtoSchema.parse(toProjectDto(result.project, result.chapterCount)),
          chapterCount: result.chapterCount,
          paragraphCount: result.paragraphCount,
          sourceDetection: result.sourceDetection,
        };
      }
      if (!request.projectId || !request.chapterNumbers?.length) {
        throw new Error('projectId and chapterNumbers required for incremental import');
      }
      const imported = await getSourceFolderService().importChaptersFromScan(
        request.projectId,
        request.chapterNumbers,
      );
      const project = getDatabase().projects.getById(request.projectId);
      if (!project) throw new Error('Project not found');
      const chapterCount = getDatabase().chapters.listByProject(request.projectId).length;
      return {
        project: ProjectDtoSchema.parse(toProjectDto(project, chapterCount)),
        chapterCount: imported.imported,
        paragraphCount: imported.paragraphCount,
      };
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.SOURCE_FOLDER_GET_STATUS,
    createIpcHandler(ProjectIdRequestSchema, (request) => {
      return SourceFolderStatusSchema.parse(getSourceFolderService().getStatus(request.projectId));
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.SOURCE_FOLDER_UPDATE_SETTINGS,
    createIpcHandler(SourceFolderUpdateSettingsRequestSchema, (request) => {
      const settings = getSourceFolderService().updateSettings(request.projectId, request);
      if (request.watchFolderEnabled !== undefined) {
        if (request.watchFolderEnabled) {
          getSourceWatcherManager().startWatcher(request.projectId);
        } else {
          getSourceWatcherManager().stopWatcher(request.projectId);
        }
      }
      return { settings };
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.SOURCE_FOLDER_CHANGE_FOLDER,
    createIpcHandler(SourceFolderChangeFolderRequestSchema, async (request) => {
      const result = await getSourceFolderService().changeSourceFolder(
        request.projectId,
        request.newFolderPath,
        request.confirm ?? false,
      );
      if (result.applied) {
        getSourceWatcherManager().restartWatcher(request.projectId);
      }
      return result;
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.SOURCE_FOLDER_RESOLVE_CONFLICT,
    createIpcHandler(SourceFolderResolveConflictRequestSchema, async (request) => {
      await getSourceFolderService().resolveConflict(
        request.projectId,
        request.chapterNumber,
        request.chosenFilePath,
      );
      return { ok: true as const };
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.SOURCE_FOLDER_MARK_RETRANSLATE,
    createIpcHandler(SourceFolderMarkRetranslateRequestSchema, (request) => {
      getSourceFolderService().markRetranslate(request.projectId, request.chapterId);
      return { ok: true as const };
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.SOURCE_FOLDER_GET_DIFF,
    createIpcHandler(SourceFolderGetDiffRequestSchema, async (request) => {
      const diff = await getSourceFolderService().getSourceDiff(
        request.projectId,
        request.chapterId,
      );
      return SourceFolderGetDiffResponseSchema.parse(diff);
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.SOURCE_FOLDER_OPEN_FOLDER,
    createIpcHandler(ProjectIdRequestSchema, async (request) => {
      const project = getDatabase().projects.getById(request.projectId);
      if (!project?.source_folder_path) {
        throw new Error('Project has no source folder');
      }
      await shell.openPath(project.source_folder_path);
      return { ok: true as const };
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.SOURCE_FOLDER_CANCEL_SCAN,
    createIpcHandler(SourceFolderScanRequestSchema, (request) => {
      getSourceFolderService().cancelScan(request.projectId);
      return { ok: true as const };
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.BOOK_METADATA_GET,
    createIpcHandler(BookMetadataGetRequestSchema, (request) => {
      const project = getDatabase().projects.getById(request.projectId);
      if (!project) throw new Error('Project not found');
      const metadata = projectRowToMetadataDto(project);
      if (!metadata) throw new Error('Project not found');
      return { metadata: ProjectMetadataDtoSchema.parse(metadata) };
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.BOOK_METADATA_UPDATE,
    createIpcHandler(BookMetadataUpdateRequestSchema, (request) => {
      const metadata = updateMetadataFromUserEdit(request.projectId, request.metadata);
      if (!metadata) throw new Error('Project not found');
      return { metadata: ProjectMetadataDtoSchema.parse(metadata) };
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.BOOK_METADATA_LIST_DOCUMENTS,
    createIpcHandler(BookMetadataListDocumentsRequestSchema, (request) => {
      const docs = getDatabase().projectDocuments.listByProject(request.projectId);
      return {
        documents: docs.map((doc) => ({
          id: doc.id,
          documentType: doc.document_type,
          title: doc.title,
          sourceFileName: doc.source_file_name,
          sourceFilePath: doc.source_file_path,
          status: doc.status,
          updatedAt: doc.updated_at,
        })),
      };
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.BOOK_METADATA_SYNC_PROFILE,
    createIpcHandler(BookMetadataGetRequestSchema, async (request) => {
      await getNotebookSyncService().syncLocalKnowledge(request.projectId);
      getDatabase().projects.updateMetadata(request.projectId, { book_profile_dirty: false });
      return { ok: true as const };
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.TERM_SEARCH,
    createIpcHandler(TermSearchRequestSchema, (request) => {
      const terms = getTermService().search({
        chinese: request.chinese,
        vietnamese: request.vietnamese,
        pinyin: request.pinyin,
        termType: request.type,
        scope: request.scope,
        scopeRef: request.scopeRef,
        status: request.status,
        genre: request.genre,
        projectId: request.projectId,
        limit: request.limit,
        offset: request.offset,
      });
      return TermListResponseSchema.parse({ terms });
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.TERM_COUNT_BY_PROJECT,
    createIpcHandler(ProjectIdRequestSchema, (request) => {
      const count = getTermService().countByProject(request.projectId);
      return TermCountByProjectResponseSchema.parse({ count });
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.TERM_REVIEW_QUEUE,
    createIpcHandlerNoArg(() => {
      const terms = getTermService().listReviewQueue();
      return TermListResponseSchema.parse({ terms });
    }, TermListResponseSchema),
  );

  ipcMain.handle(
    IPC_CHANNELS.TERM_GET,
    createIpcHandler(TermGetRequestSchema, (request) => {
      const term = getTermService().get(request.termId);
      if (!term) throw new Error(`Term not found: ${request.termId}`);
      return TermGetResponseSchema.parse({ term });
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.TERM_UPSERT,
    createIpcHandler(TermUpsertRequestSchema, (request) => {
      const term = getTermService().upsert({
        id: request.id,
        sourceText: request.sourceText,
        simplified: request.simplified,
        traditional: request.traditional,
        pinyin: request.pinyin,
        preferredTranslation: request.preferredTranslation,
        alternativeTranslations: request.alternativeTranslations,
        type: request.type,
        meaning: request.meaning,
        scope: request.scope,
        scopeRef: request.scopeRef,
        genre: request.genre,
        confidence: request.confidence,
        status: request.status,
        notes: request.notes,
        locked: request.locked,
      });
      return TermGetResponseSchema.parse({ term });
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.TERM_REVIEW,
    createIpcHandler(TermReviewActionRequestSchema, (request) => {
      const result = getTermService().reviewAction({
        action: request.action,
        termIds: request.termIds,
        patch: request.patch
          ? {
              sourceText: request.patch.sourceText,
              simplified: request.patch.simplified,
              traditional: request.patch.traditional,
              pinyin: request.patch.pinyin,
              preferredTranslation: request.patch.preferredTranslation,
              alternativeTranslations: request.patch.alternativeTranslations,
              type: request.patch.type,
              meaning: request.patch.meaning,
              scope: request.patch.scope,
              scopeRef: request.patch.scopeRef,
              genre: request.patch.genre,
              confidence: request.patch.confidence,
              status: request.patch.status,
              notes: request.patch.notes,
              locked: request.patch.locked,
            }
          : undefined,
        mergeIntoTermId: request.mergeIntoTermId,
        targetScope: request.targetScope,
        scopeRef: request.scopeRef,
      });
      return TermBulkResponseSchema.parse(result);
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.TERM_MATCH_CHAPTER,
    createIpcHandler(TermMatchChapterRequestSchema, (request) => {
      const matches = getTermService().matchChapter(request.projectId, request.chapterId);
      return TermMatchChapterResponseSchema.parse({ matches });
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.TERM_EXTRACT_CANDIDATES,
    createIpcHandler(TermExtractCandidatesRequestSchema, (request) => {
      const candidates = getTermService().extractCandidates(
        request.projectId,
        request.chapterId,
      );
      return TermCandidateListResponseSchema.parse({ candidates });
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.TERM_LIST_CANDIDATES,
    createIpcHandler(TermCandidateListRequestSchema, (request) => {
      const candidates = getTermService().listCandidates(
        request.projectId,
        request.limit,
      );
      return TermCandidateListResponseSchema.parse({ candidates });
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.TERM_CANDIDATE_REVIEW,
    createIpcHandler(TermCandidateReviewRequestSchema, (request) => {
      const result = getTermService().reviewCandidates({
        candidateIds: request.candidateIds,
        action: request.action,
        patch: request.patch
          ? {
              sourceText: request.patch.sourceText,
              preferredTranslation: request.patch.preferredTranslation,
              type: request.patch.type,
              scope: request.patch.scope,
              scopeRef: request.patch.scopeRef,
            }
          : undefined,
      });
      return TermBulkResponseSchema.parse(result);
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.TERM_IMPORT,
    createIpcHandler(TermImportRequestSchema, (request) => {
      const result = getTermService().importTerms({
        format: request.format,
        content: request.content,
        scope: request.scope ?? 'GLOBAL',
        scopeRef: request.scopeRef,
      });
      return TermListResponseSchema.parse({ terms: result.terms });
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.TERM_EXPORT,
    createIpcHandler(TermExportRequestSchema, (request) => {
      assertKhepreeProductAccess(KHEPREE_FEATURES.export);
      const result = getTermService().exportTerms({
        format: request.format,
        filters: request.filters,
      });
      return TermExportResponseSchema.parse(result);
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.CHARACTER_LIST,
    createIpcHandler(CharacterListRequestSchema, (request) => {
      const characters = getMemoryService().listCharacters(
        request.projectId,
        request.editionId,
      );
      return CharacterListResponseSchema.parse({ characters });
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.CHARACTER_UPSERT,
    createIpcHandler(CharacterUpsertRequestSchema, (request) => {
      const character = getMemoryService().upsertCharacter(request);
      return CharacterUpsertResponseSchema.parse({ character });
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.RELATIONSHIP_LIST,
    createIpcHandler(RelationshipListRequestSchema, (request) => {
      const relationships = getMemoryService().listRelationships(
        request.projectId,
        request.atChapter,
        request.editionId,
      );
      return RelationshipListResponseSchema.parse({ relationships });
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.RELATIONSHIP_UPSERT,
    createIpcHandler(RelationshipUpsertRequestSchema, (request) => {
      const relationship = getMemoryService().upsertRelationship(request);
      return { relationship };
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.MEMORY_STORY_STATE_GET,
    createIpcHandler(StoryStateGetRequestSchema, (request) => {
      const storyState = getMemoryService().getStoryState(request.projectId);
      return { storyState: StoryStateDtoSchema.parse(storyState) };
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.MEMORY_STORY_STATE_PATCH,
    createIpcHandler(StoryStatePatchRequestSchema, (request) => {
      const storyState = getMemoryService().patchStoryState(request);
      return { storyState: StoryStateDtoSchema.parse(storyState) };
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.MEMORY_APPLY_DELTA,
    createIpcHandler(MemoryApplyDeltaRequestSchema, (request) => {
      const result = getMemoryService().applyDelta(
        request.projectId,
        request.delta,
        request.chapterNumber,
        request.editionId,
      );
      return MemoryApplyDeltaResponseSchema.parse(result);
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.MEMORY_CONFLICT_LIST,
    createIpcHandler(MemoryConflictListRequestSchema, (request) => {
      const conflicts = getMemoryService().listConflicts(request.projectId);
      return { conflicts };
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.MEMORY_CONFLICT_RESOLVE,
    createIpcHandler(MemoryConflictResolveRequestSchema, (request) => {
      const conflict = getMemoryService().resolveConflict(
        request.conflictId,
        request.status,
      );
      return { conflict: MemoryConflictDtoSchema.parse(conflict) };
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.MEMORY_BUILD_CONTEXT,
    createIpcHandler(MemoryBuildContextRequestSchema, (request) => {
      const context = getMemoryService().buildContext(request);
      return MemoryBuildContextResponseSchema.parse({ context });
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.PACK_LIST_CHAPTERS,
    createIpcHandler(ListChaptersRequestSchema, (request) => {
      const chapters = getTranslationPackService().listChapters(request.projectId);
      return ListChaptersResponseSchema.parse({ chapters });
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.PACK_BUILD,
    createIpcHandler(BuildTranslationPackRequestSchema, (request) => {
      assertKhepreeProductAccess(KHEPREE_FEATURES.translation);
      const pack = getTranslationPackService().build(request);
      return BuildTranslationPackResponseSchema.parse({ pack });
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.NOTEBOOK_LIST,
    createIpcHandler(NotebookListRequestSchema, (request) => {
      const mappings = getNotebookService().listMappings(request.projectId);
      return NotebookListResponseSchema.parse({ mappings });
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.NOTEBOOK_GET,
    createIpcHandler(NotebookGetRequestSchema, (request) => {
      const mapping = getNotebookService().getMapping(
        request.projectId,
        request.accountId,
        request.role,
      );
      return NotebookGetResponseSchema.parse({ mapping });
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.NOTEBOOK_PROVISION,
    createIpcHandler(NotebookProvisionRequestSchema, async (request) => {
      const result = await getNotebookService().provision(request);
      return NotebookProvisionResponseSchema.parse(result);
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.NOTEBOOK_RESUME,
    createIpcHandler(NotebookResumeRequestSchema, async (request) => {
      const result = await getNotebookService().resumeAssisted(request);
      return NotebookProvisionResponseSchema.parse(result);
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.NOTEBOOK_HEALTH,
    createIpcHandler(NotebookHealthRequestSchema, (request) => {
      if (request.dual) {
        return NotebookDualHealthDtoSchema.parse(
          getNotebookSyncService().getDualHealth(
            request.projectId,
            request.accountId,
          ),
        );
      }
      const health = getNotebookSyncService().getHealth(
        request.projectId,
        request.accountId,
        request.role ?? 'TRANSLATION',
      );
      return NotebookHealthDtoSchema.parse(health);
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.NOTEBOOK_SYNC_NOW,
    createIpcHandler(NotebookSyncNowRequestSchema, async (request) => {
      const sync = getNotebookSyncService();
      await sync.syncLocalKnowledge(request.projectId);
      const accountId =
        request.accountId ??
        new ProjectWorkerResolver(getDatabase()).resolve({
          projectId: request.projectId,
          purpose: 'notebook',
        }).accountId;
      if (accountId) {
        sync.scheduleBackgroundVersionProbe(request.projectId, accountId);
      }
      const health = sync.getHealth(request.projectId, accountId);
      return NotebookHealthDtoSchema.parse(health);
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.NOTEBOOK_REBUILD,
    createIpcHandler(NotebookRebuildRequestSchema, (request) => {
      getNotebookSyncService().rebuildKnowledge(request.projectId);
      const accountId = new ProjectWorkerResolver(getDatabase()).resolve({
        projectId: request.projectId,
        purpose: 'notebook',
      }).accountId;
      const health = getNotebookSyncService().getHealth(
        request.projectId,
        accountId,
      );
      return NotebookHealthDtoSchema.parse(health);
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.NOTEBOOK_BOOTSTRAP,
    createIpcHandler(NotebookBootstrapRequestSchema, (request) => {
      const result = new NotebookBootstrapService(getDatabase()).bootstrap(
        request.projectId,
        { seed: request.seed },
      );
      return NotebookBootstrapResponseSchema.parse(result);
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.NOTEBOOK_PREPARE_FOR_TRANSLATE,
    createIpcHandler(NotebookPrepareForTranslateRequestSchema, async (request) => {
      assertKhepreeProductAccess(KHEPREE_FEATURES.translation);
      const result = await new NotebookBootstrapService(getDatabase()).prepareForTranslate(
        request.projectId,
        { accountId: request.accountId },
      );
      return NotebookPrepareForTranslateResponseSchema.parse(result);
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.TRANSLATE_ENSURE_READY,
    createIpcHandler(TranslateEnsureReadyRequestSchema, async (request) => {
      assertKhepreeProductAccess(KHEPREE_FEATURES.translation);
      const result = await new TranslateReadinessService(getDatabase()).ensureForTranslate(
        request.projectId,
        request.accountId,
      );
      return TranslateEnsureReadyResponseSchema.parse(result);
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.NOTEBOOK_RUN_BOOTSTRAP_ANALYSIS,
    createIpcHandler(NotebookRunBootstrapAnalysisRequestSchema, async (request) => {
      assertKhepreeProductAccess(KHEPREE_FEATURES.translation);
      const service = new BootstrapAnalysisService(getDatabase());
      const result = await service.run(
        request.projectId,
        {
          sendPrompt: (pack, options) =>
            getAiProviderService().manager.sendWithFallback(pack, options),
          googleAccountId: request.googleAccountId,
        },
        { mode: request.mode, rebootstrap: request.rebootstrap },
      );
      return NotebookBootstrapAnalysisResponseSchema.parse(result);
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.NOTEBOOK_SKIP_BOOTSTRAP,
    createIpcHandler(NotebookSkipBootstrapRequestSchema, (request) => {
      const result = new BootstrapAnalysisService(getDatabase()).skip(request.projectId);
      return NotebookBootstrapAnalysisResponseSchema.parse(result);
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.NOTEBOOK_GET_BOOTSTRAP_STATUS,
    createIpcHandler(NotebookBootstrapStatusRequestSchema, async (request) => {
      const db = getDatabase();
      const project = db.projects.getById(request.projectId);
      if (!project) throw new Error(`Project not found: ${request.projectId}`);
      const { projectHasLegacyDriveArtifacts } = await import('../knowledge/legacy-drive-notice');
      return NotebookBootstrapStatusResponseSchema.parse({
        status: project.bootstrap_status,
        throughChapter: project.bootstrap_through_chapter ?? null,
        version: project.bootstrap_version,
        chapterCount: project.bootstrap_chapter_count,
        startedAt: project.bootstrap_started_at ?? null,
        completedAt: project.bootstrap_completed_at ?? null,
        characterCount: db.characters.listByProject(request.projectId).length,
        relationshipCount: db.relationships.listByProject(request.projectId).length,
        termCandidateCount: db.termCandidates.listPending(request.projectId).length,
        hasLegacyDriveConfig: projectHasLegacyDriveArtifacts(db, request.projectId),
      });
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.NOTEBOOK_RESEARCH_QUERY,
    createIpcHandler(NotebookResearchQueryRequestSchema, async (request) => {
      const { getNotebookService } = await import('../services/notebook-service-singleton');
      const result = await getNotebookService().researchQuery({
        projectId: request.projectId,
        accountId: request.accountId,
        question: request.question,
      });
      return NotebookResearchQueryResponseSchema.parse(result);
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.NOTEBOOK_OPEN_RESEARCH,
    createIpcHandler(NotebookOpenResearchRequestSchema, async (request) => {
      const { getNotebookService } = await import('../services/notebook-service-singleton');
      const result = await getNotebookService().openResearch({
        projectId: request.projectId,
        accountId: request.accountId,
      });
      return NotebookOpenResearchResponseSchema.parse(result);
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.BOOTSTRAP_PACK_NOVEL_CORPUS,
    createIpcHandler(PackNovelCorpusRequestSchema, (request) => {
      const result = new FullNovelPreprocessService(getDatabase()).packCorpus(
        request.projectId,
        request.outputDir,
      );
      return PackNovelCorpusResponseSchema.parse(result);
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.BOOTSTRAP_GET_PREPROCESS_PROMPT,
    createIpcHandler(GetPreprocessPromptRequestSchema, (request) => {
      const result = new FullNovelPreprocessService(getDatabase()).getPrompt(
        request.projectId,
        request.partFileNames,
      );
      return GetPreprocessPromptResponseSchema.parse(result);
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.BOOTSTRAP_IMPORT_PREPROCESS_RESULT,
    createIpcHandler(ImportPreprocessResultRequestSchema, (request) => {
      const result = new FullNovelPreprocessService(getDatabase()).importResult(
        request.projectId,
        {
          text: request.text,
          filePath: request.filePath,
          syncLocalKnowledge: request.syncLocalKnowledge,
        },
      );
      return ImportPreprocessResultResponseSchema.parse(result);
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.BOOTSTRAP_SELECT_RESULT_PATH,
    createIpcHandlerNoArg(async () => {
      const result = await dialog.showOpenDialog({
        properties: ['openFile'],
        filters: [
          { name: 'Markdown / text', extensions: ['md', 'txt', 'markdown'] },
          { name: 'All', extensions: ['*'] },
        ],
      });
      return SelectBackupPathResponseSchema.parse({
        canceled: result.canceled,
        filePath: result.filePaths[0] ?? null,
      });
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.BOOTSTRAP_RUN_AUTO_PREPROCESS,
    createIpcHandler(RunAutoPreprocessRequestSchema, async (request) => {
      const result = await new FullNovelPreprocessAutoService(getDatabase()).run(
        request.projectId,
        {
          forceFull: request.forceFull,
          googleAccountId: request.googleAccountId,
        },
      );
      return RunAutoPreprocessResponseSchema.parse(result);
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.BOOTSTRAP_GET_AUTO_PREPROCESS_PROGRESS,
    createIpcHandler(GetAutoPreprocessProgressRequestSchema, (request) => {
      const p = getAutoPreprocessProgress(request.projectId);
      return GetAutoPreprocessProgressResponseSchema.parse({
        projectId: request.projectId,
        step: p?.step ?? null,
        message: p?.message ?? null,
        mode: p?.mode ?? null,
        updatedAt: p?.updatedAt ?? null,
      });
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.BOOTSTRAP_RESET_AI_MEMORY,
    createIpcHandler(ResetAiMemoryRequestSchema, async (request) => {
      const wipe = new AiMemoryResetService(getDatabase()).reset(request.projectId);
      let init: Awaited<
        ReturnType<FullNovelPreprocessAutoService['run']>
      > | null = null;
      if (request.runInitAfter !== false) {
        init = await new FullNovelPreprocessAutoService(getDatabase()).run(
          request.projectId,
          {
            forceFull: request.forceFull,
            googleAccountId: request.googleAccountId,
          },
        );
      }
      return ResetAiMemoryResponseSchema.parse({
        ...wipe,
        init,
      });
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.GEMINI_SEND,
    createIpcHandler(GeminiSendRequestSchema, async (request) => {
      const result = await getGeminiService().sendTranslation(request);
      return GeminiSendResponseSchema.parse(result);
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.JOB_LIST,
    createIpcHandler(JobListRequestSchema, (request) => {
      if (request.limit != null || request.offset != null || request.states) {
        const page = getJobService().listPage({
          projectId: request.projectId,
          states: request.states,
          limit: request.limit,
          offset: request.offset,
        });
        return JobListResponseSchema.parse(page);
      }
      const jobs = getJobService().list(request.projectId);
      return JobListResponseSchema.parse({ jobs });
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.JOB_GET,
    createIpcHandler(JobGetRequestSchema, (request) => {
      const result = getJobService().get(request.jobId);
      return JobGetResponseSchema.parse(result);
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.JOB_RECOVER,
    createIpcHandler(JobRecoverRequestSchema, (request) => {
      const result = getJobService().recover(request.jobId);
      return JobRecoverResponseSchema.parse(result);
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.JOB_ATTENTION,
    createIpcHandler(JobAttentionActionRequestSchema, async (request) => {
      const detail = getJobService().get(request.jobId);
      const config = detail.job;
      const sender: RepairSender | undefined =
        request.action === 'retry'
          ? async (sendReq) => {
              const jobRow = getDatabase().jobs.getById(request.jobId);
              if (!jobRow) {
                throw new Error(`Job not found: ${request.jobId}`);
              }
              const accountId = resolveJobRetryAccountId(jobRow);
              if (!accountId) {
                throw new Error(
                  'Cannot retry: no Google account on this job (pin an account or assign a worker)',
                );
              }
              const prompt = sendReq.plan?.prompt ?? '';
              const pack = buildMinimalRepairPack(config.projectId, prompt);
              const sent = await getGeminiService().sendTranslation({
                projectId: config.projectId,
                accountId,
                pack,
                jobId: request.jobId,
              });
              if (sent.status !== 'completed') {
                throw new Error(sent.errorMessage ?? 'Gemini repair send failed');
              }
              return {
                rawResponse: sent.rawResponse,
                inputRef: `corr:${sent.correlationId}`,
              };
            }
          : undefined;

      const result = await getJobService().applyAttentionAction(
        request.jobId,
        request.action,
        request.note,
        sender,
      );
      return JobAttentionActionResponseSchema.parse({
        job: result.job,
        message: result.message,
      });
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.JOB_ENQUEUE,
    createIpcHandler(JobEnqueueRequestSchema, (request) => {
      assertKhepreeProductAccess(KHEPREE_FEATURES.translation);
      const result = getJobService().enqueueTranslate(request);
      return JobEnqueueResponseSchema.parse({
        job: result.job,
        jobs: result.jobs,
      });
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.JOB_ENQUEUE_NOVEL,
    createIpcHandler(JobEnqueueNovelRequestSchema, (request) => {
      assertKhepreeProductAccess(KHEPREE_FEATURES.translation);
      const result = getJobService().enqueueTranslateNovel(request);
      return JobEnqueueNovelResponseSchema.parse(result);
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.JOB_CANCEL,
    createIpcHandler(JobControlRequestSchema, (request) => {
      const job = getJobService().cancelJob(request.jobId);
      return JobControlResponseSchema.parse({ job, message: 'Job cancelled' });
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.JOB_RETRY,
    createIpcHandler(JobControlRequestSchema, (request) => {
      const job = getJobService().retryFailed(request.jobId);
      return JobControlResponseSchema.parse({ job, message: 'Job requeued' });
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.JOB_BULK,
    createIpcHandler(JobBulkRequestSchema, (request) => {
      const result = getJobService().bulkJobs(request.jobIds, request.action);
      return JobBulkResponseSchema.parse(result);
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.JOB_MOVE,
    createIpcHandler(JobMoveRequestSchema, (request) => {
      const job = getJobService().moveJob(request.jobId, request.priority);
      return JobControlResponseSchema.parse({ job, message: 'Priority updated' });
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.JOB_CHANGE_WORKER,
    createIpcHandler(JobChangeWorkerRequestSchema, (request) => {
      const job = getJobService().changeWorker(
        request.jobId,
        request.workerMode,
        request.pinnedAccountId,
      );
      return JobControlResponseSchema.parse({ job, message: 'Worker assignment updated' });
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.JOB_PAUSE_ALL,
    createIpcHandlerNoArg(() => {
      const result = getJobService().pauseAll();
      return JobControlResponseSchema.parse({
        job: null,
        message: 'Paused all queued jobs',
        affected: result.affected,
      });
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.JOB_RESUME_ALL,
    createIpcHandlerNoArg(() => {
      const result = getJobService().resumeAll();
      return JobControlResponseSchema.parse({
        job: null,
        message: 'Resumed paused jobs',
        affected: result.affected,
      });
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.JOB_SCHEDULER_STATUS,
    createIpcHandlerNoArg(() => {
      return SchedulerStatusResponseSchema.parse(getJobService().schedulerStatus());
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.JOB_SCHEDULER_UPDATE_SETTINGS,
    createIpcHandler(SchedulerSettingsUpdateSchema, (request) => {
      return SchedulerStatusResponseSchema.parse(
        getJobService().updateSchedulerSettings(request),
      );
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.JOB_WORKERS,
    createIpcHandlerNoArg(() => {
      return WorkerListResponseSchema.parse({ workers: getJobService().listWorkers() });
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.LEARNING_DASHBOARD,
    createIpcHandler(LearningDashboardRequestSchema, (request) => {
      const dashboard = getLearningService().getDashboard(request.projectId);
      return LearningDashboardResponseSchema.parse(dashboard);
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.EDITOR_GET_CHAPTER,
    createIpcHandler(EditorGetChapterRequestSchema, (request) => {
      const chapter = getTranslationEditorService().getChapter(
        request.projectId,
        request.chapterId,
      );
      return EditorGetChapterResponseSchema.parse(chapter);
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.EDITOR_SAVE_PARAGRAPH,
    createIpcHandler(EditorSaveParagraphRequestSchema, (request) => {
      const result = getTranslationEditorService().saveHumanParagraph(
        request.projectId,
        request.chapterId,
        request.stableParagraphId,
        request.translatedText,
      );
      return EditorSaveParagraphResponseSchema.parse(result);
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.EDITOR_LIST_VERSIONS,
    createIpcHandler(EditorListVersionsRequestSchema, (request) => {
      const versions = getTranslationEditorService().listVersions(request.translationId);
      return EditorListVersionsResponseSchema.parse({ versions });
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.EDITOR_REVERT_VERSION,
    createIpcHandler(EditorRevertVersionRequestSchema, (request) => {
      const paragraph = getTranslationEditorService().revertVersion(
        request.projectId,
        request.chapterId,
        request.translationId,
        request.version,
      );
      return EditorRevertVersionResponseSchema.parse({ paragraph });
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.EDITOR_GET_CONTEXT,
    createIpcHandler(EditorContextRequestSchema, (request) => {
      const context = getTranslationEditorService().getContext(
        request.projectId,
        request.chapterNumber,
      );
      return EditorContextResponseSchema.parse(context);
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.EDITOR_CLEAR_CHAPTER_TRANSLATIONS,
    createIpcHandler(EditorClearChapterTranslationsRequestSchema, (request) => {
      const result = getTranslationEditorService().clearChapterTranslations(
        request.projectId,
        request.chapterId,
      );
      return EditorClearChapterTranslationsResponseSchema.parse(result);
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.EDITOR_CLEAR_CHAPTERS_TRANSLATIONS,
    createIpcHandler(EditorClearChaptersTranslationsRequestSchema, (request) => {
      const result = getTranslationEditorService().clearChaptersTranslations(
        request.projectId,
        request.chapterIds,
      );
      return EditorClearChaptersTranslationsResponseSchema.parse(result);
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.EDITOR_RETRANSLATE_CHAPTER,
    createIpcHandler(EditorRetranslateChapterRequestSchema, (request) => {
      const result = getTranslationEditorService().retranslateChapter(
        request.projectId,
        request.chapterId,
        (input) => getJobService().enqueueTranslate(input),
      );
      return EditorRetranslateChapterResponseSchema.parse(result);
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.EDITOR_RETRANSLATE_CHAPTERS,
    createIpcHandler(EditorRetranslateChaptersRequestSchema, (request) => {
      const result = getTranslationEditorService().retranslateChapters(
        request.projectId,
        request.chapterIds,
        (input) => getJobService().enqueueTranslate(input),
      );
      return EditorRetranslateChaptersResponseSchema.parse(result);
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.PORTABILITY_EXPORT_NOVEL,
    createIpcHandler(NovelExportRequestSchema, async (request) => {
      assertKhepreeProductAccess(KHEPREE_FEATURES.export);
      const result = await getPortabilityService().exportNovel(request);
      return NovelExportResponseSchema.parse(result);
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.PORTABILITY_SELECT_EXPORT_PATH,
    createIpcHandler(SelectExportPathRequestSchema, async (request) => {
      const ext = request.format;
      let defaultPath = request.defaultName;
      if (request.projectId) {
        const resolved = getPortabilityService().resolveExportDirectory({
          projectId: request.projectId,
          editionId: request.editionId,
        });
        if (resolved.status === 'ok') {
          defaultPath = path.join(resolved.directory, request.defaultName);
        }
      }
      const result = await dialog.showSaveDialog({
        defaultPath,
        filters: [{ name: ext.toUpperCase(), extensions: [ext] }],
      });
      return SelectExportPathResponseSchema.parse({
        canceled: result.canceled,
        filePath: result.filePath ? result.filePath : null,
      });
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.PORTABILITY_CREATE_BACKUP,
    createIpcHandler(CreateBackupRequestSchema, async (request) => {
      const result = await getPortabilityService().createBackup(request);
      return CreateBackupResponseSchema.parse(result);
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.PORTABILITY_PREVIEW_RESTORE,
    createIpcHandler(PreviewRestoreRequestSchema, async (request) => {
      const preview = await getPortabilityService().previewRestore(request.archivePath);
      return PreviewRestoreResponseSchema.parse(preview);
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.PORTABILITY_RESTORE_BACKUP,
    createIpcHandler(RestoreBackupRequestSchema, async (request) => {
      const result = await getPortabilityService().restoreBackup(request);
      return RestoreBackupResponseSchema.parse(result);
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.PORTABILITY_GET_AUTO_BACKUP,
    createIpcHandlerNoArg(() => {
      return AutoBackupConfigSchema.parse(getPortabilityService().getAutoBackupConfig());
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.PORTABILITY_SET_AUTO_BACKUP,
    createIpcHandler(SetAutoBackupConfigRequestSchema, (request) => {
      return AutoBackupConfigSchema.parse(getPortabilityService().setAutoBackupConfig(request));
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.PORTABILITY_LIST_BACKUPS,
    createIpcHandlerNoArg(() => {
      return ListBackupsResponseSchema.parse(getPortabilityService().listBackups());
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.PORTABILITY_CREATE_MANUAL_BACKUP,
    createIpcHandlerNoArg(() => {
      return { filePath: getPortabilityService().createManualBackup().filePath };
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.PORTABILITY_SELECT_BACKUP_PATH,
    createIpcHandlerNoArg(async () => {
      const result = await dialog.showOpenDialog({
        properties: ['openFile'],
        filters: [
          { name: 'Khepree Novel AI backup', extensions: ['nts-backup', 'nts-project', 'zip'] },
          { name: 'ZIP', extensions: ['zip'] },
        ],
      });
      return SelectBackupPathResponseSchema.parse({
        canceled: result.canceled,
        filePath: result.filePaths[0] ?? null,
      });
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.PORTABILITY_GET_BACKUP_DIRECTORY,
    createIpcHandlerNoArg(() => {
      return BackupDirectorySchema.parse(getPortabilityService().getBackupDirectory());
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.PORTABILITY_SET_BACKUP_DIRECTORY,
    createIpcHandler(SetBackupDirectoryRequestSchema, (request) => {
      return BackupDirectorySchema.parse(
        getPortabilityService().setBackupDirectory(request.directory),
      );
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.PORTABILITY_SELECT_BACKUP_DIRECTORY,
    createIpcHandlerNoArg(async () => {
      const result = await dialog.showOpenDialog({
        properties: ['openDirectory', 'createDirectory'],
      });
      return SelectBackupDirectoryResponseSchema.parse({
        canceled: result.canceled,
        directory: result.filePaths[0] ?? null,
      });
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.PORTABILITY_RESOLVE_EXPORT_DIRECTORY,
    createIpcHandler(ResolveExportDirectoryRequestSchema, (request) => {
      return ResolveExportDirectoryResponseSchema.parse(
        getPortabilityService().resolveExportDirectory(request),
      );
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.PORTABILITY_GET_DEFAULT_EXPORT_DIRECTORY,
    createIpcHandlerNoArg(() => {
      return DefaultExportDirectorySchema.parse(getPortabilityService().getDefaultExportDirectory());
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.PORTABILITY_SET_DEFAULT_EXPORT_DIRECTORY,
    createIpcHandler(SetDefaultExportDirectoryRequestSchema, (request) => {
      return DefaultExportDirectorySchema.parse(
        getPortabilityService().setDefaultExportDirectory(request.directory),
      );
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.PORTABILITY_SELECT_EXPORT_DIRECTORY,
    createIpcHandlerNoArg(async () => {
      const result = await dialog.showOpenDialog({
        properties: ['openDirectory', 'createDirectory'],
      });
      return SelectExportDirectoryResponseSchema.parse({
        canceled: result.canceled,
        directory: result.filePaths[0] ?? null,
      });
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.PORTABILITY_GET_PROJECT_EXPORT_SETTINGS,
    createIpcHandler(ResolveExportDirectoryRequestSchema.pick({ projectId: true }), (request) => {
      return ProjectExportSettingsSchema.parse(
        getPortabilityService().getProjectExportSettings(request.projectId),
      );
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.PORTABILITY_SET_PROJECT_EXPORT_DIRECTORY,
    createIpcHandler(SetProjectExportDirectoryRequestSchema, (request) => {
      return ProjectExportSettingsSchema.parse(
        getPortabilityService().setProjectExportDirectory(request.projectId, request.directory),
      );
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.PORTABILITY_PERSIST_EXPORT_DIRECTORY,
    createIpcHandler(PersistExportDirectoryRequestSchema, (request) => {
      return ResolveExportDirectoryResponseSchema.parse(
        getPortabilityService().persistExportDirectory(request),
      );
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.PORTABILITY_OPEN_DEFAULT_EXPORT_DIRECTORY,
    createIpcHandlerNoArg(async () => {
      const { directory } = getPortabilityService().openDefaultExportDirectory();
      const result = await shell.openPath(directory);
      if (result) {
        throw new Error(result);
      }
      return OpenExportDirectoryResponseSchema.parse({ directory });
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.PORTABILITY_OPEN_EXPORT_DIRECTORY,
    createIpcHandler(OpenExportDirectoryRequestSchema, async (request) => {
      const { directory } = getPortabilityService().openExportDirectory(request);
      const result = await shell.openPath(directory);
      if (result) {
        throw new Error(result);
      }
      return OpenExportDirectoryResponseSchema.parse({ directory });
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.PORTABILITY_OPEN_EXPORTED_FILE,
    createIpcHandler(OpenExportedFileRequestSchema, async (request) => {
      const { filePath } = getPortabilityService().openExportedFile(request);
      const result = await shell.openPath(filePath);
      if (result) {
        throw new Error(result);
      }
      return OpenExportedFileResponseSchema.parse({ filePath });
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.PORTABILITY_EXPORT_CHAPTER,
    createIpcHandler(ExportChapterRequestSchema, async (request) => {
      assertKhepreeProductAccess(KHEPREE_FEATURES.export);
      const result = await getPortabilityService().exportChapterToDirectory(request);
      return ExportChapterResponseSchema.parse(result);
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.PORTABILITY_EXPORT_CHAPTER_RANGE,
    createIpcHandler(ExportChapterRangeRequestSchema, async (request) => {
      assertKhepreeProductAccess(KHEPREE_FEATURES.export);
      const result = await getPortabilityService().exportChapterRangeToDirectory(request);
      return ExportChapterResponseSchema.parse(result);
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.PORTABILITY_SETUP_STORAGE_ROOT,
    createIpcHandler(SetupStorageRootRequestSchema, (request) => {
      return SetupStorageRootResponseSchema.parse(
        getPortabilityService().setupStorageRoot(request.root),
      );
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.PORTABILITY_CHECK_STORAGE_HEALTH,
    createIpcHandlerNoArg(async () => {
      return StorageHealthResultSchema.parse(await getPortabilityService().checkStorageHealth());
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.PORTABILITY_BACKUP_NOW,
    createIpcHandlerNoArg(async () => {
      return z.object({ filePath: z.string() }).parse(await getPortabilityService().backupNow());
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.NOTIFY_GET_DESKTOP_ENABLED,
    createIpcHandlerNoArg(() => {
      return { enabled: isDesktopNotifyEnabled(getDatabase()) };
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.NOTIFY_SET_DESKTOP_ENABLED,
    createIpcHandler(
      z.object({ enabled: z.boolean() }),
      (request) => {
        setDesktopNotifyEnabled(getDatabase(), request.enabled);
        return { enabled: isDesktopNotifyEnabled(getDatabase()) };
      },
    ),
  );

  ipcMain.handle(
    IPC_CHANNELS.TERM_PREVIEW_IMPORT,
    createIpcHandler(TermImportPreviewRequestSchema, (request) => {
      return TermImportPreviewResponseSchema.parse(getTermService().previewImport(request));
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.TERM_COMMIT_IMPORT,
    createIpcHandler(TermCommitImportRequestSchema, (request) => {
      return TermCommitImportResponseSchema.parse(getTermService().commitImport(request));
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.TABULAR_SELECT_IMPORT_FILE,
    createIpcHandler(TabularSelectFileRequestSchema, async (request) => {
      return TabularSelectFileResponseSchema.parse(
        await getTabularService().selectImportFile(request),
      );
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.TABULAR_PREVIEW,
    createIpcHandler(TabularPreviewRequestSchema, async (request) => {
      return TabularPreviewResponseSchema.parse(await getTabularService().preview(request));
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.TABULAR_COMMIT,
    createIpcHandler(TabularCommitRequestSchema, (request) => {
      return TabularCommitResponseSchema.parse(getTabularService().commit(request));
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.TABULAR_DISCARD_PREVIEW,
    createIpcHandler(TabularDiscardPreviewRequestSchema, (request) => {
      getTabularService().discardPreview(request.previewId);
      return { ok: true };
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.TABULAR_SELECT_EXPORT_PATH,
    createIpcHandler(TabularSelectExportPathRequestSchema, async (request) => {
      const result = await getTabularService().selectExportPath(request);
      return { canceled: result.canceled, filePath: result.filePath };
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.TABULAR_EXPORT,
    createIpcHandler(TabularExportRequestSchema, async (request) => {
      assertKhepreeProductAccess(KHEPREE_FEATURES.export);
      if (!request.outputPath) {
        throw new Error('outputPath is required for tabular export');
      }
      return TabularExportResponseSchema.parse(
        await getTabularService().export({
          ...request,
          outputPath: request.outputPath,
        }),
      );
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.TABULAR_UNDO_LAST,
    createIpcHandler(TabularUndoLastRequestSchema, (request) => {
      return TabularUndoLastResponseSchema.parse(getTabularService().undoLast(request.projectId));
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.TABULAR_LIST_HISTORY,
    createIpcHandler(TabularUndoLastRequestSchema, (request) => {
      return TabularListHistoryResponseSchema.parse({
        entries: getTabularService().listHistory(request.projectId),
      });
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.TABULAR_DOWNLOAD_TERM_TEMPLATE,
    createIpcHandler(TabularDownloadTermTemplateRequestSchema, async (request) => {
      return TabularDownloadTermTemplateResponseSchema.parse(
        await getTabularService().downloadTermTemplate(request.outputPath),
      );
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.DIAGNOSTICS_LIST_PROVIDERS,
    createIpcHandlerNoArg(() => {
      return ListProviderStatusResponseSchema.parse(getDiagnosticsService().listProviders());
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.DIAGNOSTICS_HEALTH_REPORT,
    createIpcHandlerNoArg(() => {
      return GetHealthReportResponseSchema.parse(getDiagnosticsService().buildHealthReport());
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.DIAGNOSTICS_RUN_SYSTEM_HEALTH,
    createIpcHandlerNoArg(() => {
      return SystemHealthResultSchema.parse(runSystemHealthCheck(getDatabase()));
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.DIAGNOSTICS_LIST_FAILURE_SHOTS,
    createIpcHandlerNoArg(() => {
      return DiagnosticsListFailureShotsResponseSchema.parse({
        files: listFailureDiagnostics(100),
      });
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.DIAGNOSTICS_DELETE_FAILURE_SHOT,
    createIpcHandler(DiagnosticsDeleteFailureShotRequestSchema, (request) => {
      return DiagnosticsDeleteFailureShotResponseSchema.parse({
        ok: deleteFailureDiagnostic(request.path),
      });
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.DIAGNOSTICS_PURGE_FAILURE_SHOTS,
    createIpcHandlerNoArg(() => {
      return DiagnosticsPurgeFailureShotsResponseSchema.parse(
        purgeFailureDiagnosticsOlderThan(),
      );
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.BROWSER_ATTENTION_LIST,
    createIpcHandlerNoArg(() => {
      const rows = getDatabase().browserAttention.listOpen(50);
      return BrowserAttentionListResponseSchema.parse({
        items: rows.map((r) => ({
          id: r.id,
          accountKind: r.account_kind,
          accountId: r.account_id,
          providerId: r.provider_id,
          providerType: r.provider_type,
          kind: r.kind,
          poolState: r.pool_state,
          summary: r.summary,
          suggestedAction: r.suggested_action,
          diagnosticsPath: r.diagnostics_path,
          status: r.status,
          createdAt: r.created_at,
        })),
      });
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.BROWSER_ATTENTION_RESOLVE,
    createIpcHandler(BrowserAttentionResolveRequestSchema, (request) => {
      const ok = getDatabase().browserAttention.resolve(request.id, request.status);
      if (ok) {
        const item = getDatabase().browserAttention.getById(request.id);
        if (item?.provider_id) {
          getBrowserCircuitBreaker().clear(item.provider_id, item.account_id);
        }
      }
      return BrowserAttentionResolveResponseSchema.parse({ ok });
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.ATTENTION_INBOX_LIST,
    createIpcHandlerNoArg(() => {
      const svc = getAttentionInboxService(getDatabase());
      return AttentionInboxListResponseSchema.parse({
        items: svc.listOpen(100),
        openCount: svc.countOpen(),
      });
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.ATTENTION_INBOX_COUNT,
    createIpcHandlerNoArg(() => {
      return AttentionInboxCountResponseSchema.parse({
        openCount: getAttentionInboxService(getDatabase()).countOpen(),
      });
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.ATTENTION_INBOX_ACT,
    createIpcHandler(
      AttentionInboxActRequestSchema,
      (request) => {
        const item = getAttentionInboxService(getDatabase()).act(
          request.itemId,
          request.action,
          { snoozeMinutes: request.snoozeMinutes },
        );
        return { item };
      },
    ),
  );

  ipcMain.handle(
    IPC_CHANNELS.FICTION_SERIES_LIST,
    createIpcHandlerNoArg(() => {
      const series = getFictionSeriesService().listSeries();
      return { series: FictionSeriesDtoSchema.array().parse(series) };
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.FICTION_SERIES_GET,
    createIpcHandler(z.object({ seriesId: z.string().uuid() }), (request) => {
      const series = getFictionSeriesService().getSeries(request.seriesId);
      if (!series) throw new Error('SERIES_NOT_FOUND');
      return { series: FictionSeriesDtoSchema.parse(series) };
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.FICTION_SERIES_CREATE,
    createIpcHandler(CreateFictionSeriesRequestSchema, (request) => {
      const series = getFictionSeriesService().createSeries(request);
      return { series: FictionSeriesDtoSchema.parse(series) };
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.FICTION_SERIES_LIST_VOLUMES,
    createIpcHandler(z.object({ seriesId: z.string().uuid() }), (request) => {
      const volumes = getFictionSeriesService().listVolumes(request.seriesId);
      return { volumes: FictionSeriesVolumeDtoSchema.array().parse(volumes) };
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.FICTION_SERIES_ADD_VOLUME,
    createIpcHandler(AddSeriesVolumeRequestSchema, (request) => {
      const volume = getFictionSeriesService().assignProjectToSeries({
        projectId: request.projectId,
        seriesId: request.seriesId,
        volumeLabel: request.volumeLabel,
        force: request.force,
      });
      return { volume: FictionSeriesVolumeDtoSchema.parse(volume) };
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.FICTION_SERIES_REMOVE_VOLUME,
    createIpcHandler(RemoveSeriesVolumeRequestSchema, (request) => {
      return getFictionSeriesService().removeVolume(request.seriesId, request.projectId);
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.FICTION_SERIES_REORDER_VOLUMES,
    createIpcHandler(ReorderSeriesVolumesRequestSchema, (request) => {
      return getFictionSeriesService().reorderVolumes(
        request.seriesId,
        request.orderedProjectIds,
      );
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.FICTION_SERIES_PREVIEW_MEMBERSHIP,
    createIpcHandler(PreviewSeriesMembershipRequestSchema, (request) => {
      const preview = getFictionSeriesService().previewMembershipChange(request);
      return SeriesMembershipConflictPreviewSchema.parse(preview);
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.FICTION_SERIES_ASSIGN_PROJECT,
    createIpcHandler(AddSeriesVolumeRequestSchema, (request) => {
      const volume = getFictionSeriesService().assignProjectToSeries({
        projectId: request.projectId,
        seriesId: request.seriesId,
        volumeLabel: request.volumeLabel,
        force: request.force,
      });
      return { volume: FictionSeriesVolumeDtoSchema.parse(volume) };
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.FICTION_SERIES_EXPORT_KNOWLEDGE,
    createIpcHandler(ExportSeriesKnowledgeRequestSchema, (request) => {
      return ExportSeriesKnowledgeResponseSchema.parse(
        getFictionSeriesService().exportSeriesKnowledge(request.seriesId),
      );
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.FICTION_SERIES_UPDATE,
    createIpcHandler(UpdateFictionSeriesRequestSchema, (request) => {
      const series = getFictionSeriesService().updateSeries(request);
      return { series: FictionSeriesDtoSchema.parse(series) };
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.FICTION_SERIES_GET_WORLD,
    createIpcHandler(GetSeriesWorldRequestSchema, (request) => {
      return getFictionSeriesService().getWorldKnowledge(request.seriesId);
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.FICTION_SERIES_SET_WORLD,
    createIpcHandler(SetSeriesWorldRequestSchema, (request) => {
      return getFictionSeriesService().setWorldKnowledge(
        request.seriesId,
        request.worldKnowledge,
      );
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.FICTION_SERIES_LIST_STYLE_RULES,
    createIpcHandler(ListSeriesStyleRulesRequestSchema, (request) => {
      const rules = getFictionSeriesService().listStyleRules(request.seriesId);
      return ListSeriesStyleRulesResponseSchema.parse({
        rules: SeriesStyleRuleDtoSchema.array().parse(rules),
      });
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.FICTION_SERIES_UPSERT_STYLE_RULE,
    createIpcHandler(UpsertSeriesStyleRuleRequestSchema, (request) => {
      const rule = getFictionSeriesService().upsertStyleRule({
        seriesId: request.seriesId,
        id: request.id,
        kind: request.kind,
        content: request.content,
        sortOrder: request.sortOrder,
      });
      return UpsertSeriesStyleRuleResponseSchema.parse({
        rule: SeriesStyleRuleDtoSchema.parse(rule),
      });
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.FICTION_SERIES_DELETE_STYLE_RULE,
    createIpcHandler(DeleteSeriesStyleRuleRequestSchema, (request) => {
      return getFictionSeriesService().deleteStyleRule(request);
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.NOTEBOOK_LIST_DUPLICATE_CANDIDATES,
    createIpcHandler(z.object({ projectId: z.string().uuid() }), (request) => {
      const {
        listDuplicateBindingCandidates,
      } = require('../notebook/notebook-binding-duplicate-audit') as typeof import('../notebook/notebook-binding-duplicate-audit');
      return {
        candidates: listDuplicateBindingCandidates(
          getDatabase().getConnection(),
          request.projectId,
        ),
      };
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.NOTEBOOK_RESOLVE_PRIMARY_BINDING,
    createIpcHandler(
      z.object({
        projectId: z.string().uuid(),
        primaryRowId: z.string().uuid(),
      }),
      (request) => {
        const {
          resolvePrimaryNotebookBinding,
        } = require('../notebook/notebook-binding-duplicate-audit') as typeof import('../notebook/notebook-binding-duplicate-audit');
        return resolvePrimaryNotebookBinding(getDatabase().getConnection(), request);
      },
    ),
  );

  ipcMain.handle(
    IPC_CHANNELS.NOTEBOOK_LIST_SYNC_STATUS,
    createIpcHandler(z.object({ projectId: z.string().uuid() }), (request) => {
      const db = getDatabase();
      const events = db.knowledgeSyncEvents.listRecent(request.projectId, 20);
      const dirtyCount = db.knowledgeFiles.anyDirty(request.projectId) ? 1 : 0;
      const last = events[0] ?? null;
      let userStatus: 'updated' | 'needs_sync' | 'idle' = 'idle';
      if (dirtyCount > 0) userStatus = 'needs_sync';
      else if (last && /KNOWLEDGE_BUILD|SYNC|WORLD|STYLE|DIRTY/i.test(last.event_type)) {
        userStatus = 'updated';
      }
      return {
        userStatus,
        userMessage:
          userStatus === 'needs_sync'
            ? 'Notebook cần đồng bộ lại'
            : userStatus === 'updated'
              ? 'Kiến thức đã được cập nhật'
              : null,
        recentEventCount: events.length,
        dirtyCount,
      };
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.ATTENTION_INBOX_BULK_RETRY,
    createIpcHandler(
      AttentionInboxBulkRetryRequestSchema,
      (request) => {
        return getAttentionInboxService(getDatabase()).bulkRetry({
          itemIds: request.itemIds,
          allRetryable: request.allRetryable,
        });
      },
    ),
  );

  ipcMain.handle(
    IPC_CHANNELS.ATTENTION_INBOX_RECONCILE,
    createIpcHandlerNoArg(() => {
      return getAttentionInboxService(getDatabase()).reconcile();
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.LIBRARY_SEARCH_QUERY,
    createIpcHandler(
      LibrarySearchQueryInputSchema,
      (request) => {
        return getLibrarySearchService(getDatabase()).query(request);
      },
    ),
  );

  ipcMain.handle(IPC_CHANNELS.LIBRARY_SEARCH_CANCEL, createIpcHandlerNoArg(() => {
    getLibrarySearchService(getDatabase()).cancelQuery();
    return { ok: true };
  }));

  ipcMain.handle(IPC_CHANNELS.LIBRARY_SEARCH_GET_SETTINGS, createIpcHandlerNoArg(() => {
    return LibrarySearchSettingsSchema.parse(
      getLibrarySearchService(getDatabase()).getSettings(),
    );
  }));

  ipcMain.handle(
    IPC_CHANNELS.LIBRARY_SEARCH_UPDATE_SETTINGS,
    createIpcHandler(
      LibrarySearchSettingsSchema.partial(),
      (request) => {
        return LibrarySearchSettingsSchema.parse(
          getLibrarySearchService(getDatabase()).updateSettings(request),
        );
      },
    ),
  );

  ipcMain.handle(
    IPC_CHANNELS.LIBRARY_SEARCH_START_REINDEX,
    createIpcHandler(z.object({ force: z.boolean().optional() }).optional(), async (request) => {
      const progress = await getLibrarySearchService(getDatabase()).startReindex(
        request?.force ?? false,
      );
      return LibrarySearchIndexProgressSchema.parse(progress);
    }),
  );

  ipcMain.handle(IPC_CHANNELS.LIBRARY_SEARCH_CANCEL_REINDEX, createIpcHandlerNoArg(() => {
    const progress = getLibrarySearchService(getDatabase()).cancelReindex();
    return progress ? LibrarySearchIndexProgressSchema.parse(progress) : null;
  }));

  ipcMain.handle(IPC_CHANNELS.LIBRARY_SEARCH_GET_REINDEX_PROGRESS, createIpcHandlerNoArg(() => {
    const progress = getLibrarySearchService(getDatabase()).getReindexProgress();
    return progress ? LibrarySearchIndexProgressSchema.parse(progress) : null;
  }));

  ipcMain.handle(IPC_CHANNELS.FEATURE_INTRO_GET_STATE, createIpcHandlerNoArg(() => {
    return FeatureIntroStateSchema.parse(getFeatureIntroService(getDatabase()).getState());
  }));

  ipcMain.handle(
    IPC_CHANNELS.FEATURE_INTRO_DISMISS,
    createIpcHandler(
      FeatureIntroDismissRequestSchema,
      (request) => {
        return FeatureIntroStateSchema.parse(
          getFeatureIntroService(getDatabase()).dismissWhatsNew(request.mode),
        );
      },
    ),
  );

  ipcMain.handle(
    IPC_CHANNELS.FEATURE_INTRO_UPDATE_TOUR,
    createIpcHandler(
      FeatureIntroTourUpdateSchema,
      (request) => {
        return FeatureIntroStateSchema.parse(
          getFeatureIntroService(getDatabase()).updateTour(request),
        );
      },
    ),
  );

  ipcMain.handle(
    IPC_CHANNELS.DIAGNOSTICS_EXPORT,
    createIpcHandler(ExportDiagnosticsRequestSchema, async (request) => {
      const result = await getDiagnosticsService().exportDiagnostics(request.outputPath);
      return ExportDiagnosticsResponseSchema.parse(result);
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.DIAGNOSTICS_CONNECTION_TEST,
    createIpcHandler(ConnectionTestRequestSchema, async (request) => {
      const result = await getDiagnosticsService().runConnectionTest(request);
      return ConnectionTestResponseSchema.parse(result);
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.DIAGNOSTICS_AI_BROWSER_PROBE,
    createIpcHandler(AiBrowserProbeRequestSchema, async (request) => {
      const result = await getDiagnosticsService().runAiBrowserProbe(request);
      return AiBrowserProbeResponseSchema.parse(result);
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.DIAGNOSTICS_GOOGLE_SMOKE,
    createIpcHandler(GoogleSmokeRunRequestSchema, async (request) => {
      const result = await getDiagnosticsService().runGoogleSmoke(request);
      return GoogleSmokeRunResponseSchema.parse(result);
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.DIAGNOSTICS_NOTEBOOK_GROUNDING_SMOKE,
    createIpcHandler(NotebookGroundingSmokeRunRequestSchema, async (request) => {
      const result = await getDiagnosticsService().runNotebookGroundingSmoke(request);
      return NotebookGroundingSmokeRunResponseSchema.parse(result);
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.DIAGNOSTICS_GET_OVERRIDES,
    createIpcHandlerNoArg(() => {
      return GetSelectorOverridesResponseSchema.parse(getDiagnosticsService().getSelectorOverrides());
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.DIAGNOSTICS_LOAD_OVERRIDES,
    createIpcHandler(LoadSelectorOverridesRequestSchema, (request) => {
      return LoadSelectorOverridesResponseSchema.parse(
        getDiagnosticsService().loadSelectorOverrides(request.filePath),
      );
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.DIAGNOSTICS_SAVE_OVERRIDES,
    createIpcHandler(SaveSelectorOverridesRequestSchema, (request) => {
      return SaveSelectorOverridesResponseSchema.parse(
        getDiagnosticsService().saveSelectorOverrides(request.file),
      );
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.DIAGNOSTICS_RELOAD_OVERRIDES,
    createIpcHandlerNoArg(() => {
      return LoadSelectorOverridesResponseSchema.parse(
        getDiagnosticsService().reloadSelectorOverrides(),
      );
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.DIAGNOSTICS_REPAIR_START,
    createIpcHandler(InteractiveRepairStartRequestSchema, async (request) => {
      const result = await getDiagnosticsService().startInteractiveRepair(request);
      return InteractiveRepairStartResponseSchema.parse(result);
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.DIAGNOSTICS_REPAIR_CAPTURE,
    createIpcHandler(InteractiveRepairCaptureRequestSchema, async (request) => {
      const result = await getDiagnosticsService().captureInteractiveRepair(request);
      return InteractiveRepairCaptureResponseSchema.parse(result);
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.DIAGNOSTICS_REPAIR_APPLY,
    createIpcHandler(InteractiveRepairApplyRequestSchema, (request) => {
      return InteractiveRepairApplyResponseSchema.parse(
        getDiagnosticsService().applyInteractiveRepair(request),
      );
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.DIAGNOSTICS_REPAIR_CANCEL,
    createIpcHandler(InteractiveRepairCancelRequestSchema, async (request) => {
      return getDiagnosticsService().cancelInteractiveRepair(request.sessionId);
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.DIAGNOSTICS_SELECT_EXPORT_PATH,
    createIpcHandlerNoArg(async () => {
      const result = await dialog.showSaveDialog({
        defaultPath: `diagnostics-${new Date().toISOString().slice(0, 10)}.zip`,
        filters: [{ name: 'ZIP', extensions: ['zip'] }],
      });
      return {
        canceled: result.canceled,
        filePath: result.filePath ? result.filePath : null,
      };
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.DIAGNOSTICS_SELECT_OVERRIDE_PATH,
    createIpcHandlerNoArg(async () => {
      const result = await dialog.showOpenDialog({
        properties: ['openFile'],
        filters: [{ name: 'JSON', extensions: ['json'] }],
      });
      return {
        canceled: result.canceled,
        filePath: result.filePaths[0] ?? null,
      };
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.SETUP_GET_STATUS,
    createIpcHandlerNoArg(() => {
      return SetupStatusSchema.parse(getSetupService().getStatus());
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.SETUP_SET_STEP,
    createIpcHandler(SetupSetStepRequestSchema, (request) => {
      return SetupStatusSchema.parse(getSetupService().setStep(request.step));
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.SETUP_EXPLORE,
    createIpcHandler(SetupExploreRequestSchema, (request) => {
      return SetupExploreResponseSchema.parse(getSetupService().explore(request.confirm));
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.SETUP_COMPLETE,
    createIpcHandler(SetupCompleteRequestSchema, (request) => {
      return SetupCompleteResponseSchema.parse(getSetupService().complete(request.confirm));
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.APP_CHECK_FOR_UPDATES,
    createIpcHandlerNoArg(async () => {
      initializeUpdateService();
      const status = await getUpdateService().checkNow('legacy-ipc');
      const legacyStatus =
        status.phase === 'available' || status.phase === 'downloaded' || status.phase === 'downloading'
          ? 'update-available'
          : status.phase === 'up-to-date'
            ? 'up-to-date'
            : status.phase === 'error'
              ? 'error'
              : 'unavailable';
      const provider = getUpdateProvider();
      return CheckForUpdatesResponseSchema.parse({
        ok: status.phase !== 'error',
        status: legacyStatus,
        currentVersion: status.currentVersion,
        latestVersion: status.latestVersion,
        message:
          status.errorMessage ??
          (legacyStatus === 'update-available'
            ? `Update ${status.latestVersion ?? ''} available`
            : legacyStatus === 'up-to-date'
              ? 'App is up to date'
              : 'Update check unavailable in this environment'),
        releaseNotes: status.releaseNotes,
        downloadUrl: status.manualDownloadUrl,
        providerId: provider.id,
        providerLabel: provider.label,
      });
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.UPDATE_GET_STATUS,
    createIpcHandlerNoArg(() => {
      initializeUpdateService();
      return UpdateStatusSchema.parse(getUpdateService().getStatus());
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.UPDATE_CHECK_NOW,
    createIpcHandlerNoArg(async () => {
      initializeUpdateService();
      const status = await getUpdateService().checkNow('manual');
      return UpdateStatusSchema.parse(status);
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.UPDATE_INSTALL_AND_RESTART,
    createIpcHandlerNoArg(async () => {
      initializeUpdateService();
      return getUpdateService().installAndRestart();
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.UPDATE_POSTPONE,
    createIpcHandler(UpdatePostponeRequestSchema, (request) => {
      initializeUpdateService();
      const status = getUpdateService().postpone(request.untilMs);
      return UpdatePostponeResponseSchema.parse({
        ok: true,
        postponedUntil: status.postponedUntil,
      });
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.KHEPREE_ANNOUNCEMENTS_LIST,
    createIpcHandlerNoArg(() => {
      initializeAnnouncementSyncService();
      return KhepreeAnnouncementsListResponseSchema.parse(
        getAnnouncementSyncService().listForRenderer(),
      );
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.KHEPREE_ANNOUNCEMENTS_SYNC,
    createIpcHandlerNoArg(async () => {
      initializeAnnouncementSyncService();
      await getAnnouncementSyncService().sync('manual');
      return KhepreeAnnouncementsListResponseSchema.parse(
        getAnnouncementSyncService().listForRenderer(),
      );
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.KHEPREE_ANNOUNCEMENT_MARK_READ,
    createIpcHandler(KhepreeAnnouncementMarkReadRequestSchema, (request) => {
      initializeAnnouncementSyncService();
      getAnnouncementSyncService().markReadLocal(request.publicId);
      return KhepreeAnnouncementsListResponseSchema.parse(
        getAnnouncementSyncService().listForRenderer(),
      );
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.KHEPREE_ANNOUNCEMENT_DISMISS,
    createIpcHandler(KhepreeAnnouncementDismissRequestSchema, (request) => {
      initializeAnnouncementSyncService();
      getAnnouncementSyncService().dismissLocal(request.publicId);
      return KhepreeAnnouncementsListResponseSchema.parse(
        getAnnouncementSyncService().listForRenderer(),
      );
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.LOGS_TAIL,
    createIpcHandler(LogsTailRequestSchema, (request) => {
      return LogsTailResponseSchema.parse(tailApplicationLogs(request));
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.LOGS_OPEN_DIR,
    createIpcHandlerNoArg(async () => {
      const targetPath = pathsService.getPath('logs');
      const result = await shell.openPath(targetPath);
      if (result) {
        throw new Error(result);
      }
      return { ok: true as const, path: targetPath };
    }, OpenFolderResponseSchema),
  );

  registerAiProviderHandlers();
}

function registerAiProviderHandlers(): void {
  ipcMain.handle(
    IPC_CHANNELS.AI_PROVIDER_LIST,
    createIpcHandlerNoArg(() => {
      return AiProviderListResponseSchema.parse(getAiProviderService().listProviders());
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.AI_PROVIDER_HEALTH,
    createIpcHandlerNoArg(async () => {
      return AiProviderHealthResponseSchema.parse(await getAiProviderService().healthReport());
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.AI_PROVIDER_SET_PRIORITY,
    createIpcHandler(AiProviderSetPriorityRequestSchema, (request) => {
      if (request.promote) {
        getAiProviderService().promoteProvider(request.providerId);
      } else if (typeof request.priority === 'number') {
        getAiProviderService().setPriority(request.providerId, request.priority);
      }
      return AiProviderListResponseSchema.parse(getAiProviderService().listProviders());
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.AI_PROVIDER_SET_ENABLED,
    createIpcHandler(AiProviderSetEnabledRequestSchema, (request) => {
      getAiProviderService().setEnabled(request.providerId, request.enabled);
      return AiProviderListResponseSchema.parse(getAiProviderService().listProviders());
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.AI_PROVIDER_CHECK,
    createIpcHandler(AiProviderCheckRequestSchema, async (request) => {
      const health = await getAiProviderService().checkProvider(request.providerId);
      return z
        .object({
          ok: z.boolean(),
          status: z.string(),
          message: z.string(),
        })
        .parse({ ok: health.ok, status: health.status, message: health.message });
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.AI_PROVIDER_SET_FALLBACK,
    createIpcHandler(AiFallbackConfigRequestSchema, (request) => {
      getAiProviderService().setFallback(request.enabled, request.statuses);
      return AiProviderListResponseSchema.parse(getAiProviderService().listProviders());
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.AI_PROVIDER_GET_ROUTING,
    createIpcHandler(AiProviderGetRoutingRequestSchema, (request) => {
      return AiProviderRoutingResponseSchema.parse(
        getAiProviderService().getRoutingConfig(request.projectId),
      );
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.AI_PROVIDER_SET_PRIMARY,
    createIpcHandler(AiProviderSetPrimaryRequestSchema, (request) => {
      getAiProviderService().setPrimaryProvider(request.providerId);
      return AiProviderListResponseSchema.parse(getAiProviderService().listProviders());
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.AI_PROVIDER_SET_PREFERENCE,
    createIpcHandler(AiProviderSetPreferenceRequestSchema, (request) => {
      getAiProviderService().setAiPreference(request.preference);
      return AiProviderListResponseSchema.parse(getAiProviderService().listProviders());
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.AI_PROVIDER_CHECK_ALL,
    createIpcHandlerNoArg(async () => {
      return getAiProviderService().checkAllProviders();
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.AI_PROVIDER_INSTALL_WORKER,
    createIpcHandlerNoArg(async () => {
      const result = await getAiProviderService().installWorker();
      return AiWorkerInstallResponseSchema.parse({
        ok: result.ok,
        message: result.message,
        pythonPath: result.pythonPath,
        venvPath: result.venvPath,
      });
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.AI_AUTO_SETUP_STATUS,
    createIpcHandlerNoArg(() => {
      const svc = new AiAutoSetupService(getDatabase(), getAiProviderService());
      return AiStatusSnapshotSchema.parse(svc.statusSnapshot());
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.AI_AUTO_SETUP_RUN,
    createIpcHandlerNoArg(async () => {
      const svc = new AiAutoSetupService(getDatabase(), getAiProviderService());
      return AiAutoSetupResultSchema.parse(await svc.run());
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.AI_ACCOUNT_LIST,
    createIpcHandler(AiAccountListRequestSchema, (request) => {
      return AiAccountListResponseSchema.parse({
        accounts: getAiProviderService().listAccounts(request.providerId),
      });
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.AI_ACCOUNT_CREATE,
    createIpcHandler(AiAccountCreateRequestSchema, (request) => {
      const account = getAiProviderService().createAccount({
        providerId: request.providerId,
        googleAccountId: request.googleAccountId,
        googleEmail: request.googleEmail,
        displayName: request.displayName,
      });
      return AiAccountActionResponseSchema.parse({ account });
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.AI_ACCOUNT_PASTE_COOKIES,
    createIpcHandler(AiAccountPasteCookiesRequestSchema, async (request) => {
      const result = await getAiProviderService().pasteCookies(request);
      return AiAccountActionResponseSchema.parse(result);
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.AI_ACCOUNT_CHECK,
    createIpcHandler(AiAccountIdRequestSchema, async (request) => {
      const result = await getAiProviderService().checkAccount(request.accountId);
      return AiAccountActionResponseSchema.parse(result);
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.AI_ACCOUNT_DISABLE,
    createIpcHandler(AiAccountIdRequestSchema, (request) => {
      const account = getAiProviderService().disableAccount(request.accountId);
      return AiAccountActionResponseSchema.parse({ account });
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.AI_ACCOUNT_DELETE,
    createIpcHandler(AiAccountIdRequestSchema, async (request) => {
      return getAiProviderService().deleteAccount(request.accountId);
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.AI_BROWSER_ACCOUNT_OPEN_LOGIN,
    createIpcHandler(AiAccountIdRequestSchema, async (request) => {
      const result = await getAiProviderService().openBrowserAccountLogin({
        accountId: request.accountId,
      });
      return AiBrowserAccountOpenLoginResponseSchema.parse(result);
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.AI_BROWSER_ACCOUNT_VERIFY,
    createIpcHandler(AiAccountIdRequestSchema, async (request) => {
      const result = await getAiProviderService().verifyBrowserAccount({
        accountId: request.accountId,
      });
      return AiAccountActionResponseSchema.parse(result);
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.AI_ACCOUNT_UPDATE_DISPLAY_NAME,
    createIpcHandler(AiAccountUpdateDisplayNameRequestSchema, (request) => {
      const account = getAiProviderService().updateBrowserAccountDisplayName(
        request.accountId,
        request.displayName,
      );
      return AiAccountActionResponseSchema.parse({ account });
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.AI_MODELS_LIST,
    createIpcHandler(AiModelsListRequestSchema, (request) => {
      return AiModelsListResponseSchema.parse({
        models: getAiProviderService().listModels(request.providerId),
      });
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.AI_MODELS_SYNC,
    createIpcHandler(AiAccountIdRequestSchema, async (request) => {
      const models = await getAiProviderService().syncModelsFromWorker(request.accountId);
      return AiModelsListResponseSchema.parse({ models });
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.KHEPREE_GET_ACCESS_STATE,
    createIpcHandlerNoArg(() => {
      return KhepreeGetAccessStateResponseSchema.parse(getKhepreeAccessService().getPublicState());
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.UI_LANGUAGE_GET,
    createIpcHandlerNoArg(() => {
      return UiLanguageStatusSchema.parse(getUiLanguageService().getStatus());
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.UI_LANGUAGE_SET,
    createIpcHandler(UiLanguageSetRequestSchema, (request) => {
      return UiLanguageSetResponseSchema.parse(
        getUiLanguageService().setPreference(request.preference),
      );
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.UI_LANGUAGE_COMPLETE_FIRST_RUN,
    createIpcHandler(UiLanguageCompleteFirstRunRequestSchema, (request) => {
      return UiLanguageSetResponseSchema.parse(
        getUiLanguageService().completeFirstRun(request.preference),
      );
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.KHEPREE_START_LOGIN,
    createIpcHandlerNoArg(async () => {
      const state = await getKhepreeAccessService().startLogin();
      return KhepreeStartLoginResponseSchema.parse({ ok: true, state });
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.KHEPREE_RETRY_COLD_START,
    createIpcHandlerNoArg(async () => {
      const state = await getKhepreeAccessService().retryColdStart();
      return KhepreeRefreshEntitlementResponseSchema.parse({ ok: true, state });
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.KHEPREE_RETRY_ACTIVATION,
    createIpcHandlerNoArg(async () => {
      const state = await getKhepreeAccessService().retryActivation();
      return KhepreeRetryActivationResponseSchema.parse({
        ok: state.status === 'ACTIVE',
        state,
      });
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.KHEPREE_REFRESH_ENTITLEMENT,
    createIpcHandlerNoArg(async () => {
      const state = await getKhepreeAccessService().refreshEntitlement();
      return KhepreeRefreshEntitlementResponseSchema.parse({
        ok: state.status === 'ACTIVE',
        state,
      });
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.KHEPREE_START_CHECKOUT,
    createIpcHandler(KhepreeStartCheckoutRequestSchema, async (request) => {
      const state = await getKhepreeAccessService().startCheckout(request.planId);
      return KhepreeStartCheckoutResponseSchema.parse({
        ok: state.checkoutPhase !== 'failed',
        state,
      });
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.KHEPREE_CANCEL_CHECKOUT,
    createIpcHandlerNoArg(async () => {
      const state = await getKhepreeAccessService().cancelCheckout();
      return KhepreeCancelCheckoutResponseSchema.parse({ ok: true, state });
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.KHEPREE_CHECK_CHECKOUT,
    createIpcHandlerNoArg(async () => {
      const state = await getKhepreeAccessService().checkCheckoutNow();
      return KhepreeCheckCheckoutResponseSchema.parse({
        ok: state.status === 'ACTIVE' || state.checkoutPhase === 'idle',
        state,
      });
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.KHEPREE_REOPEN_CHECKOUT,
    createIpcHandlerNoArg(async () => {
      const state = await getKhepreeAccessService().reopenCheckout();
      return KhepreeReopenCheckoutResponseSchema.parse({
        ok: state.checkoutCanReopen || state.checkoutPhase === 'waiting',
        state,
      });
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.KHEPREE_GET_PLAN_CATALOG,
    createIpcHandlerNoArg(async () => {
      const catalog = await getKhepreeAccessService().getPlanCatalog();
      return KhepreeGetPlanCatalogResponseSchema.parse({ ok: true, catalog });
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.KHEPREE_SIGN_OUT,
    createIpcHandlerNoArg(async () => {
      const state = await getKhepreeAccessService().signOut();
      return KhepreeSignOutResponseSchema.parse({ ok: true, state });
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.KHEPREE_OPEN_EXTERNAL,
    createIpcHandler(KhepreeOpenExternalRequestSchema, async (request) => {
      const ok = await openKhepreeExternal(request.target);
      return KhepreeOpenExternalResponseSchema.parse({ ok });
    }),
  );
}

function buildMinimalRepairPack(projectId: string, prompt: string): TranslationPackDto {
  const promptHash = createHash('sha256').update(prompt).digest('hex');
  return {
    projectId,
    chapterIds: [newId()],
    chapterNumbers: [1],
    style: 'balanced',
    prompt,
    baseContext: '',
    operationPrompt: prompt,
    operationType: 'REPAIR',
    sections: {
      taskHeader: 'Repair',
      criticalRules: '',
      hotMemoryDelta: '',
      activeProjectTerms: '',
      sourceParagraphs: '',
      outputProtocol: '',
    },
    size: {
      sourceChars: prompt.length,
      contextChars: 0,
      totalChars: prompt.length,
      estimatedTokens: Math.ceil(prompt.length / 4),
      activeTermCount: 0,
      activeCharacterCount: 0,
      relationshipCount: 0,
      recentMemoryCount: 0,
      paragraphCount: 1,
      chapterCount: 1,
    },
    promptHash,
  };
}

/** Job config never stores accountId — resolve from pin / progress / last worker. */
function resolveJobRetryAccountId(jobRow: {
  pinned_account_id: string | null;
  worker_id: string | null;
  config: string | null;
  progress: string | null;
}): string | null {
  try {
    const config = JSON.parse(jobRow.config ?? '{}') as { accountId?: string };
    if (typeof config.accountId === 'string' && config.accountId) return config.accountId;
  } catch {
    /* ignore */
  }
  if (jobRow.pinned_account_id) return jobRow.pinned_account_id;
  try {
    const progress = JSON.parse(jobRow.progress ?? '{}') as { accountId?: string };
    if (typeof progress.accountId === 'string' && progress.accountId) {
      return progress.accountId;
    }
  } catch {
    /* ignore */
  }
  if (jobRow.worker_id) {
    const worker = getDatabase().workerStates.getById(jobRow.worker_id);
    if (worker?.google_account_id) return worker.google_account_id;
  }
  return null;
}
