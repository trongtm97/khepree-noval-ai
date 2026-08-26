import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'md' | 'sm';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  children: ReactNode;
}

export function Button({
  variant = 'secondary',
  size = 'md',
  loading = false,
  disabled,
  className = '',
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      type="button"
      className={`nt-btn nt-btn--${variant} ${size === 'sm' ? 'nt-btn--sm' : ''} ${className}`.trim()}
      disabled={disabled ?? loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <span className="loading-spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> : null}
      {children}
    </button>
  );
}
