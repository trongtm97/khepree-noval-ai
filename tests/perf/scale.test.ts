/**
 * Performance smoke: large term vault + many chapters across projects.
 * Not a full UI load test — proves SQLite insert/query path stays usable.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { initializeDatabase, closeDatabase, getDatabase } from '@main/db/connection';
import { pathsService } from '@main/services/paths-service';
import { newId } from '@main/db/utils/uuid';
import { utcNow } from '@main/db/utils/timestamps';

const TERM_COUNT = 100_000;
const CHAPTER_COUNT = 2_000;
const PROJECT_COUNT = 3;

describe('Performance scale (release gate)', () => {
  let tempRoot: string;

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nts-perf-'));
    pathsService.initializeAt(tempRoot);
    initializeDatabase({
      dataDir: pathsService.getPath('data'),
      backupsDir: pathsService.getPath('backups'),
    });
  });

  afterEach(() => {
    closeDatabase();
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it(
    `inserts ${TERM_COUNT} terms and queries by source`,
    () => {
      const db = getDatabase().getConnection();
      const now = utcNow();
      const insert = db.prepare(
        `INSERT INTO terms (
          id, source_simplified, term_type, scope, status,
          confidence, occurrence_count, novel_count, locked, created_at, updated_at
        ) VALUES (?, ?, 'other', 'GLOBAL', 'ACTIVE', 0.5, 1, 0, 0, ?, ?)`,
      );

      const started = Date.now();
      const tx = db.transaction(() => {
        for (let i = 0; i < TERM_COUNT; i += 1) {
          insert.run(newId(), `源词${i}`, now, now);
        }
      });
      tx();
      const insertMs = Date.now() - started;

      const qStart = Date.now();
      const row = db
        .prepare(`SELECT source_simplified FROM terms WHERE source_simplified = ?`)
        .get(`源词${TERM_COUNT - 1}`) as { source_simplified: string } | undefined;
      const queryMs = Date.now() - qStart;

      expect(row?.source_simplified).toBe(`源词${TERM_COUNT - 1}`);
      expect(insertMs).toBeLessThan(120_000);
      expect(queryMs).toBeLessThan(2_000);

      const count = db.prepare(`SELECT COUNT(*) AS c FROM terms`).get() as { c: number };
      expect(count.c).toBe(TERM_COUNT);
    },
    180_000,
  );

  it(
    `creates ${PROJECT_COUNT} projects with ${CHAPTER_COUNT} chapters each`,
    () => {
      const db = getDatabase().getConnection();
      const now = utcNow();

      const insertProject = db.prepare(
        `INSERT INTO projects (id, title, source_language, target_language, status, created_at, updated_at)
         VALUES (?, ?, 'zh', 'vi', 'active', ?, ?)`,
      );
      const insertChapter = db.prepare(
        `INSERT INTO chapters (id, project_id, chapter_number, chapter_type, sequence_order, chapter_title, source_hash, status, created_at, updated_at)
         VALUES (?, ?, ?, 'NORMAL', ?, ?, ?, 'pending', ?, ?)`,
      );

      const started = Date.now();
      const tx = db.transaction(() => {
        for (let p = 0; p < PROJECT_COUNT; p += 1) {
          const projectId = newId();
          insertProject.run(projectId, `Perf Novel ${p}`, now, now);
          for (let c = 1; c <= CHAPTER_COUNT; c += 1) {
            insertChapter.run(
              newId(),
              projectId,
              c,
              c,
              `Chapter ${c}`,
              `hash-${p}-${c}`,
              now,
              now,
            );
          }
        }
      });
      tx();
      const elapsed = Date.now() - started;

      const chapters = db.prepare(`SELECT COUNT(*) AS c FROM chapters`).get() as { c: number };
      expect(chapters.c).toBe(PROJECT_COUNT * CHAPTER_COUNT);
      expect(elapsed).toBeLessThan(180_000);

      const one = db
        .prepare(
          `SELECT chapter_title FROM chapters WHERE project_id = (SELECT id FROM projects LIMIT 1) AND chapter_number = 2000`,
        )
        .get() as { chapter_title: string } | undefined;
      expect(one?.chapter_title).toBe('Chapter 2000');
    },
    240_000,
  );
});
