import { Search } from 'lucide-react';
import type { InputHTMLAttributes } from 'react';

export function SearchInput({ className = '', ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className={`nt-search ${className}`.trim()}>
      <Search aria-hidden />
      <input className="nt-input" type="search" {...rest} />
    </div>
  );
}
