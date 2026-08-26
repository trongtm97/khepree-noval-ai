import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { X } from 'lucide-react';
import { t } from '../../i18n';
import { IconButton } from './IconButton';

interface DrawerProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  closeLabel?: string;
}

export function Drawer({ open, title, onClose, children, closeLabel }: DrawerProps) {
  const resolvedCloseLabel = closeLabel ?? t('actions.close');
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <>
      <div className="nt-drawer-backdrop" onClick={onClose} aria-hidden />
      <aside className="nt-drawer" role="dialog" aria-modal="true" aria-label={title}>
        <div className="nt-drawer-header">
          <strong>{title}</strong>
          <IconButton label={resolvedCloseLabel} onClick={onClose}>
            <X size={18} />
          </IconButton>
        </div>
        <div className="nt-drawer-body">{children}</div>
      </aside>
    </>
  );
}
