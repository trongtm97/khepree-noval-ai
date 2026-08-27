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
  /**
   * When true (or pack.operationType is REPAIR/CONTINUATION), WebAPI FAT rebuild
   * swaps baseContext only and keeps operationPrompt unchanged.
   */
  preserveRepairPrompt?: boolean;
  /** Preferred Translation Notebook id from initial send (Playwright). */
  notebookId?: string | null;
  /** Thread ref from initial send when still valid. */
  threadRef?: string | null;
}

export interface AIStreamChunk {
  requestId: string;
  delta: string;
  done: boolean;
}
