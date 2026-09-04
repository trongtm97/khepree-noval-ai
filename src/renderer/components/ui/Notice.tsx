import type { ReactNode } from 'react';

type NoticeTone = 'info' | 'success' | 'warning' | 'danger';

/**
 * Calm inline notice — not a toast, not a bordered alert box stack.
 */
export function Notice({
  children,
  tone = 'info',
  className = '',
}: {
  children: ReactNode;
  tone?: NoticeTone;
  className?: string;
}) {
  return (
    <div className={`nt-notice nt-notice--${tone} ${className}`.trim()} role="status">
      {children}
    </div>
  );
}
