import { describe, expect, it } from 'vitest';
import { KhepreeAuthTokenResultSchema } from '@shared/schemas/khepree-api';
import { KhepreeApiResponseInvalidError } from '@main/khepree/errors';
import type { ZodType } from 'zod';

function parseApiResponse<T>(schema: ZodType<T>, body: unknown, context: string): T {
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new KhepreeApiResponseInvalidError(context);
  }
  return parsed.data;
}

describe('Khepree API response schemas', () => {
  it('accepts valid auth token payload', () => {
    const result = parseApiResponse(
      KhepreeAuthTokenResultSchema,
      {
        accessToken: 'at-1',
        refreshToken: 'rt-1',
        expiresIn: 3600,
        user: { id: 'u1', email: 'a@b.com', displayName: 'User' },
      },
      'auth/refresh',
    );
    expect(result.accessToken).toBe('at-1');
  });

  it('rejects malformed auth token payload', () => {
    expect(() =>
      parseApiResponse(
        KhepreeAuthTokenResultSchema,
        { accessToken: 'at-1', refreshToken: 'rt-1' },
        'auth/refresh',
      ),
    ).toThrow(KhepreeApiResponseInvalidError);
  });

  it('rejects invalid email in user object', () => {
    expect(() =>
      parseApiResponse(
        KhepreeAuthTokenResultSchema,
        {
          accessToken: 'at-1',
          refreshToken: 'rt-1',
          expiresIn: 3600,
          user: { id: 'u1', email: 'not-an-email', displayName: null },
        },
        'auth/device/complete',
      ),
    ).toThrow(KhepreeApiResponseInvalidError);
  });
});
