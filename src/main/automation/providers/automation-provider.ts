/**
 * High-level automation provider (Gemini / Notebook / future).
 * BrowserWorker must NOT contain provider-specific logic.
 */
import type { BrowserSession } from '../browser-session';

export interface AutomationProviderHealth {
  ok: boolean;
  message: string;
}

export interface AutomationProvider {
  readonly providerId: string;
  attach(session: BrowserSession): Promise<void>;
  healthCheck(): Promise<AutomationProviderHealth>;
  detach(): Promise<void>;
}

export type { BrowserProvider } from './browser-provider';
