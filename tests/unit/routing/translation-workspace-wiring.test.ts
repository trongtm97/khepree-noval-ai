/**
 * @vitest-environment jsdom
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('canonical translation workspace wiring', () => {
  it('TranslationEditorPage delegates to controller hook only', () => {
    const pagePath = resolve(
      process.cwd(),
      'src/renderer/pages/TranslationEditorPage.tsx',
    );
    const source = readFileSync(pagePath, 'utf8');
    expect(source).toContain('useTranslationEditorController');
    expect(source).not.toMatch(/page-header-row|TranslationHeader|TranslationToolbar/);
  });

  it('controller composes TranslationCommandBar and TranslationWorkspace', () => {
    const hookPath = resolve(
      process.cwd(),
      'src/renderer/features/translation/hooks/useTranslationEditorController.tsx',
    );
    const source = readFileSync(hookPath, 'utf8');
    expect(source).toContain('TranslationCommandBar');
    expect(source).toContain('TranslationWorkspace');
    expect(source).not.toContain('ChapterNavigator');
    expect(source).not.toMatch(/page-header-row|Dịch tự động/);
  });

  it('AppShell applies translation-focus class on workspace routes', () => {
    const shellPath = resolve(process.cwd(), 'src/renderer/layouts/AppShell.tsx');
    const source = readFileSync(shellPath, 'utf8');
    expect(source).toContain('isTranslationWorkspaceRoute');
    expect(source).toContain('app-shell--translation-focus');
    expect(source).toContain('app-shell--editor-focus');
  });

  it('keeps version history on-demand and search as overlay', () => {
    const bilingual = readFileSync(
      resolve(process.cwd(), 'src/renderer/components/translation/BilingualEditor.tsx'),
      'utf8',
    );
    expect(bilingual).toContain('Drawer');
    expect(bilingual).toContain('historyOpen');
    expect(bilingual).not.toMatch(/<VersionHistoryPanel[\s\S]*\/>\s*<\/div>/);

    const hook = readFileSync(
      resolve(
        process.cwd(),
        'src/renderer/features/translation/hooks/useTranslationEditorController.tsx',
      ),
      'utf8',
    );
    expect(hook).toContain('TranslationSearchOverlay');
    expect(hook).toContain('event.shiftKey');
    expect(hook).toContain('toggleFocusMode');
  });

  it('command bar uses action hierarchy layout', () => {
    const commandBar = readFileSync(
      resolve(process.cwd(), 'src/renderer/components/translation/TranslationCommandBar.tsx'),
      'utf8',
    );
    const actions = readFileSync(
      resolve(process.cwd(), 'src/renderer/components/translation/TranslationActions.tsx'),
      'utf8',
    );
    expect(commandBar).toContain('translation-command-bar__chapter-nav');
    expect(commandBar).toContain('translation-command-bar__split-action');
    expect(commandBar).not.toContain('onNextUntranslated');
    expect(actions).toContain('translation-action-split__main');
    expect(actions).toContain('translateSettings');
  });

  it('collapsed workspace grid uses context rail not panel width', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/renderer/styles/ui.css'), 'utf8');
    expect(css).toMatch(
      /\.translation-workspace \{[\s\S]*minmax\(0,\s*1fr\)[\s\S]*--context-rail-width/,
    );
    expect(css).toContain('translation-workspace--context-expanded');
    expect(css).toContain('chapter-nav-header--stacked');
    expect(css).toContain('chapter-rail-edge-toggle');
    expect(css).toContain('translation-context--overlay');
  });

  it('translation workspace uses one ChapterNavigator, not an inline chapters.map', () => {
    const workspace = readFileSync(
      resolve(process.cwd(), 'src/renderer/components/translation/TranslationWorkspace.tsx'),
      'utf8',
    );
    expect(workspace).toContain('ChapterNavigator');
    expect(workspace).not.toMatch(/chapters\.map\(/);

    const navigator = readFileSync(
      resolve(process.cwd(), 'src/renderer/components/translation/ChapterNavigator.tsx'),
      'utf8',
    );
    expect(navigator).toContain('useVirtualizer');
    expect(navigator).toContain('chapterSelectMultiple');
  });
});
