import { forwardRef, type CSSProperties, type HTMLAttributes, type ReactNode } from 'react';
import { OverlayPortal } from './OverlayPortal';

export interface AnchoredPopoverProps extends HTMLAttributes<HTMLDivElement> {
  open: boolean;
  children: ReactNode;
  style?: CSSProperties;
  className?: string;
}

export const AnchoredPopover = forwardRef<HTMLDivElement, AnchoredPopoverProps>(
  function AnchoredPopover({ open, children, style, className = '', ...rest }, ref) {
    if (!open) return null;

    return (
      <OverlayPortal>
        <div
          ref={ref}
          className={`nt-overlay-floating ${className}`.trim()}
          style={style}
          data-nt-overlay="popover"
          {...rest}
        >
          {children}
        </div>
      </OverlayPortal>
    );
  },
);
