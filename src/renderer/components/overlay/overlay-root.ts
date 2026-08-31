export const OVERLAY_ROOT_ID = 'khepree-overlay-root';

/** Global portal mount — outside scroll/overflow containers. */
export function ensureOverlayRoot(): HTMLElement {
  let root = document.getElementById(OVERLAY_ROOT_ID);
  if (!root) {
    root = document.createElement('div');
    root.id = OVERLAY_ROOT_ID;
    document.body.appendChild(root);
  }
  return root;
}
