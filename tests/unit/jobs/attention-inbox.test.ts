import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { closeDatabase, getDatabase, initializeDatabase } from '@main/db/connection';
import { pathsService } from '@main/services/paths-service';
import {
  getAttentionInboxService,
  resetAttentionInboxServiceForTests,
} from '@main/services/attention-inbox-service';
import { sanitizeTechDetail } from '@main/db/repositories/attention-inbox-repository';
import { buildAttentionDedupeKey } from '@shared/constants/attention-inbox';

describe('Prompt 11 — Attention Inbox', () => {
  let tempRoot: string;

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nts-attn11-'));
    pathsService.initializeAt(tempRoot);
    initializeDatabase({
      dataDir: pathsService.getPath('data'),
      backupsDir: pathsService.getPath('backups'),
    });
    resetAttentionInboxServiceForTests();
  });

  afterEach(() => {
    resetAttentionInboxServiceForTests();
    closeDatabase();
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it('dedupes many jobs for one account into one OPEN row + scope', () => {
    const svc = getAttentionInboxService(getDatabase());
    const accountId = 'acc-login-1';
    const a = svc.upsertFromJob({
      jobId: '11111111-1111-4111-8111-111111111111',
      projectId: '22222222-2222-4222-8222-222222222222',
      reason: 'LOGIN_REQUIRED',
      error: 'session expired',
      accountId,
      accountKind: 'AI_ACCOUNT',
    });
    const b = svc.upsertFromJob({
      jobId: '33333333-3333-4333-8333-333333333333',
      projectId: '44444444-4444-4444-8444-444444444444',
      reason: 'LOGIN_REQUIRED',
      error: 'session expired again',
      accountId,
      accountKind: 'AI_ACCOUNT',
    });

    expect(b.id).toBe(a.id);
    expect(svc.countOpen()).toBe(1);
    expect(b.affectedScope.jobIds).toEqual(
      expect.arrayContaining([
        '11111111-1111-4111-8111-111111111111',
        '33333333-3333-4333-8333-333333333333',
      ]),
    );
    expect(b.affectedScope.projectIds.length).toBeGreaterThanOrEqual(2);
  });

  it('reopens after resolve when cause recurs', () => {
    const svc = getAttentionInboxService(getDatabase());
    const first = svc.upsert({
      type: 'PROVIDER_UNAVAILABLE',
      causeCode: 'PROVIDER_DOWN',
      projectId: '55555555-5555-4555-8555-555555555555',
      jobId: '66666666-6666-4666-8666-666666666666',
    });
    svc.act(first.id, 'RESOLVE');
    expect(svc.countOpen()).toBe(0);

    const again = svc.upsert({
      type: 'PROVIDER_UNAVAILABLE',
      causeCode: 'PROVIDER_DOWN',
      projectId: '55555555-5555-4555-8555-555555555555',
      jobId: '77777777-7777-4777-8777-777777777777',
    });
    expect(again.status).toBe('OPEN');
    expect(svc.countOpen()).toBe(1);
    expect(again.dedupeKey).toBe(first.dedupeKey);
  });

  it('snooze hides from OPEN until unsnooze/expiry path', () => {
    const svc = getAttentionInboxService(getDatabase());
    const item = svc.upsert({
      type: 'EXPORT_FAILED',
      causeCode: 'EXPORT_IO',
      projectId: '88888888-8888-4888-8888-888888888888',
    });
    svc.act(item.id, 'SNOOZE', { snoozeMinutes: 60 });
    expect(svc.countOpen()).toBe(0);
    const row = getDatabase().attentionInbox.getById(item.id);
    expect(row?.status).toBe('SNOOZED');
    expect(row?.snoozed_until).toBeTruthy();
  });

  it('auto-resolve when job reaches terminal success', () => {
    const db = getDatabase();
    const project = db.projects.create({ title: 'Inbox Project' });
    const job = db.jobs.create({
      project_id: project.id,
      type: 'TRANSLATE_BATCH',
      state: 'NEEDS_ATTENTION',
    });
    const svc = getAttentionInboxService(db);
    const item = svc.upsertFromJob({
      jobId: job.id,
      projectId: project.id,
      reason: 'PIPELINE_BLOCKED',
      error: 'stage failed',
    });
    expect(svc.countOpen()).toBe(1);

    db.jobs.updateState(job.id, 'COMPLETED');
    const result = svc.reconcile();
    expect(result.resolved).toBeGreaterThanOrEqual(1);
    expect(svc.countOpen()).toBe(0);
    expect(db.attentionInbox.getById(item.id)?.status).toBe('RESOLVED');
  });

  it('bulk retry skips CAPTCHA/LOGIN even when ids passed', () => {
    const svc = getAttentionInboxService(getDatabase());
    const login = svc.upsert({
      type: 'LOGIN_REQUIRED',
      accountId: 'acc-1',
      causeCode: 'LOGIN',
    });
    const captcha = svc.upsert({
      type: 'CAPTCHA_REQUIRED',
      accountId: 'acc-2',
      causeCode: 'CAPTCHA',
    });
    const blocked = svc.upsert({
      type: 'PIPELINE_BLOCKED',
      causeCode: 'STAGE',
      jobId: '99999999-9999-4999-8999-999999999999',
      projectId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    });

    const byIds = svc.bulkRetry({
      itemIds: [login.id, captcha.id, blocked.id],
    });
    expect(byIds.skippedProactive).toBe(2);
    expect(byIds.attempted).toBe(1);

    const all = svc.bulkRetry({ allRetryable: true });
    // listRetryableOpen already excludes proactive — only pipeline attempted
    expect(all.attempted).toBe(1);
    expect(all.skippedProactive).toBe(0);
  });

  it('sanitizeTechDetail redacts secrets and stacks', () => {
    const raw = [
      'cookie: abcdef.secret.value',
      'Authorization: Bearer tok_123',
      '    at Object.foo (/app/x.ts:1:1)',
      'SYSTEM: long prompt '.repeat(40),
    ].join('\n');
    const clean = sanitizeTechDetail(raw)!;
    expect(clean.toLowerCase()).not.toContain('tok_123');
    expect(clean).not.toMatch(/^\s+at\s+/m);
    expect(clean).toMatch(/redacted|prompt redacted/i);
  });

  it('dedupe key omits jobId', () => {
    const key = buildAttentionDedupeKey({
      type: 'QA_CRITICAL',
      projectId: 'p1',
      jobId: 'j1',
      causeCode: 'QA',
    });
    expect(key).not.toContain('j1');
    expect(key.startsWith('QA_CRITICAL|')).toBe(true);
  });
});
