import type { ReactNode } from 'react';
import { X } from 'lucide-react';
import { t } from '../../i18n';
import { DrawerPortal } from '../overlay/DrawerPortal';
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

  return (
    <DrawerPortal
      open={open}
      title={title}
      onClose={onClose}
      closeButton={
        <IconButton label={resolvedCloseLabel} onClick={onClose}>
          <X size={18} />
        </IconButton>
      }
    >
      {children}
    </DrawerPortal>
  );
}
