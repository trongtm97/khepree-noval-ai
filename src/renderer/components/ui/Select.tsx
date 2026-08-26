import type { SelectHTMLAttributes } from 'react';

export function Select({ className = '', children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={`nt-select ${className}`.trim()} {...rest}>
      {children}
    </select>
  );
}
