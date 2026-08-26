import type { TranslationPackDto } from '@shared/schemas/translation-pack';
import type { AiProviderType } from '@shared/constants/ai-provider';
import type {
  AIProviderHealth,
  AIProviderStatusSnapshot,
  AIResponse,
  AIStreamChunk,
  SendPromptOptions,
} from './types';

/**
 * Backend-agnostic AI provider.
 * Translation Engine must not know Playwright vs Web API vs Official.
 */
export interface IAIProvider {
  readonly providerId: string;
  readonly providerType: AiProviderType;

  initialize(): Promise<void>;
  healthCheck(): Promise<AIProviderHealth>;
  sendPrompt(pack: TranslationPackDto, options?: SendPromptOptions): Promise<AIResponse>;
  cancelRequest(requestId: string): Promise<void>;
  getStatus(): Promise<AIProviderStatusSnapshot>;
  close(): Promise<void>;

  /** Optional streaming — backends may omit until supported. */
  streamResponse?(
    pack: TranslationPackDto,
    options?: SendPromptOptions,
  ): AsyncIterable<AIStreamChunk>;
}
