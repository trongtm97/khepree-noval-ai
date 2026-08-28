import type { ReactNode } from 'react';
import { ModalPortal } from '../overlay/ModalPortal';
import { Button } from './Button';

interface DialogProps {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel: string;
  cancelLabel: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  children?: ReactNode;
}

export function Dialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel,
  danger = false,
  busy = false,
  onConfirm,
  onCancel,
  children,
}: DialogProps) {
  return (
    <ModalPortal
      open={open}
      onBackdropClick={onCancel}
      contentClassName="nt-dialog"
      role="alertdialog"
      ariaLabelledBy="nt-dialog-title"
      onContentClick={(e) => {
        e.stopPropagation();
      }}
    >
      <h2 id="nt-dialog-title">{title}</h2>
      {description ? <p style={{ whiteSpace: 'pre-wrap' }}>{description}</p> : null}
      {children}
      <div className="nt-dialog-actions">
        <Button variant="secondary" onClick={onCancel} disabled={busy}>
          {cancelLabel}
        </Button>
        <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm} loading={busy}>
          {confirmLabel}
        </Button>
      </div>
    </ModalPortal>
  );
}
