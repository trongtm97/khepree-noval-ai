import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createDatabaseManager, closeDatabase } from '@main/db/connection';
import type { DatabaseManager } from '@main/db/database-manager';
import { recoverJobsGeminiAndProfilesOnStartup } from '@main/gemini/startup-recovery';
import { formatCorrelationMarker } from '@shared/constants/gemini';
import { newId } from '@main/db/utils/uuid';
import { pathsService } from '@main/services/paths-service';

describe('gemini_requests lifecycle persistence + startup recovery', () => {
  let db: DatabaseManager;
  let tmp: string;

  afterEach(() => {
    try {
      if (db) {
        db.close?.();
      }
      closeDatabase();
    } catch {
      // ignore
    }
    if (tmp) {
      try {
        fs.rmSync(tmp, { recursive: true, force: true });
      } catch {
        // Windows may keep lock briefly
      }
    }
  });

  function openDb() {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nts-gemini-life-'));
    pathsService.initializeAt(tmp);
    db = createDatabaseManager({
      dataDir: path.join(tmp, 'data'),
      backupsDir: path.join(tmp, 'bak'),
    });
    return db;
  }

  function seed(): { projectId: string; accountId: string; jobId: string } {
    const project = db.projects.create({
      title: 'Gemini Life',
      source_language: 'zh',
      target_language: 'vi',
    });
    const account = db.googleAccounts.create({
      label: 'Worker',
      email: 'w@example.com',
      profileDirName: `prof-${newId().slice(0, 8)}`,
      status: 'READY',
    });
    const job = db.jobs.create({
      project_id: project.id,
      type: 'TRANSLATE_CHAPTERS',
      state: 'RUNNING',
    });
    return { projectId: project.id, accountId: account.id, jobId: job.id };
  }

  it('persists correlation, marker, notebook, job, lifecycle timestamps', () => {
    openDb();
    const { projectId, accountId, jobId } = seed();
    const correlationId = newId();
    const row = db.geminiRequests.create({
      correlation_id: correlationId,
      project_id: projectId,
      google_account_id: accountId,
      pack_hash: 'abc',
      job_id: jobId,
      notebook_id: newId(),
      thread_ref: 'https://notebooklm.google.com/notebook/x',
    });

    expect(row.lifecycle).toBe('CREATED');
    expect(row.marker).toBe(formatCorrelationMarker(correlationId));
    expect(row.notebook_id).toBeTruthy();
    expect(row.thread_ref).toContain('notebook');
    expect(row.job_id).toBe(jobId);
    expect(row.lifecycle_at).toContain('CREATED');

    db.geminiRequests.setLifecycle(row.id, 'COMPOSER_FILLED');
    db.geminiRequests.setLifecycle(row.id, 'SEND_CLICKED');
    db.geminiRequests.setLifecycle(row.id, 'SENT_CONFIRMED');
    const after = db.geminiRequests.getById(row.id)!;
    expect(after.lifecycle).toBe('SENT_CONFIRMED');
    expect(after.status).toBe('running');
    const stamps = JSON.parse(after.lifecycle_at!) as Record<string, string>;
    expect(stamps.CREATED).toBeTruthy();
    expect(stamps.SENT_CONFIRMED).toBeTruthy();
  });

  it('idempotent findOpenByJobAndPack does not create duplicates', () => {
    openDb();
    const { projectId, accountId, jobId } = seed();
    const a = db.geminiRequests.create({
      correlation_id: newId(),
      project_id: projectId,
      google_account_id: accountId,
      pack_hash: 'pack-1',
      job_id: jobId,
    });
    db.geminiRequests.setLifecycle(a.id, 'SENT_CONFIRMED');
    const found = db.geminiRequests.findOpenByJobAndPack(jobId, 'pack-1');
    expect(found?.id).toBe(a.id);
  });

  it('startup: pre-send abandoned; post-send UNKNOWN_AFTER_CRASH; attempts CRASHED', () => {
    openDb();
    const { projectId, accountId, jobId } = seed();
    const now = new Date().toISOString();
    const attemptId = newId();
    db.getConnection()
      .prepare(
        `INSERT INTO job_attempts (
          id, job_id, attempt_number, state, created_at, updated_at
        ) VALUES (?, ?, 1, 'RUNNING', ?, ?)`,
      )
      .run(attemptId, jobId, now, now);

    const beforeSend = db.geminiRequests.create({
      correlation_id: newId(),
      project_id: projectId,
      google_account_id: accountId,
      pack_hash: 'h1',
      job_id: jobId,
      lifecycle: 'COMPOSER_FILLED',
    });
    const afterSend = db.geminiRequests.create({
      correlation_id: newId(),
      project_id: projectId,
      google_account_id: accountId,
      pack_hash: 'h2',
      job_id: jobId,
      lifecycle: 'SENT_CONFIRMED',
    });

    const report = recoverJobsGeminiAndProfilesOnStartup(db, { profilesRoot: null });
    expect(report.crashedAttempts).toBeGreaterThanOrEqual(1);
    expect(report.geminiAbandonedBeforeSend).toBeGreaterThanOrEqual(1);
    expect(report.geminiUnknownAfterCrash).toBeGreaterThanOrEqual(1);

    expect(db.geminiRequests.getById(beforeSend.id)?.lifecycle).toBe('FAILED');
    expect(db.geminiRequests.getById(beforeSend.id)?.error_code).toBe('CRASH_BEFORE_SEND');
    expect(db.geminiRequests.getById(afterSend.id)?.lifecycle).toBe('UNKNOWN_AFTER_CRASH');

    const attempt = db
      .getConnection()
      .prepare(`SELECT state FROM job_attempts WHERE id = ?`)
      .get(attemptId) as { state: string };
    expect(attempt.state).toBe('CRASHED');
  });
});
