/**
 * Legacy alias — prefer AutomationProvider for new code.
 * Gemini-specific logic must live under providers/google/, never in BrowserWorker.
 */
export interface BrowserProvider {
  readonly providerId: string;
  initialize(): Promise<void>;
  dispose(): Promise<void>;
}
