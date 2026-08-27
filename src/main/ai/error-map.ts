import {
  AI_ERROR_MESSAGES_VI,
  type AiResponseStatus,
} from '@shared/constants/ai-provider';

const PATTERNS: { status: AiResponseStatus; re: RegExp }[] = [
  { status: 'LOGIN_REQUIRED', re: /LOGIN_REQUIRED|login required|sign.?in|auth/i },
  { status: 'SESSION_EXPIRED', re: /SESSION_EXPIRED|session.?expir|cookie.?expir|AuthError|401/i },
  { status: 'RATE_LIMIT', re: /RATE_LIMIT|QUOTA_LIMIT|quota|rate.?limit|429|too many/i },
  { status: 'TIMEOUT', re: /TIMEOUT|SEND_NOT_CONFIRMED|RESPONSE_NOT_FOUND|RESPONSE_AMBIGUOUS|OUTPUT_INCOMPLETE|timed?\s*out|ETIMEDOUT/i },
  { status: 'ERROR', re: /PROMPT_TOO_LARGE|GENERATION_ERROR|too large|truncated/i },
  { status: 'NETWORK_ERROR', re: /NETWORK|ECONNREFUSED|ENOTFOUND|fetch failed|socket/i },
  {
    status: 'SERVICE_UNAVAILABLE',
    re: /SERVICE_UNAVAILABLE|unavailable|503|502|worker.*(down|crash|not)|already in use|profile lock/i,
  },
];

export function mapTechnicalErrorToStatus(
  codeOrMessage: string | null | undefined,
): AiResponseStatus {
  if (!codeOrMessage) return 'UNKNOWN';
  for (const { status, re } of PATTERNS) {
    if (re.test(codeOrMessage)) return status;
  }
  return 'ERROR';
}

export function userMessageForStatus(status: AiResponseStatus): string {
  return AI_ERROR_MESSAGES_VI[status] || AI_ERROR_MESSAGES_VI.UNKNOWN;
}

export function mapWorkerStatus(raw: string | undefined | null): AiResponseStatus {
  if (!raw) return 'UNKNOWN';
  const upper = raw.toUpperCase();
  const allowed: AiResponseStatus[] = [
    'SUCCESS',
    'ERROR',
    'LOGIN_REQUIRED',
    'SESSION_EXPIRED',
    'RATE_LIMIT',
    'TIMEOUT',
    'NETWORK_ERROR',
    'SERVICE_UNAVAILABLE',
    'UNKNOWN',
  ];
  if ((allowed as string[]).includes(upper)) {
    return upper as AiResponseStatus;
  }
  return mapTechnicalErrorToStatus(raw);
}
