import { describe, expect, it, vi } from 'vitest';
import { AutomationError } from '@main/automation/errors/automation-errors';
import { attachKnowledgeSources } from '@main/notebook/attach-knowledge-sources';
import {
  classifyNotebookSourcePresence,
  hasDriveLivePresence,
  listStaticDuplicateNames,
} from '@main/notebook/notebook-source-presence';
import { DRIVE_PROJECT_DOC_TITLES } from '@shared/constants/notebook-source-binding';

function mockProvider(overrides: Partial<{
  drive: ReturnType<typeof vi.fn>;
  file: ReturnType<typeof vi.fn>;
  text: ReturnType<typeof vi.fn>;
  present: string[];
  remove: ReturnType<typeof vi.fn>;
}> = {}) {
  let present = [...(overrides.present ?? [])];
  return {
    addDriveSources:
      overrides.drive ??
      vi.fn((names: string[]) => {
        const added: string[] = [];
        const skipped: string[] = [];
        for (const n of names) {
          if (hasDriveLivePresence(present, n)) skipped.push(n);
          else {
            present = [...present, n];
            added.push(n);
          }
        }
        return Promise.resolve({ added, skipped });
      }),
    addFileSources:
      overrides.file ??
      vi.fn(() => Promise.reject(new AutomationError('SELECTOR_NOT_FOUND', 'no file'))),
    addTextSources:
      overrides.text ??
      vi.fn(() => Promise.reject(new AutomationError('SELECTOR_NOT_FOUND', 'no text'))),
    verifySources: vi.fn((expected: string[]) => {
      const missing = expected.filter((n) => !hasDriveLivePresence(present, n));
      return Promise.resolve({ ok: missing.length === 0, missing, present: [...present] });
    }),
    readSourceNames: vi.fn(() => Promise.resolve([...present])),
    removeSourcesByNames: overrides.remove,
  };
}

describe('notebook source presence', () => {
  it('classifies static vs drive-like', () => {
    expect(classifyNotebookSourcePresence('03_CHARACTERS.md')).toBe('static_upload');
    expect(classifyNotebookSourcePresence('03_CHARACTERS (1)')).toBe('duplicate_artifact');
    expect(classifyNotebookSourcePresence('03_CHARACTERS copy')).toBe('duplicate_artifact');
    expect(classifyNotebookSourcePresence('03_CHARACTERS')).toBe('drive_like');
  });

  it('detects Drive LIVE even when static .md also present', () => {
    const present = ['03_CHARACTERS.md', '03_CHARACTERS'];
    expect(hasDriveLivePresence(present, '03_CHARACTERS')).toBe(true);
    expect(listStaticDuplicateNames(present, ['03_CHARACTERS'])).toEqual([
      '03_CHARACTERS.md',
    ]);
  });

  it('does not treat .md-only as Drive LIVE', () => {
    expect(hasDriveLivePresence(['03_CHARACTERS.md'], '03_CHARACTERS')).toBe(false);
  });
});

describe('attachKnowledgeSources priority', () => {
  const driveNames = [...DRIVE_PROJECT_DOC_TITLES];
  const knowledgeSources = driveNames.map((n) => ({
    name: `${n}.md`,
    content: `# ${n}`,
  }));
  const filePaths = knowledgeSources.map((s) => `/tmp/${s.name}`);

  it('Translation: prefers Drive LIVE over file/text', async () => {
    const provider = mockProvider();
    const result = await attachKnowledgeSources({
      provider,
      driveSourceNames: driveNames,
      knowledgeSources,
      filePaths,
      preferDriveLive: true,
    });
    expect(result.bindingType).toBe('DRIVE_LIVE');
    expect(provider.addDriveSources).toHaveBeenCalled();
    expect(provider.addFileSources).not.toHaveBeenCalled();
    expect(result.added).toHaveLength(9);
  });

  it('Translation: falls back to STATIC_UPLOAD when Drive picker missing', async () => {
    const provider = mockProvider({
      drive: vi.fn(() =>
        Promise.reject(new AutomationError('SELECTOR_NOT_FOUND', 'no drive')),
      ),
      file: vi.fn(() =>
        Promise.resolve({
          added: knowledgeSources.map((s) => s.name),
          skipped: [],
        }),
      ),
    });
    const result = await attachKnowledgeSources({
      provider,
      driveSourceNames: driveNames,
      knowledgeSources,
      filePaths,
      preferDriveLive: true,
    });
    expect(result.bindingType).toBe('STATIC_UPLOAD');
    expect(result.needsMigration.length).toBeGreaterThan(0);
  });

  it('legacy file-first path still works when preferDriveLive=false', async () => {
    const provider = mockProvider({
      file: vi.fn(() => Promise.resolve({ added: ['00_BOOK_PROFILE.md'], skipped: [] })),
    });
    const result = await attachKnowledgeSources({
      provider,
      driveSourceNames: driveNames,
      knowledgeSources,
      filePaths,
      preferDriveLive: false,
    });
    expect(result.bindingType).toBe('STATIC_UPLOAD');
    expect(provider.addDriveSources).not.toHaveBeenCalled();
  });

  it('does not re-add Drive when Drive LIVE already present (no duplicates)', async () => {
    const provider = mockProvider({
      present: [...driveNames],
    });
    const result = await attachKnowledgeSources({
      provider,
      driveSourceNames: driveNames,
      knowledgeSources,
      filePaths,
      preferDriveLive: true,
    });
    expect(result.bindingType).toBe('DRIVE_LIVE');
    expect(result.added).toHaveLength(0);
    expect(result.skipped).toHaveLength(9);
  });

  it('migrates static: adds Drive LIVE then retires .md duplicates', async () => {
    const remove = vi.fn((names: string[]) =>
      Promise.resolve({ removed: names, failed: [] }),
    );
    const provider = mockProvider({
      present: knowledgeSources.map((s) => s.name),
      remove,
    });
    const result = await attachKnowledgeSources({
      provider,
      driveSourceNames: driveNames,
      knowledgeSources,
      filePaths,
      preferDriveLive: true,
    });
    expect(result.bindingType).toBe('DRIVE_LIVE');
    expect(result.added).toHaveLength(9);
    expect(remove).toHaveBeenCalled();
    expect(result.staticRemaining).toEqual([]);
  });

  it('marks NEEDS_MIGRATION when static cannot be removed', async () => {
    const remove = vi.fn((names: string[]) =>
      Promise.resolve({ removed: [], failed: names }),
    );
    const provider = mockProvider({
      present: ['03_CHARACTERS.md'],
      remove,
    });
    const result = await attachKnowledgeSources({
      provider,
      driveSourceNames: ['03_CHARACTERS'],
      knowledgeSources: [{ name: '03_CHARACTERS.md', content: 'x' }],
      filePaths: ['/tmp/03_CHARACTERS.md'],
      preferDriveLive: true,
    });
    expect(result.needsMigration.length).toBeGreaterThan(0);
    expect(result.migrationGuide).toContain('Không tự xóa được');
  });
});
