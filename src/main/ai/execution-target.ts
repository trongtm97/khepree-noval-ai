import type { AiProviderType } from '@shared/constants/ai-provider';
import { AI_PROVIDER_IDS } from '@shared/constants/ai-provider';
import type { SendPromptOptions } from './types';
import type { ExecutionTargetCapabilities } from './provider-capabilities';

export type {
  ProviderCapabilities as FullProviderCapabilities,
  ProviderHarnessTimeouts,
  ExecutionTargetCapabilities,
} from './provider-capabilities';
export {
  getProviderCapabilities,
  getProviderCapabilitiesById,
  isBrowserTransport,
  isBrowserTransportType,
  providerIdForType,
  PROVIDER_CAPABILITY_REGISTRY,
  executionTargetCapabilitiesFrom,
} from './provider-capabilities';

/** Which account table backs this execution target. */
export type ExecutionAccountKind = 'GOOGLE_ACCOUNT' | 'AI_ACCOUNT';

export type ExecutionTargetStatus =
  | 'READY'
  | 'BUSY'
  | 'PAUSED'
  | 'LIMITED'
  | 'LOGIN_REQUIRED'
  | 'NEEDS_ATTENTION';

/** Scheduling snapshot on {@link AiExecutionTarget} (subset of full capabilities). */
export type ProviderCapabilities = ExecutionTargetCapabilities;

/**
 * Provider-neutral execution worker — one schedulable browser/API slot.
 * workerId is stable: `<providerId>:<accountId>`.
 */
export interface AiExecutionTarget {
  workerId: string;
  providerId: string;
  providerType: AiProviderType;
  accountKind: ExecutionAccountKind;
  accountId: string;
  profileDirName?: string | null;
  /** Profile/account key for exclusive concurrency (one job per key). */
  concurrencyKey: string;
  status: ExecutionTargetStatus;
  capabilities: ExecutionTargetCapabilities;
  /** worker_states.id when target is backed by a Google worker row. */
  legacyWorkerStateId?: string | null;
}

/** Explicit account reference for preflight — no ambiguous bare accountId. */
export interface ProviderAccountRef {
  accountKind: ExecutionAccountKind;
  accountId: string;
  profileDirName?: string | null;
}

export function buildExecutionWorkerId(
  providerId: string,
  accountId: string,
): string {
  return `${providerId}:${accountId}`;
}

export function parseExecutionWorkerId(workerId: string): {
  providerId: string;
  accountId: string;
} | null {
  const idx = workerId.indexOf(':');
  if (idx <= 0) return null;
  return {
    providerId: workerId.slice(0, idx),
    accountId: workerId.slice(idx + 1),
  };
}

export function accountRefFromTarget(
  target: AiExecutionTarget,
): ProviderAccountRef {
  return {
    accountKind: target.accountKind,
    accountId: target.accountId,
    profileDirName: target.profileDirName ?? null,
  };
}

export function legacyGoogleAccountId(target: AiExecutionTarget): string | null {
  return target.accountKind === 'GOOGLE_ACCOUNT' ? target.accountId : null;
}

/**
 * Single helper for SendPromptOptions — callers must not build account fields ad hoc.
 */
export function buildSendPromptOptions(
  target: AiExecutionTarget,
  base?: Omit<SendPromptOptions, 'googleAccountId' | 'aiAccountId' | 'profileDirName'>,
): SendPromptOptions {
  const opts: SendPromptOptions = { ...base };
  if (target.accountKind === 'GOOGLE_ACCOUNT') {
    opts.googleAccountId = target.accountId;
    opts.aiAccountId = null;
  } else {
    opts.aiAccountId = target.accountId;
    opts.googleAccountId = null;
  }
  if (target.profileDirName) {
    opts.profileDirName = target.profileDirName;
  }
  return opts;
}

/** Provider id for Playwright Gemini Google workers. */
export const GOOGLE_GEMINI_PROVIDER_ID = AI_PROVIDER_IDS.PLAYWRIGHT_GEMINI;
