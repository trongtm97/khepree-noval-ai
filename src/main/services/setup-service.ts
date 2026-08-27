import {
  SETUP_META_KEYS,
  normalizeSetupStep,
  type SetupWizardStep,
} from '@shared/constants/setup';
import type { SetupStatus } from '@shared/schemas/setup';
import type { DatabaseManager } from '../db/database-manager';
import { pathsService } from './paths-service';

export class SetupService {
  constructor(private readonly getDb: () => DatabaseManager) {}

  getStatus(): SetupStatus {
    const db = this.getDb();
    const completed = db.appMeta.get(SETUP_META_KEYS.completed) === '1';
    const explored = db.appMeta.get(SETUP_META_KEYS.explored) === '1';
    const stepRaw = db.appMeta.get(SETUP_META_KEYS.step);
    const step = normalizeSetupStep(stepRaw);
    const skippedDrive = db.appMeta.get(SETUP_META_KEYS.skippedDrive) === '1';

    const accountCount = db.googleAccounts.list().length;
    const projectCount = db.projects.list().length;
    const notebookReadyCount = db
      .getConnection()
      .prepare(`SELECT COUNT(*) AS c FROM notebook_resources WHERE status = 'ready'`)
      .get() as { c: number };

    return {
      completed,
      explored,
      step: completed ? 'createProject' : step,
      skippedDrive,
      storageRoot: pathsService.getPath('root'),
      accountCount,
      projectCount,
      notebookReadyCount: notebookReadyCount.c,
    };
  }

  setStep(step: SetupWizardStep): SetupStatus {
    const db = this.getDb();
    if (db.appMeta.get(SETUP_META_KEYS.completed) === '1') {
      return this.getStatus();
    }
    db.appMeta.set(SETUP_META_KEYS.step, step);
    return this.getStatus();
  }

  setSkipDrive(skip: boolean): SetupStatus {
    this.getDb().appMeta.set(SETUP_META_KEYS.skippedDrive, skip ? '1' : '0');
    return this.getStatus();
  }

  /**
   * Enter the app without finishing onboarding.
   * Does NOT set setup.completed — checklist stays honest.
   */
  explore(_confirm: true): { ok: true; explored: true; completed: false } {
    const db = this.getDb();
    if (db.appMeta.get(SETUP_META_KEYS.completed) === '1') {
      return { ok: true, explored: true, completed: false };
    }
    db.appMeta.set(SETUP_META_KEYS.explored, '1');
    return { ok: true, explored: true, completed: false };
  }

  complete(_confirm: true): { ok: true; completed: true } {
    const db = this.getDb();
    db.appMeta.set(SETUP_META_KEYS.completed, '1');
    db.appMeta.set(SETUP_META_KEYS.step, 'createProject');
    db.appMeta.set(SETUP_META_KEYS.explored, '0');
    return { ok: true, completed: true };
  }

  /** Tests / support: reopen wizard. */
  resetForTests(): void {
    const db = this.getDb();
    db.appMeta.delete(SETUP_META_KEYS.completed);
    db.appMeta.set(SETUP_META_KEYS.step, 'welcome');
    db.appMeta.delete(SETUP_META_KEYS.skippedDrive);
    db.appMeta.delete(SETUP_META_KEYS.explored);
  }
}
