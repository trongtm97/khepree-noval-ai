export interface OverlayVisibilityResult {
  visible: boolean;
  inViewport: boolean;
  hasSize: boolean;
  topElementMatch: boolean;
  reasons: string[];
}

export interface ViewportRect {
  width: number;
  height: number;
}

function defaultViewport(): ViewportRect {
  if (typeof window !== 'undefined') {
    return { width: window.innerWidth, height: window.innerHeight };
  }
  return { width: 1920, height: 1080 };
}

/** Assert overlay is painted, sized, in viewport, and hit-testable at center. */
export function assertOverlayVisible(
  el: Element | null,
  options?: {
    viewport?: ViewportRect;
    /** Optional ancestor that must not clip the overlay center. */
    clipAncestor?: Element | null;
  },
): OverlayVisibilityResult {
  const reasons: string[] = [];
  if (!el || !(el instanceof HTMLElement)) {
    return {
      visible: false,
      inViewport: false,
      hasSize: false,
      topElementMatch: false,
      reasons: ['element missing'],
    };
  }

  const style = getComputedStyle(el);
  const hasSize = el.offsetWidth > 0 && el.offsetHeight > 0;
  if (!hasSize) reasons.push('zero size');

  const opacity = Number.parseFloat(style.opacity);
  if (style.visibility === 'hidden' || style.display === 'none' || opacity === 0) {
    reasons.push('not visible');
  }

  const rect = el.getBoundingClientRect();
  const vp = options?.viewport ?? defaultViewport();
  const inViewport =
    rect.top >= 0 &&
    rect.left >= 0 &&
    rect.bottom <= vp.height &&
    rect.right <= vp.width;
  if (!inViewport) reasons.push('outside viewport');

  if (options?.clipAncestor) {
    const clipRect = options.clipAncestor.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const clipped =
      cx < clipRect.left ||
      cx > clipRect.right ||
      cy < clipRect.top ||
      cy > clipRect.bottom;
    if (clipped) reasons.push('clipped by ancestor');
  }

  let topElementMatch = true;
  if (typeof document !== 'undefined' && hasSize) {
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    if (typeof document.elementFromPoint === 'function') {
      const top = document.elementFromPoint(cx, cy);
      topElementMatch = !!top && (el === top || el.contains(top));
      if (!topElementMatch) reasons.push('elementFromPoint mismatch');
    }
  }

  const visible =
    hasSize &&
    reasons.filter((r) => r !== 'outside viewport').length === 0 &&
    inViewport &&
    topElementMatch;

  return {
    visible,
    inViewport,
    hasSize,
    topElementMatch,
    reasons,
  };
}
