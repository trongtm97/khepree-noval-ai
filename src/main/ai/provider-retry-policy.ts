import type { AiResponseStatus } from '@shared/constants/ai-provider';
import type { ClassifiedResponseError } from '@shared/utils/provider-response-classifier';

export type SendConfirmationState = 'none' | 'confirmed' | 'unknown';

/** Whether a failed chunk may be retried in-place (same provider/account). */
export function mayRetryChunk(input: {
  status: AiResponseStatus;
  errorCode?: string | null;
  classified?: ClassifiedResponseError | null;
  sendConfirmation: SendConfirmationState;
  attempt: number;
  maxAttempts: number;
}): boolean {
  if (input.attempt >= input.maxAttempts) return false;

  // Send confirmed but response unknown — recover conversation first, do not resend.
  if (input.sendConfirmation === 'confirmed' && input.status === 'TIMEOUT') {
    return false;
  }
  if (input.sendConfirmation === 'unknown') {
    return false;
  }

  const transient = new Set<AiResponseStatus>([
    'NETWORK_ERROR',
    'TIMEOUT',
    'SERVICE_UNAVAILABLE',
    'RATE_LIMIT',
  ]);
  if (transient.has(input.status)) return true;

  if (
    input.errorCode === 'AI_SOFT_ERROR' ||
    input.classified === 'CONTENT_REJECTED' ||
    input.classified === 'SERVICE_UNAVAILABLE'
  ) {
    return input.sendConfirmation === 'none';
  }

  return false;
}

/** Whether fallback to another provider+account is allowed. */
export function mayFallbackProvider(input: {
  sendConfirmation: SendConfirmationState;
  status: AiResponseStatus;
  fallbackEnabled: boolean;
  hasNextProvider: boolean;
}): boolean {
  if (!input.fallbackEnabled || !input.hasNextProvider) return false;

  // Sent-confirmed unknown: do not duplicate prompt on another provider yet.
  if (input.sendConfirmation === 'confirmed' || input.sendConfirmation === 'unknown') {
    return false;
  }

  return true;
}

/** Whether a soft-error chunk should be split and re-queued. */
export function shouldSplitChunkOnSoftError(input: {
  classified: ClassifiedResponseError | null;
  paragraphCount: number;
  sendConfirmation: SendConfirmationState;
}): boolean {
  if (input.paragraphCount < 2) return false;
  if (input.sendConfirmation !== 'none') return false;
  return input.classified === 'CONTENT_REJECTED' || input.classified === 'SERVICE_UNAVAILABLE';
}
