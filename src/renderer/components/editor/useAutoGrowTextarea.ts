import { useCallback, useLayoutEffect, useRef } from 'react';

/** Grow textarea with content. No inner scrollbar; min height comes from CSS. */
export function useAutoGrowTextarea(value: string) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const syncSize = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    const next = el.scrollHeight;
    if (next > 0) {
      el.style.height = `${next}px`;
    }
  }, []);

  useLayoutEffect(() => {
    syncSize();
  }, [value, syncSize]);

  useLayoutEffect(() => {
    const onResize = () => {
      syncSize();
    };
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
    };
  }, [syncSize]);

  return { textareaRef, syncSize };
}
