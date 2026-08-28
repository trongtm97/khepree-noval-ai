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
});
