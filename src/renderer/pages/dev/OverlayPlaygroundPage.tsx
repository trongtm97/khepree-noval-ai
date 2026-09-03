/**
 * Developer-only overlay regression fixture.
 * Route: /dev/overlay-playground (DEV builds only).
 */
import { useRef, useState } from 'react';
import { getLanguageProfile } from '@shared/constants/language-profile';
import { LanguagePicker } from '../../components/LanguagePicker';
import { DropdownMenu, TooltipPopover } from '../../components/overlay';
import { Button, Dialog, Drawer } from '../../components/ui';

const SAMPLE_LANGS = ['en', 'ja', 'vi', 'zh-Hans', 'ko'].map((code) => getLanguageProfile(code));

function ScrollRowMenu({
  label,
  open,
  onOpenChange,
}: {
  label: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 8px' }}>
      <span>{label}</span>
      <button
        ref={ref}
        type="button"
        onClick={() => {
          onOpenChange(!open);
        }}
      >
        ⋯
      </button>
      <DropdownMenu
        open={open}
        onOpenChange={onOpenChange}
        anchorRef={ref}
        className="translation-menu"
        placement="bottom-end"
        minWidth={180}
      >
        <button type="button" role="menuitem">Action A</button>
        <button type="button" role="menuitem">Action B</button>
      </DropdownMenu>
    </div>
  );
}

function ScrollListFixture() {
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  return (
    <div
      data-testid="scroll-fixture"
      style={{ overflow: 'auto', height: 120, width: 220, border: '1px solid var(--border)' }}
    >
      {Array.from({ length: 12 }, (_, i) => (
        <ScrollRowMenu
          key={i}
          label={`Row ${i + 1}`}
          open={openIdx === i}
          onOpenChange={(next) => {
            setOpenIdx(next ? i : null);
          }}
        />
      ))}
    </div>
  );
}

export function OverlayPlaygroundPage() {
  const menuRef = useRef<HTMLButtonElement>(null);
  const edgeRef = useRef<HTMLButtonElement>(null);
  const tooltipRef = useRef<HTMLButtonElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [edgeOpen, setEdgeOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [lang, setLang] = useState('en');

  return (
    <div className="overlay-playground" style={{ padding: '1rem', display: 'grid', gap: '1.5rem' }}>
      <header>
        <h1>Overlay Playground</h1>
        <p className="muted">DEV only — regression harness for portaled overlays.</p>
      </header>

      <section>
        <h2>Dropdown</h2>
        <button
          ref={menuRef}
          type="button"
          data-testid="playground-menu-trigger"
          onClick={() => {
            setMenuOpen((v) => !v);
          }}
        >
          Open menu
        </button>
        <DropdownMenu
          open={menuOpen}
          onOpenChange={setMenuOpen}
          anchorRef={menuRef}
          className="translation-menu"
          minWidth={200}
        >
          <button type="button" role="menuitem" data-testid="playground-menu-item">
            Menu item
          </button>
        </DropdownMenu>
      </section>

      <section>
        <h2>Language picker</h2>
        <div style={{ maxWidth: 140 }}>
          <LanguagePicker
            value={lang}
            languages={SAMPLE_LANGS}
            onChange={setLang}
            aria-label="Playground language"
          />
        </div>
      </section>

      <section>
        <h2>Tooltip</h2>
        <button ref={tooltipRef} type="button" data-testid="playground-tooltip-trigger">
          Hover me
        </button>
        <TooltipPopover anchorRef={tooltipRef} content="Tooltip content" />
      </section>

      <section>
        <h2>Dialog + nested picker</h2>
        <Button
          data-testid="playground-dialog-open"
          onClick={() => {
            setDialogOpen(true);
          }}
        >
          Open dialog
        </Button>
        <Dialog
          open={dialogOpen}
          title="Nested overlay test"
          description="Language picker must stack above modal."
          confirmLabel="OK"
          cancelLabel="Cancel"
          onConfirm={() => {
            setDialogOpen(false);
          }}
          onCancel={() => {
            setDialogOpen(false);
          }}
        >
          <LanguagePicker
            value={lang}
            languages={SAMPLE_LANGS}
            onChange={setLang}
            aria-label="Dialog language"
          />
        </Dialog>
      </section>

      <section>
        <h2>Drawer</h2>
        <Button
          onClick={() => {
            setDrawerOpen(true);
          }}
        >
          Open drawer
        </Button>
        <Drawer open={drawerOpen} title="Notification drawer" onClose={() => { setDrawerOpen(false); }}>
          <p>Drawer body — portaled above shell.</p>
        </Drawer>
      </section>

      <section>
        <h2>Scroll container (last row)</h2>
        <ScrollListFixture />
      </section>

      <section style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button
          ref={edgeRef}
          type="button"
          data-testid="playground-edge-trigger"
          onClick={() => {
            setEdgeOpen((v) => !v);
          }}
        >
          Near right edge
        </button>
        <DropdownMenu
          open={edgeOpen}
          onOpenChange={setEdgeOpen}
          anchorRef={edgeRef}
          className="translation-menu"
          placement="bottom-end"
          minWidth={200}
        >
          <button type="button" role="menuitem">Edge item</button>
        </DropdownMenu>
      </section>
    </div>
  );
}
