import type { ReactNode } from 'react';

type BadgeTone = 'default' | 'success' | 'warning' | 'error' | 'info' | 'accent';

interface BadgeProps {
  tone?: BadgeTone;
  children: ReactNode;
  className?: string;
}

export function Badge({ tone = 'default', children, className = '' }: BadgeProps) {
  const toneClass = tone === 'default' ? '' : `nt-badge--${tone}`;
  return <span className={`nt-badge ${toneClass} ${className}`.trim()}>{children}</span>;
}
