import type { AiProviderType } from '@shared/constants/ai-provider';
import { AI_PROVIDER_IDS } from '@shared/constants/ai-provider';
import {
  DEFAULT_TRANSLATE_BATCH_PARAGRAPHS,
  PLAYWRIGHT_MAX_SOURCE_CHARS_PER_CHUNK,
  PLAYWRIGHT_TRANSLATE_BATCH_PARAGRAPHS,
  WEB_API_MAX_SOURCE_CHARS_PER_CHUNK,
} from '@shared/constants/job';
import {
  DEFAULT_GENERATION_MAX_TIMEOUT_MS,
  DEFAULT_SEND_CONFIRM_TIMEOUT_MS,
  DEFAULT_STABILIZATION_WINDOW_MS,
} from '@shared/constants/gemini';

export type ProviderTransport = 'BROWSER' | 'LOCAL_WORKER' | 'OFFICIAL_API';

export type CapabilityAccountKind = 'GOOGLE_ACCOUNT' | 'AI_ACCOUNT';

/** Phase-specific browser/API timeouts — not one giant Gemini constant. */
export interface ProviderHarnessTimeouts {
  composerMs: number;
  sendConfirmMs: number;
  generationStartMs: number;
  responseMs: number;
  stabilizationQuietMs: number;
}

/**
 * Capability snapshot — behavior derives from this, not provider display name.
 * Registered per provider type in {@link PROVIDER_CAPABILITY_REGISTRY}.
 */
export interface ProviderCapabilities {
  transport: ProviderTransport;
  accountKind: CapabilityAccountKind;
  requiresBrowserProfile: boolean;
  maxConcurrentPerAccount: number;
  recommendedPromptChars: number;
  hardPromptChars?: number;
  recommendedParagraphsPerChunk: number;
  supportsCancel: boolean;
  supportsConversationReuse: boolean;
  supportsNewConversation: boolean;
  supportsLocalContext: boolean;
  /** Notebook-assisted pack only when explicitly enabled — not default for translate. */
  supportsNotebookAssisted: boolean;
  browserSurface?: string;
  timeouts: ProviderHarnessTimeouts;
}

/** Minimal scheduling snapshot stored on {@link AiExecutionTarget}. */
export interface ExecutionTargetCapabilities {
  browserProfile: boolean;
  notebookRequired: boolean;
  webApiWorker: boolean;
}

const BROWSER_DEFAULT_TIMEOUTS: ProviderHarnessTimeouts = {
  composerMs: 15_000,
  sendConfirmMs: DEFAULT_SEND_CONFIRM_TIMEOUT_MS,
  generationStartMs: 45_000,
  responseMs: DEFAULT_GENERATION_MAX_TIMEOUT_MS,
  stabilizationQuietMs: DEFAULT_STABILIZATION_WINDOW_MS,
};

const LOCAL_WORKER_TIMEOUTS: ProviderHarnessTimeouts = {
  composerMs: 5_000,
  sendConfirmMs: 3_000,
  generationStartMs: 30_000,
  responseMs: DEFAULT_GENERATION_MAX_TIMEOUT_MS,
  stabilizationQuietMs: 1_000,
};

function browserCaps(input: {
  accountKind: CapabilityAccountKind;
  surface: string;
  paragraphs: number;
  promptChars: number;
  hardPromptChars?: number;
}): ProviderCapabilities {
  return {
    transport: 'BROWSER',
    accountKind: input.accountKind,
    requiresBrowserProfile: true,
    maxConcurrentPerAccount: 1,
    recommendedPromptChars: input.promptChars,
    hardPromptChars: input.hardPromptChars ?? input.promptChars,
    recommendedParagraphsPerChunk: input.paragraphs,
    supportsCancel: true,
    supportsConversationReuse: true,
    supportsNewConversation: true,
    supportsLocalContext: true,
    supportsNotebookAssisted: input.surface === 'gemini-notebook',
    browserSurface: input.surface,
    timeouts: { ...BROWSER_DEFAULT_TIMEOUTS },
  };
}

