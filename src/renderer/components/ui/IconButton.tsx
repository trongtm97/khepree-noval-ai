import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  active?: boolean;
  children: ReactNode;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  {
    label,
    active = false,
    className = '',
    children,
    style,
    ...rest
  },
  ref,
) {
  return (
    <button
      ref={ref}
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
});
