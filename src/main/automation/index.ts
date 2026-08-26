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
export { ChildProcessBrowserWorker } from './browser-runner/runner-host';
export { AutomationManager } from './automation-manager';
export type { AutomationProvider } from './providers/automation-provider';
export { NotebookProvider } from './providers/google/notebook-provider';
export { GeminiBrowserProvider } from './providers/google/gemini-browser-provider';
export { BrowserEventLogger } from './browser-event-logger';
export {
  GOOGLE_NOTEBOOK_SELECTORS,
  NotebookSelectorRegistry,
} from './providers/google/selectors/google-notebook.selectors';
export {
  GOOGLE_GEMINI_SELECTORS,
  GeminiSelectorRegistry,
} from './providers/google/selectors/google-gemini.selectors';
export { sanitizeHtmlSnapshot, captureFailureDiagnostics, redactDiagnosticText } from './diagnostics';
export {
  loadSelectorOverridesFromDisk,
  saveSelectorOverridesToDisk,
  reloadSelectorOverrides,
} from './selectors/selector-override-loader';
export { listProviderStatuses, recordProviderSuccess } from './selectors/provider-status';
export { waitForStableResponse } from './providers/google/response-stabilizer';
