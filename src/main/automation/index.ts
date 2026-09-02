export type {
  BrowserState,
  AutomationErrorCode,
  AutomationCommandType,
} from './types';
export {
  BROWSER_STATES,
  AUTOMATION_ERROR_CODES,
  TRANSIENT_ERROR_CODES,
  NON_RETRYABLE_ERROR_CODES,
} from './types';
export type {
  AutomationCommand,
  AutomationResult,
  AutomationFailureDiagnostics,
} from './protocol';
export {
  AutomationCommandSchema,
  AutomationResultSchema,
  parseAutomationCommand,
  parseAutomationResult,
} from './protocol';
export { AutomationError, RetryPolicy } from './errors/automation-errors';
export { BrowserSession } from './browser-session';
export type { BrowserWorker } from './browser-worker';
export { InProcessBrowserWorker } from './in-process-browser-worker';
export {
  UtilityProcessBrowserWorker,
  resolveDefaultRunnerScriptPath,
} from './browser-runner/runner-host';
export { resolveRunnerScriptPath, buildRunnerPathCandidates } from './browser-runner/runner-path';
export { AutomationManager } from './automation-manager';
export { resolveBrowserEngine } from './browser-runner/browser-engine-resolver';
export type { ResolvedBrowserEngine } from './browser-runner/browser-engine-resolver';
export { launchKhepreeNovelAIPersistentContext } from './browser-runner/launch-persistent-context';
export {
  BrowserRuntimeManager,
  getBrowserRuntimeManager,
  initializeBrowserRuntimeManager,
  shutdownBrowserRuntimeManager,
} from './browser-runner/browser-runtime-manager';
export { PlaywrightWorkerRuntime } from './browser-runner/playwright-worker-runtime';
export {
  getBrowserEngineConfig,
  setBrowserEngineConfigOverride,
  resetBrowserEngineConfigOverride,
} from './browser-runner/browser-engine-config';
export type { AutomationProvider } from './providers/automation-provider';
export { NotebookProvider } from './providers/google/notebook-provider';
export { GeminiBrowserProvider } from './providers/google/gemini-browser-provider';
export { BrowserEventLogger } from './browser-event-logger';
export {
  GOOGLE_NOTEBOOK_SELECTORS,
  NotebookSelectorRegistry,
} from './providers/google/selectors/google-notebook.selectors';
export {
  GEMINI_CHAT_SELECTORS,
  GEMINI_NOTEBOOK_SELECTORS,
  NOTEBOOKLM_SELECTORS,
  GeminiSelectorRegistry,
} from './providers/google/selectors/google-gemini.selectors';
export { detectUiSurface } from './providers/google/surface/surface-detector';
export { UI_SURFACES } from './providers/google/surface/surface-ids';
export type { UiSurface } from './providers/google/surface/surface-ids';
export { sanitizeHtmlSnapshot, captureFailureDiagnostics, redactDiagnosticText } from './diagnostics';
export {
  AutomationTimeline,
  AUTOMATION_TIMELINE_STEPS,
  timelineStepForOperation,
} from './automation-timeline';
export type { AutomationTimelineStep, AutomationTimelineSnapshot } from './automation-timeline';
export {
  startFailTrace,
  stopFailTrace,
  shouldEnableFailTrace,
} from './playwright-tracing';
export type { FailTraceSession } from './playwright-tracing';
export {
  loadSelectorOverridesFromDisk,
  saveSelectorOverridesToDisk,
  reloadSelectorOverrides,
} from './selectors/selector-override-loader';
export { listProviderStatuses, recordProviderSuccess } from './selectors/provider-status';
export { waitForStableResponse } from './providers/google/response-stabilizer';
export {
  profileLockManager,
  ProfileLeaseLockManager,
  ProfileBusyError,
  startLeaseHeartbeat,
  withLeaseHeartbeat,
  isProcessAlive,
} from './browser-runner/profile-lock';
export type { AcquireLeaseInput } from './browser-runner/profile-lock';
