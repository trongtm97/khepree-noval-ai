import { createPortal } from 'react-dom';
import type { ReactNode } from 'react';
import { ensureOverlayRoot } from './overlay-root';

interface OverlayPortalProps {
  children: ReactNode;
}

export function OverlayPortal({ children }: OverlayPortalProps) {
  return createPortal(children, ensureOverlayRoot());
}