export const PROVIDER_CAPABILITY_REGISTRY: Record<AiProviderType, ProviderCapabilities> = {
  PLAYWRIGHT_GEMINI: browserCaps({
    accountKind: 'GOOGLE_ACCOUNT',
    surface: 'gemini-notebook',
    paragraphs: PLAYWRIGHT_TRANSLATE_BATCH_PARAGRAPHS,
    promptChars: PLAYWRIGHT_MAX_SOURCE_CHARS_PER_CHUNK,
  }),
  PLAYWRIGHT_CHATGPT: browserCaps({
    accountKind: 'AI_ACCOUNT',
    surface: 'chatgpt',
    paragraphs: 80,
    promptChars: 30_000,
    hardPromptChars: 30_000,
  }),
  PLAYWRIGHT_META_AI: browserCaps({
    accountKind: 'AI_ACCOUNT',
    surface: 'meta-ai',
    paragraphs: 80,
    promptChars: 30_000,
    hardPromptChars: 30_000,
  }),
  GEMINI_WEB_API: {
    transport: 'LOCAL_WORKER',
    accountKind: 'AI_ACCOUNT',
    requiresBrowserProfile: false,
    maxConcurrentPerAccount: 2,
    recommendedPromptChars: WEB_API_MAX_SOURCE_CHARS_PER_CHUNK,
    hardPromptChars: WEB_API_MAX_SOURCE_CHARS_PER_CHUNK,
    recommendedParagraphsPerChunk: DEFAULT_TRANSLATE_BATCH_PARAGRAPHS,
    supportsCancel: false,
    supportsConversationReuse: false,
    supportsNewConversation: false,
    supportsLocalContext: true,
    supportsNotebookAssisted: false,
    timeouts: { ...LOCAL_WORKER_TIMEOUTS },
  },
  GEMINI_OFFICIAL: {
    transport: 'OFFICIAL_API',
    accountKind: 'AI_ACCOUNT',
    requiresBrowserProfile: false,
    maxConcurrentPerAccount: 4,
    recommendedPromptChars: WEB_API_MAX_SOURCE_CHARS_PER_CHUNK,
    recommendedParagraphsPerChunk: DEFAULT_TRANSLATE_BATCH_PARAGRAPHS,
    supportsCancel: false,
    supportsConversationReuse: false,
    supportsNewConversation: false,
    supportsLocalContext: true,
    supportsNotebookAssisted: false,
    timeouts: { ...LOCAL_WORKER_TIMEOUTS, responseMs: 180_000 },
  },
};

export function getProviderCapabilities(
  providerType: AiProviderType | string | null | undefined,
): ProviderCapabilities {
  if (providerType && providerType in PROVIDER_CAPABILITY_REGISTRY) {
    return PROVIDER_CAPABILITY_REGISTRY[providerType as AiProviderType];
  }
  return PROVIDER_CAPABILITY_REGISTRY.GEMINI_WEB_API;
}

export function getProviderCapabilitiesById(providerId: string): ProviderCapabilities {
  const entry = Object.entries(AI_PROVIDER_IDS).find(([, id]) => id === providerId);
  if (entry) {
    return getProviderCapabilities(entry[0] as AiProviderType);
  }
  return PROVIDER_CAPABILITY_REGISTRY.GEMINI_WEB_API;
}

export function isBrowserTransport(
  caps: ProviderCapabilities | null | undefined,
): boolean {
  return caps?.transport === 'BROWSER';
}

export function isBrowserTransportType(
  providerType: AiProviderType | string | null | undefined,
): boolean {
  return isBrowserTransport(getProviderCapabilities(providerType));
}

export function executionTargetCapabilitiesFrom(
  providerType: AiProviderType,
): ExecutionTargetCapabilities {
  const caps = getProviderCapabilities(providerType);
  return {
    browserProfile: caps.requiresBrowserProfile,
    notebookRequired: false,
    webApiWorker: caps.transport === 'LOCAL_WORKER',
  };
}

/** @deprecated Use executionTargetCapabilitiesFrom */
export function defaultCapabilitiesForProviderType(
  providerType: AiProviderType,
): ExecutionTargetCapabilities {
  return executionTargetCapabilitiesFrom(providerType);
}

export function providerIdForType(providerType: AiProviderType): string {
  const map: Record<AiProviderType, string> = {
    PLAYWRIGHT_GEMINI: AI_PROVIDER_IDS.PLAYWRIGHT_GEMINI,
    GEMINI_WEB_API: AI_PROVIDER_IDS.GEMINI_WEB_API,
    GEMINI_OFFICIAL: AI_PROVIDER_IDS.GEMINI_OFFICIAL,
    PLAYWRIGHT_CHATGPT: AI_PROVIDER_IDS.PLAYWRIGHT_CHATGPT,
    PLAYWRIGHT_META_AI: AI_PROVIDER_IDS.PLAYWRIGHT_META_AI,
  };
  return map[providerType];
}
