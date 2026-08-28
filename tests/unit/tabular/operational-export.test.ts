import { describe, expect, it } from 'vitest';
import {
  maskEmail,
  sanitizeOperationalJson,
  sanitizeOperationalText,
} from '@main/tabular/operational-sanitize';
import { buildJobsExportRows } from '@main/tabular/operational-export-builders';

describe('operational export sanitize', () => {
  it('redacts tokens and masks emails', () => {
    const text = 'Contact user@example.com with token ya29.abc-def';
    const out = sanitizeOperationalText(text, { sanitizeEmail: true });
    expect(out).not.toContain('user@example.com');
    expect(out).toContain('[REDACTED_TOKEN]');
    expect(maskEmail('user@example.com')).toBe('u***@example.com');
  });

  it('redacts forbidden json keys', () => {
    const json = sanitizeOperationalJson({
      access_token: 'secret',
      refresh_token: 'secret2',
      note: 'ok',
    });
    expect(json).toContain('[REDACTED]');
    expect(json).not.toContain('secret2');
    expect(json).toContain('ok');
  });
});

describe('operational jobs export', () => {
  it('maps job columns without raw credentials', () => {
    const rows = buildJobsExportRows({
      db: {
        projects: {
          getById: () => ({ id: 'p1', title: 'Novel' }),
        },
        translationEditions: {
          getById: () => ({ id: 'e1', name: 'VI', target_language: 'vi' }),
        },
        jobs: {
          listAll: () => [
            {
              id: 'job-1',
              project_id: 'p1',
              edition_id: 'e1',
              chapter_from: 1,
              chapter_to: 3,
              worker_id: 'worker-a',
              state: 'COMPLETED',
              started_at: '2025-01-01T00:00:00.000Z',
              completed_at: '2025-01-01T00:01:00.000Z',
              attempt_count: 2,
              error: null,
              progress: JSON.stringify({ providerType: 'gemini-web' }),
            },
          ],
          listAttempts: () => [
            {
              provider_type: 'gemini-web',
              account_id: 'acct-should-not-export',
            },
          ],
        },
      } as never,
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]?.job_id).toBe('job-1');
    expect(rows[0]?.chapters).toBe('1-3');
    expect(rows[0]?.worker).toBe('worker-a');
    expect(rows[0]?.provider).toBe('gemini-web');
    expect(rows[0]?.retry_count).toBe('2');
    expect(rows[0]?.duration).toBe('60000');
    expect(JSON.stringify(rows[0])).not.toContain('acct-should-not-export');
  });
});
