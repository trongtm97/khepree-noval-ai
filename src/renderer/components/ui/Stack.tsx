import type { CSSProperties, ReactNode } from 'react';

type StackGap = '1' | '2' | '3' | '4' | '5' | '6' | '8' | '10' | 'section' | 'card' | 'field';

const GAP_VAR: Record<StackGap, string> = {
  '1': 'var(--space-1)',
  '2': 'var(--space-2)',
  '3': 'var(--space-3)',
  '4': 'var(--space-4)',
  '5': 'var(--space-5)',
  '6': 'var(--space-6)',
  '8': 'var(--space-8)',
  '10': 'var(--space-10)',
  section: 'var(--gap-page-section)',
  card: 'var(--gap-card)',
  field: 'var(--gap-field)',
};

/** Vertical spacing primitive. Prefer over ad-hoc margin stacks. */
export function Stack({
  children,
  gap = 'section',
  className = '',
  as: Tag = 'div',
}: {
  children: ReactNode;
  gap?: StackGap;
  className?: string;
  as?: 'div' | 'section' | 'ul' | 'ol';
}) {
  const style = { '--stack-gap': GAP_VAR[gap] } as CSSProperties;
  return (
    <Tag className={`nt-stack ${className}`.trim()} style={style}>
      {children}
    </Tag>
  );
}

/** Horizontal wrap cluster for button/tool groups. */
export function Cluster({
  children,
  gap = '2',
  className = '',
}: {
  children: ReactNode;
  gap?: StackGap;
  className?: string;
}) {
  const style = { '--cluster-gap': GAP_VAR[gap] } as CSSProperties;
  return (
    <div className={`nt-cluster ${className}`.trim()} style={style}>
      {children}
    </div>
  );
}
