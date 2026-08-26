import { describe, expect, it } from 'vitest';
import {
  mapTechnicalErrorToStatus,
  mapWorkerStatus,
  userMessageForStatus,
} from '@main/ai/error-map';
import { geminiWebSessionSecretKey } from '@shared/constants/ai-provider';

describe('AI error mapping', () => {
  it('maps quota / rate limit', () => {
    expect(mapTechnicalErrorToStatus('QUOTA_LIMIT')).toBe('RATE_LIMIT');
    expect(mapTechnicalErrorToStatus('429 Too Many Requests')).toBe('RATE_LIMIT');
  });

  it('maps session / login', () => {
    expect(mapTechnicalErrorToStatus('SESSION_EXPIRED cookie')).toBe('SESSION_EXPIRED');
    expect(mapTechnicalErrorToStatus('LOGIN_REQUIRED')).toBe('LOGIN_REQUIRED');
  });

  it('maps network / timeout', () => {
    expect(mapTechnicalErrorToStatus('ECONNREFUSED')).toBe('NETWORK_ERROR');
    expect(mapTechnicalErrorToStatus('ETIMEDOUT')).toBe('TIMEOUT');
  });

  it('maps worker status strings', () => {
    expect(mapWorkerStatus('SUCCESS')).toBe('SUCCESS');
    expect(mapWorkerStatus('RATE_LIMIT')).toBe('RATE_LIMIT');
    expect(mapWorkerStatus('weird')).toBe('ERROR');
  });

  it('returns Vietnamese user messages', () => {
    expect(userMessageForStatus('LOGIN_REQUIRED')).toContain('đăng nhập');
    expect(userMessageForStatus('RATE_LIMIT')).toContain('giới hạn');
  });
});

describe('gemini web session secret key', () => {
  it('prefixes account id', () => {
    expect(geminiWebSessionSecretKey('abc')).toBe('gemini_web_session:abc');
  });
});
