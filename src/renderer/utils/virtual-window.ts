/** Fixed-height virtual window for large chapter lists. */
export interface VirtualWindow {
  startIndex: number;
  endIndex: number;
  offsetY: number;
  totalHeight: number;
}

export function computeVirtualWindow(
  scrollTop: number,
  viewportHeight: number,
  itemCount: number,
  itemHeight: number,
  overscan: number,
): VirtualWindow {
  if (itemCount <= 0) {
    return { startIndex: 0, endIndex: -1, offsetY: 0, totalHeight: 0 };
  }

  const totalHeight = itemCount * itemHeight;
  const rawStart = Math.floor(scrollTop / itemHeight) - overscan;
  const startIndex = Math.max(0, rawStart);
  const visibleCount = Math.ceil(viewportHeight / itemHeight) + overscan * 2;
  const endIndex = Math.min(itemCount - 1, startIndex + visibleCount);
  const offsetY = startIndex * itemHeight;

  return { startIndex, endIndex, offsetY, totalHeight };
}
