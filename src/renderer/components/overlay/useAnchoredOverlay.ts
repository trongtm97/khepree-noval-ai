import {
  autoUpdate,
  flip,
  offset,
  shift,
  size,
  useDismiss,
  useFloating,
  useInteractions,
  useRole,
  type Placement,
} from '@floating-ui/react';
import { useEffect, type RefObject } from 'react';

export interface UseAnchoredOverlayOptions {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  anchorRef: RefObject<HTMLElement | null>;
  placement?: Placement;
  matchAnchorWidth?: boolean;
  minWidth?: number;
  preferredWidth?: number;
  maxWidth?: number;
  maxHeight?: number;
  role?: 'menu' | 'listbox' | 'tooltip' | 'dialog' | 'select';
}

export function useAnchoredOverlay({
  open,
  onOpenChange,
  anchorRef,
  placement = 'bottom-start',
  matchAnchorWidth = false,
  minWidth,
  preferredWidth,
  maxWidth,
  maxHeight,
  role = 'menu',
}: UseAnchoredOverlayOptions) {
  const { refs, floatingStyles, context } = useFloating({
    open,
    onOpenChange,
    placement,
    strategy: 'fixed',
    whileElementsMounted: autoUpdate,
    middleware: [
      offset(4),
      flip({ padding: 8 }),
      shift({ padding: 8 }),
      size({
        padding: 8,
        apply({ rects, elements, availableWidth, availableHeight }) {
          const styles: Partial<CSSStyleDeclaration> = {};
          const floor = minWidth ?? 0;
          if (matchAnchorWidth) {
            styles.width = `${Math.max(floor, rects.reference.width)}px`;
          } else if (preferredWidth != null) {
            const cap = maxWidth != null ? Math.min(preferredWidth, maxWidth) : preferredWidth;
            styles.width = `${Math.max(floor, Math.min(cap, availableWidth))}px`;
          } else if (minWidth != null) {
            styles.minWidth = `${minWidth}px`;
          }
          if (!matchAnchorWidth && preferredWidth == null && minWidth != null) {
            styles.minWidth = `${minWidth}px`;
          }
          if (maxWidth != null && preferredWidth == null) {
            styles.maxWidth = `${maxWidth}px`;
          }
          const cap = maxHeight ?? availableHeight;
          if (cap > 0) {
            styles.maxHeight = `${Math.floor(cap)}px`;
          }
          Object.assign(elements.floating.style, styles);
        },
      }),
    ],
  });

  useEffect(() => {
    refs.setReference(anchorRef.current);
    return () => {
      refs.setReference(null);
    };
  }, [anchorRef, refs, open]);

  const dismiss = useDismiss(context, { outsidePressEvent: 'mousedown' });
  const roleHook = useRole(context, { role });
  const { getFloatingProps } = useInteractions([dismiss, roleHook]);

  return { refs, floatingStyles, context, getFloatingProps };
}
