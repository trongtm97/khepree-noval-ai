import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { DatabaseManager } from '@main/db/database-manager';
import type { ProjectRow } from '@main/db/repositories/project-repository';
import { EXPORT_META_KEYS } from '@shared/constants/export-settings';
import { resolveExportDirectory } from '@main/portability/export-path-resolver';
import { validateExportDirectory } from '@main/portability/export-directory-validator';
import {
  buildChapterExportFilename,
  buildChapterRangeExportFilename,
  buildNovelExportFilename,
  sanitizeFilename,
} from '@shared/utils/sanitize-filename';

function mockDb(input: {
  project: Partial<ProjectRow> & Pick<ProjectRow, 'id' | 'title'>;
  meta?: Record<string, string>;
  editions?: { id: string; target_language: string; status: string }[];
}): DatabaseManager {
  const meta = new Map(Object.entries(input.meta ?? {}));
  return {
    projects: {
      getById: () =>
        ({
          export_directory: null,
          active_edition_id: null,
          ...input.project,
        }) as ProjectRow,
    },
    appMeta: {
      get: (key: string) => meta.get(key),
      set: (key: string, value: string) => {
        meta.set(key, value);
      },
      delete: (key: string) => {
        meta.delete(key);
      },
    },
    translationEditions: {
      listByProject: () => input.editions ?? [],
    },
  } as unknown as DatabaseManager;
}

describe('export-directory-validator', () => {
  it('validates writable directory', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nts-export-val-'));
    const result = validateExportDirectory(dir);
    expect(result.valid).toBe(true);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('rejects missing directory when create=false', () => {
    const result = validateExportDirectory(path.join(os.tmpdir(), 'nts-missing-export-dir'));
    expect(result.valid).toBe(false);
    expect(result.error).toBe('NOT_FOUND');
  });
});

describe('export-path-resolver', () => {
  it('uses global default with auto project subfolder', () => {
    const globalDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nts-global-'));
    const db = mockDb({
      project: { id: 'p1', title: 'Tiên Nghịch' },
      meta: {
        [EXPORT_META_KEYS.defaultDirectory]: globalDir,
        [EXPORT_META_KEYS.autoProjectSubfolder]: 'true',
      },
    });

    const resolved = resolveExportDirectory(db, { projectId: 'p1' });
    expect(resolved.status).toBe('ok');
    if (resolved.status === 'ok') {
      expect(resolved.source).toBe('auto_subfolder');
      expect(resolved.directory).toContain('Tiên Nghịch');
      expect(fs.existsSync(resolved.directory)).toBe(true);
    }
    fs.rmSync(globalDir, { recursive: true, force: true });
  });

  it('uses project override over global default', () => {
    const globalDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nts-global2-'));
    const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nts-project-'));
    const db = mockDb({
      project: { id: 'p1', title: 'Tiên Nghịch', export_directory: projectDir },
      meta: { [EXPORT_META_KEYS.defaultDirectory]: globalDir },
    });

    const resolved = resolveExportDirectory(db, { projectId: 'p1' });
    expect(resolved).toEqual({
      status: 'ok',
      directory: path.resolve(projectDir),
      source: 'project',
    });
    fs.rmSync(globalDir, { recursive: true, force: true });
    fs.rmSync(projectDir, { recursive: true, force: true });
  });

  it('returns inaccessible when project override is unavailable — no silent global fallback', () => {
    const db = mockDb({
      project: {
        id: 'p1',
        title: 'Tiên Nghịch',
        export_directory: 'E:\\Translations\\MissingOnTestMachine',
      },
      meta: {
        [EXPORT_META_KEYS.defaultDirectory]: fs.mkdtempSync(path.join(os.tmpdir(), 'nts-fallback-')),
      },
    });

    const resolved = resolveExportDirectory(db, { projectId: 'p1' });
    expect(resolved.status).toBe('inaccessible');
    if (resolved.status === 'inaccessible') {
      expect(resolved.source).toBe('project');
    }
  });

  it('returns missing when nothing configured', () => {
    const db = mockDb({ project: { id: 'p1', title: 'Tiên Nghịch' } });
    const resolved = resolveExportDirectory(db, { projectId: 'p1' });
    expect(resolved.status).toBe('missing');
  });

  it('adds language subfolder when multiple editions exist', () => {
    const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nts-multi-ed-'));
    const db = mockDb({
      project: {
        id: 'p1',
        title: 'Book',
        export_directory: baseDir,
        active_edition_id: 'e-vi',
      },
      editions: [
        { id: 'e-vi', target_language: 'vi', status: 'ACTIVE' },
        { id: 'e-en', target_language: 'en', status: 'ACTIVE' },
      ],
    });

    const resolved = resolveExportDirectory(db, { projectId: 'p1', editionId: 'e-vi' });
    expect(resolved.status).toBe('ok');
    if (resolved.status === 'ok') {
      expect(resolved.directory).toContain(`${path.sep}vi`);
    }
    fs.rmSync(baseDir, { recursive: true, force: true });
  });
});

describe('export-file-name-builder', () => {
  it('sanitizes invalid Windows characters and reserved names', () => {
    expect(sanitizeFilename('CON')).toBe('_CON');
    expect(sanitizeFilename('bad:name')).toBe('bad_name');
    expect(sanitizeFilename(' trailing ')).toBe('trailing');
  });

  it('builds chapter, range, and novel filenames', () => {
    expect(buildChapterExportFilename(451, 'Title', 'txt')).toBe('0451 - Title.txt');
    expect(buildChapterRangeExportFilename(1, 100, 'txt')).toBe('chapters-0001-0100.txt');
    expect(buildNovelExportFilename('Tiên Nghịch', 'docx')).toBe('Tiên Nghịch.docx');
  });

  it('supports Unicode paths in sanitized titles', () => {
    expect(buildChapterExportFilename(1, '仙逆', 'txt')).toBe('0001 - 仙逆.txt');
  });
});
