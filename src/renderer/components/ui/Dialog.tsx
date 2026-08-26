import type { ReactNode } from 'react';
import { useEffect } from 'react';
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
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); };
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div className="nt-dialog-backdrop" role="presentation" onClick={onCancel}>
      <div
        className="nt-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="nt-dialog-title"
        onClick={(e) => { e.stopPropagation(); }}
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
      </div>
    </div>
  );
}
