import type { Placement } from '@floating-ui/react';
import type { ReactNode, RefObject } from 'react';
import { AnchoredPopover } from './AnchoredPopover';
import { useAnchoredOverlay } from './useAnchoredOverlay';

export interface DropdownMenuProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  anchorRef: RefObject<HTMLElement | null>;
  children: ReactNode;
  className?: string;
  placement?: Placement;
  matchAnchorWidth?: boolean;
  minWidth?: number;
  preferredWidth?: number;
  maxWidth?: number;
  maxHeight?: number;
  role?: 'menu' | 'listbox' | 'dialog';
  id?: string;
}

export function DropdownMenu({
  open,
  onOpenChange,
  anchorRef,
  children,
  className = '',
  placement = 'bottom-start',
  matchAnchorWidth,
  minWidth,
  preferredWidth,
  maxWidth,
  maxHeight,
  role = 'menu',
  id,
}: DropdownMenuProps) {
  const { refs, floatingStyles, getFloatingProps } = useAnchoredOverlay({
    open,
    onOpenChange,
    anchorRef,
    placement,
    matchAnchorWidth,
    minWidth,
    preferredWidth,
    maxWidth,
    maxHeight,
    role,
  });

  return (
    <AnchoredPopover
      ref={(node) => {
        refs.setFloating(node);
      }}
      open={open}
      id={id}
      className={className}
      style={floatingStyles}
      {...getFloatingProps()}
    >
      {children}
    </AnchoredPopover>
  );
}
