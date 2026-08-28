import { describe, expect, it } from 'vitest';
import {
  isTranslationFocusPath,
  isTranslationNavActive,
  isTranslationWorkspaceRoute,
  resolveTranslationDestination,
} from '../../../src/renderer/routing/translation-route-resolver';
import {
  isProjectTranslatePath,
  projectTabKeyFromPath,
} from '../../../src/renderer/layouts/ProjectWorkspace';

describe('translation-route-resolver', () => {
  it('prefers lastTranslationProjectId over currentProjectId', () => {
    const dest = resolveTranslationDestination({
      lastTranslationProjectId: 'proj-a',
      currentProjectId: 'proj-b',
      knownProjectIds: ['proj-a', 'proj-b'],
    });
    expect(dest).toEqual({
      kind: 'translate',
      path: '/projects/proj-a/translate',
      projectId: 'proj-a',
    });
  });

  it('falls back to currentProjectId when last is unknown', () => {
    const dest = resolveTranslationDestination({
      lastTranslationProjectId: 'gone',
      currentProjectId: 'proj-b',
      knownProjectIds: ['proj-b'],
    });
    expect(dest.path).toBe('/projects/proj-b/translate');
  });

  it('opens picker when no project context exists', () => {
    const dest = resolveTranslationDestination({
      lastTranslationProjectId: null,
      currentProjectId: null,
    });
    expect(dest).toEqual({
      kind: 'pick',
      path: '/translation/pick',
      projectId: null,
    });
  });
});

describe('translation focus shell mode', () => {
  it('detects project translate route', () => {
    expect(isProjectTranslatePath('/projects/abc/translate')).toBe(true);
    expect(isTranslationFocusPath('/projects/abc/translate')).toBe(true);
  });

  it('detects legacy translation routes', () => {
    expect(isTranslationFocusPath('/translation')).toBe(true);
    expect(isTranslationFocusPath('/editor')).toBe(true);
    expect(isTranslationFocusPath('/translation/pick')).toBe(true);
  });

  it('does not treat normal project pages as translation focus', () => {
    expect(isTranslationFocusPath('/projects/abc/chapters')).toBe(false);
    expect(isTranslationFocusPath('/projects')).toBe(false);
  });

  it('highlights translation nav on translate routes', () => {
    expect(isTranslationNavActive('/projects/x/translate')).toBe(true);
    expect(isTranslationNavActive('/translation/pick')).toBe(true);
    expect(isTranslationNavActive('/projects/x/chapters')).toBe(false);
  });

  it('isTranslationWorkspaceRoute matches focus paths', () => {
    expect(isTranslationWorkspaceRoute('/projects/abc/translate')).toBe(true);
    expect(isTranslationWorkspaceRoute('/translation')).toBe(true);
    expect(isTranslationWorkspaceRoute('/projects/abc/chapters')).toBe(false);
  });
});

describe('project workspace tabs', () => {
  it('maps translate route to global translation nav key', () => {
    expect(projectTabKeyFromPath('/projects/abc/translate')).toBe('nav.translation');
  });

  it('maps overview and chapters segments', () => {
    expect(projectTabKeyFromPath('/projects/abc')).toBe('projectNav.overview');
    expect(projectTabKeyFromPath('/projects/abc/chapters')).toBe('projectNav.chapters');
  });
});
