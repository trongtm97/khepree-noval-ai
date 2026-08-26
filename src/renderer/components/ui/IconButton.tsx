import type { ButtonHTMLAttributes, ReactNode } from 'react';

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  active?: boolean;
  children: ReactNode;
}

export function IconButton({
  label,
  active = false,
  className = '',
  children,
  style,
  ...rest
}: IconButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={`nt-icon-btn ${active ? 'nt-icon-btn--active' : ''} ${className}`.trim()}
      style={{ position: 'relative', ...style }}
      {...rest}
    >
      {children}
    </button>
  );
}
