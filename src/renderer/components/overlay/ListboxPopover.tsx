import type { Placement } from '@floating-ui/react';
import type { ReactNode, RefObject } from 'react';
import { DropdownMenu } from './DropdownMenu';

export interface ListboxPopoverProps {
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
  id?: string;
}

/** Listbox-styled anchored popover (language picker, chapter selector, etc.). */
export function ListboxPopover({
  open,
  onOpenChange,
  anchorRef,
  children,
  className = '',
  placement = 'bottom-start',
  matchAnchorWidth = false,
  minWidth,
  preferredWidth,
  maxWidth,
  maxHeight,
  id,
}: ListboxPopoverProps) {
  return (
    <DropdownMenu
      open={open}
      onOpenChange={onOpenChange}
      anchorRef={anchorRef}
      className={className}
      placement={placement}
      matchAnchorWidth={matchAnchorWidth}
      minWidth={minWidth}
      preferredWidth={preferredWidth}
      maxWidth={maxWidth}
      maxHeight={maxHeight}
      role="listbox"
      id={id}
    >
      {children}
    </DropdownMenu>
  );
}
