import {
  autoUpdate,
  flip,
  offset,
  shift,
  useDismiss,
  useFloating,
  useFocus,
  useHover,
  useInteractions,
  useRole,
  type Placement,
} from '@floating-ui/react';
import type { ReactNode, RefObject } from 'react';
import { useEffect, useState } from 'react';
import { AnchoredPopover } from './AnchoredPopover';

export interface TooltipPopoverProps {
  anchorRef: RefObject<HTMLElement | null>;
  content: ReactNode;
  placement?: Placement;
  className?: string;
  /** Delay before showing (ms). */
  openDelay?: number;
}

/** Portaled tooltip — escapes overflow/scroll parents. */
export function TooltipPopover({
  anchorRef,
  content,
  placement = 'top',
  className = 'nt-tooltip__tip',
  openDelay = 200,
}: TooltipPopoverProps) {
  const [open, setOpen] = useState(false);

  const { refs, floatingStyles, context } = useFloating({
    open,
    onOpenChange: setOpen,
    placement,
    strategy: 'fixed',
    whileElementsMounted: autoUpdate,
    middleware: [offset(6), flip({ padding: 8 }), shift({ padding: 8 })],
  });

  useEffect(() => {
    refs.setReference(anchorRef.current);
    return () => {
      refs.setReference(null);
    };
  }, [anchorRef, refs]);

  const hover = useHover(context, { delay: { open: openDelay, close: 0 } });
  const focus = useFocus(context);
  const dismiss = useDismiss(context);
  const role = useRole(context, { role: 'tooltip' });
  const { getFloatingProps } = useInteractions([hover, focus, dismiss, role]);

  return (
    <AnchoredPopover
      ref={(node) => {
        refs.setFloating(node);
      }}
      open={open}
      className={className}
      style={floatingStyles}
      {...getFloatingProps()}
    >
      {content}
    </AnchoredPopover>
  );
}
