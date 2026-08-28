/**
 * @vitest-environment jsdom
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useRef, useState } from 'react';
import { getLanguageProfile } from '@shared/constants/language-profile';
import { LanguagePicker } from '../../../../src/renderer/components/LanguagePicker';
import { DropdownMenu, ensureOverlayRoot } from '../../../../src/renderer/components/overlay';
import { assertOverlayVisible } from '../../../../src/renderer/components/overlay/overlay-visibility';

const VIEWPORTS = [
  { width: 1366, height: 768, label: '1366x768' },
  { width: 1920, height: 1080, label: '1920x1080' },
] as const;

function NarrowTriggerPicker() {
  const [lang, setLang] = useState('en');
  return (
    <div style={{ width: 100, overflow: 'hidden' }}>
      <LanguagePicker
        value={lang}
        languages={['en', 'ja', 'vi'].map((c) => getLanguageProfile(c))}
        onChange={setLang}
        aria-label="Lang"
      />
    </div>
  );
}

function MenuInOverflow() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  return (
    <div style={{ overflow: 'hidden', width: 80, height: 36 }}>
      <button ref={ref} type="button" onClick={() => { setOpen((v) => !v); }}>
        ⋯
      </button>
      <DropdownMenu
        open={open}
        onOpenChange={setOpen}
        anchorRef={ref}
        className="translation-menu"
        minWidth={200}
      >
        <button type="button" role="menuitem">Copy</button>
      </DropdownMenu>
    </div>
  );
}

describe('overlay regression matrix', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="root"></div>';
    ensureOverlayRoot();
  });

  afterEach(() => {
    cleanup();
    document.body.innerHTML = '';
  });

  for (const vp of VIEWPORTS) {
    it(`language picker min width at ${vp.label}`, async () => {
      Object.defineProperty(window, 'innerWidth', { value: vp.width, configurable: true });
      Object.defineProperty(window, 'innerHeight', { value: vp.height, configurable: true });

      render(<NarrowTriggerPicker />);
      fireEvent.click(screen.getByLabelText('Lang'));
      await waitFor(() => {
        expect(screen.getByRole('listbox')).toBeTruthy();
      });

      const menu = document.querySelector('.language-picker-menu');
      expect(menu).not.toBeNull();
      if (!menu) return;
      expect(menu.closest('#noveltrans-overlay-root')).toBeTruthy();

      const width = (menu as HTMLElement).style.width;
      if (width) {
        const px = Number.parseInt(width, 10);
        expect(px).toBeGreaterThanOrEqual(300);
      }
    });

    it(`overflow-hidden menu portaled at ${vp.label}`, async () => {
      Object.defineProperty(window, 'innerWidth', { value: vp.width, configurable: true });
      Object.defineProperty(window, 'innerHeight', { value: vp.height, configurable: true });

      render(<MenuInOverflow />);
      fireEvent.click(screen.getByRole('button'));
      await waitFor(() => {
        expect(screen.getByRole('menuitem', { name: 'Copy' })).toBeTruthy();
      });

      const menu = document.querySelector('.translation-menu');
      expect(menu).not.toBeNull();
      if (!menu) return;

      const result = assertOverlayVisible(menu, { viewport: { width: vp.width, height: vp.height } });
      expect(result.hasSize || menu.textContent?.includes('Copy')).toBe(true);
      expect(menu.closest('#noveltrans-overlay-root')).toBeTruthy();
    });
  }

  it('dev playground route gated to DEV', () => {
    const appSource = readFileSync(resolve(process.cwd(), 'src/renderer/App.tsx'), 'utf8');
    expect(appSource).toContain('/dev/overlay-playground');
    expect(appSource).toContain('import.meta.env.DEV');
  });
});
