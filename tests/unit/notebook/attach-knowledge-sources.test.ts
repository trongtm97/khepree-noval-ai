import { describe, expect, it, vi } from 'vitest';
import { AutomationError } from '@main/automation/errors/automation-errors';
import { attachKnowledgeSources } from '@main/notebook/attach-knowledge-sources';
import {
  classifyNotebookSourcePresence,
  hasDriveLivePresence,
  listStaticDuplicateNames,
} from '@main/notebook/notebook-source-presence';
import { KNOWLEDGE_PROJECT_DOC_TITLES } from '@shared/constants/notebook-source-binding';

function mockProvider(overrides: Partial<{
  file: ReturnType<typeof vi.fn>;
  text: ReturnType<typeof vi.fn>;
  present: string[];
}> = {}) {
  let present = [...(overrides.present ?? [])];
  return {
    addFileSources:
      overrides.file ??
      vi.fn((paths: string[]) => {
        const added = paths.map((p) => p.split('/').pop() ?? p);
        present = [...present, ...added];
        return Promise.resolve({ added, skipped: [] });
      }),
    addTextSources:
      overrides.text ??
      vi.fn((sources: { name: string }[]) => {
        const added = sources.map((s) => s.name);
        present = [...present, ...added];
        return Promise.resolve({ added, skipped: [] });
      }),
    verifySources: vi.fn((expected: string[]) => {
      const missing = expected.filter((n) => !present.includes(n));
      return Promise.resolve({ ok: missing.length === 0, missing, present: [...present] });
    }),
    readSourceNames: vi.fn(() => Promise.resolve([...present])),
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

describe('attachKnowledgeSources (local file first)', () => {
  const sourceNames = [...KNOWLEDGE_PROJECT_DOC_TITLES];
  const knowledgeSources = sourceNames.map((n) => ({
    name: `${n}.md`,
    content: `# ${n}`,
  }));
  const filePaths = knowledgeSources.map((s) => `/tmp/${s.name}`);

  it('uses STATIC_UPLOAD when file upload succeeds', async () => {
    const provider = mockProvider();
    const result = await attachKnowledgeSources({
      provider,
      knowledgeSources,
      filePaths,
    });
    expect(result.bindingType).toBe('STATIC_UPLOAD');
    expect(provider.addFileSources).toHaveBeenCalled();
    expect(provider.addTextSources).not.toHaveBeenCalled();
  });

  it('falls back to COPIED_TEXT when file upload unavailable', async () => {
    const provider = mockProvider({
      file: vi.fn(() =>
        Promise.reject(new AutomationError('SELECTOR_NOT_FOUND', 'no file')),
      ),
      text: vi.fn(() =>
        Promise.resolve({
          added: knowledgeSources.map((s) => s.name),
          skipped: [],
        }),
      ),
    });
    const result = await attachKnowledgeSources({
      provider,
      knowledgeSources,
      filePaths,
    });
    expect(result.bindingType).toBe('COPIED_TEXT');
    expect(provider.addTextSources).toHaveBeenCalled();
  });

  it('always prefers file upload first', async () => {
    const provider = mockProvider();
    const result = await attachKnowledgeSources({
      provider,
      knowledgeSources,
      filePaths,
    });
    expect(result.bindingType).toBe('STATIC_UPLOAD');
    expect(provider.addFileSources).toHaveBeenCalled();
  });
});
