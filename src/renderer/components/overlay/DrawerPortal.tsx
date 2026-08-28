import { useEffect, useRef, type ReactNode } from 'react';
import { OverlayPortal } from './OverlayPortal';

export interface DrawerPortalProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  closeLabel?: string;
  closeButton?: ReactNode;
}

export function DrawerPortal({
  open,
  title,
  onClose,
  children,
  closeButton,
}: DrawerPortalProps) {
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    restoreFocusRef.current = document.activeElement as HTMLElement | null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.body.dataset.ntModalOpen = 'true';
    return () => {
      document.body.style.overflow = prevOverflow;
      delete document.body.dataset.ntModalOpen;
      restoreFocusRef.current?.focus();
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <OverlayPortal>
      <div
        className="nt-drawer-backdrop"
        data-nt-overlay="drawer-backdrop"
        onClick={onClose}
        aria-hidden
      />
      <aside
        className="nt-drawer"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        data-nt-overlay="drawer"
      >
        <div className="nt-drawer-header">
          <strong>{title}</strong>
          {closeButton}
        </div>
        <div className="nt-drawer-body">{children}</div>
      </aside>
    </OverlayPortal>
  );
}
