/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useRef, useState } from 'react';
import { DropdownMenu, ModalPortal, ensureOverlayRoot } from '../../../../src/renderer/components/overlay';

function OverflowHiddenDropdown() {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLButtonElement>(null);
  return (
    <div style={{ overflow: 'hidden', width: 120, height: 40 }}>
      <button ref={anchorRef} type="button" onClick={() => { setOpen((v) => !v); }}>
        Open
      </button>
      <DropdownMenu open={open} onOpenChange={setOpen} anchorRef={anchorRef} className="translation-menu">
        <button type="button" role="menuitem">Item A</button>
      </DropdownMenu>
    </div>
  );
}

function ScrollRow({ label, open, onOpenChange }: { label: string; open: boolean; onOpenChange: (v: boolean) => void }) {
  const anchorRef = useRef<HTMLButtonElement>(null);
  return (
    <div style={{ height: 40 }}>
      <button ref={anchorRef} type="button" onClick={() => { onOpenChange(!open); }}>
        {label}
      </button>
      <DropdownMenu
        open={open}
        onOpenChange={onOpenChange}
        anchorRef={anchorRef}
        className="translation-menu"
        placement="bottom-end"
      >
        <button type="button" role="menuitem">Action</button>
      </DropdownMenu>
    </div>
  );
}

function OverflowAutoList() {
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  return (
    <div data-testid="scroll-list" style={{ overflow: 'auto', height: 80, width: 200 }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <ScrollRow
          key={n}
          label={`Row ${n}`}
          open={openIdx === n}
          onOpenChange={(next) => { setOpenIdx(next ? n : null); }}
        />
      ))}
    </div>
  );
}

describe('overlay harness', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="root"></div>';
    ensureOverlayRoot();
    Object.defineProperty(window, 'innerWidth', { value: 1366, writable: true, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 768, writable: true, configurable: true });
  });

  afterEach(() => {
    cleanup();
    document.body.innerHTML = '';
  });

  it('dropdown inside overflow:hidden is portaled outside clip parent', async () => {
    render(<OverflowHiddenDropdown />);
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    await waitFor(() => {
      expect(screen.getByRole('menuitem', { name: 'Item A' })).toBeTruthy();
    });
    const menu = document.querySelector('.translation-menu');
    expect(menu).not.toBeNull();
    if (!menu) return;
    expect(menu.closest('#khepree-overlay-root')).toBeTruthy();
    const clipParent = screen.getByRole('button', { name: 'Open' }).parentElement;
    expect(clipParent?.contains(menu)).toBe(false);
  });

  it('last row menu in overflow:auto scroll container escapes clipping', async () => {
    render(<OverflowAutoList />);
    const list = screen.getByTestId('scroll-list');
    list.scrollTop = list.scrollHeight;
    fireEvent.click(screen.getByRole('button', { name: 'Row 5' }));
    await waitFor(() => {
      expect(screen.getByRole('menuitem', { name: 'Action' })).toBeTruthy();
    });
    const menu = document.querySelector('.translation-menu');
    expect(menu).not.toBeNull();
    if (!menu) return;
    expect(menu.closest('#khepree-overlay-root')).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: 'Action' })).toBeTruthy();
  });

  it('modal portals to overlay root', () => {
    render(
      <ModalPortal open contentClassName="nt-dialog" onBackdropClick={() => undefined}>
        <h2>Test dialog</h2>
      </ModalPortal>,
    );
    const dialog = screen.getByRole('dialog');
    expect(dialog.closest('#khepree-overlay-root')).toBeTruthy();
  });
});
