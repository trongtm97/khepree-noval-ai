import { useEffect, useRef, type ReactNode } from 'react';
import { OverlayPortal } from './OverlayPortal';

export interface ModalPortalProps {
  open: boolean;
  onBackdropClick?: () => void;
  children: ReactNode;
  backdropClassName?: string;
  contentClassName?: string;
  role?: string;
  ariaModal?: boolean;
  ariaLabelledBy?: string;
  ariaLabel?: string;
  onContentClick?: (event: React.MouseEvent) => void;
}

export function ModalPortal({
  open,
  onBackdropClick,
  children,
  backdropClassName = 'nt-dialog-backdrop',
  contentClassName,
  role = 'dialog',
  ariaModal = true,
  ariaLabelledBy,
  ariaLabel,
  onContentClick,
}: ModalPortalProps) {
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
      if (e.key === 'Escape') onBackdropClick?.();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onBackdropClick]);

  if (!open) return null;

  return (
    <OverlayPortal>
      <div
        className={backdropClassName}
        role="presentation"
        data-nt-overlay="modal-backdrop"
        onClick={onBackdropClick}
      >
        <div
          className={contentClassName}
          role={role}
          aria-modal={ariaModal || undefined}
          aria-labelledby={ariaLabelledBy}
          aria-label={ariaLabel}
          data-nt-overlay="modal"
          onClick={(e) => {
            e.stopPropagation();
            onContentClick?.(e);
          }}
        >
          {children}
        </div>
      </div>
    </OverlayPortal>
  );
}
