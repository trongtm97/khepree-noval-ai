import type {
  AiProviderStatus,
  AiProviderType,
  AiResponseStatus,
} from '@shared/constants/ai-provider';

export interface AIResponseUsage {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
}

export interface AIResponse {
  requestId: string;
  status: AiResponseStatus;
  text: string;
  usage?: AIResponseUsage;
  errorCode?: string | null;
  errorMessage?: string | null;
  providerType?: AiProviderType;
  providerId?: string;
}

export interface AIProviderHealth {
  ok: boolean;
  status: AiProviderStatus;
  message: string;
  accountEmail?: string | null;
  lastUsedAt?: string | null;
  lastError?: string | null;
}

export interface AIProviderStatusSnapshot {
  providerId: string;
  type: AiProviderType;
  ready: boolean;
  message: string;
}

export interface SendPromptOptions {
  requestId?: string;
  projectId?: string;
  /** Google worker account (Playwright) or linked identity. */
  googleAccountId?: string | null;
  /** Explicit AI account for Web API. */
  aiAccountId?: string | null;
  model?: string | null;
  jobId?: string | null;
  maxTimeoutMs?: number;
  headless?: boolean;
}

export type AIStreamChunk = {
  requestId: string;
  delta: string;
  done: boolean;
};
