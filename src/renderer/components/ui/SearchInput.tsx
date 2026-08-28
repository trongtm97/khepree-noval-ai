import { forwardRef } from 'react';
import { Search, X } from 'lucide-react';
import type { InputHTMLAttributes } from 'react';

interface SearchInputProps extends InputHTMLAttributes<HTMLInputElement> {
  onClear?: () => void;
}

export const SearchInput = forwardRef<HTMLInputElement, SearchInputProps>(
  function SearchInput({ className = '', value, onClear, ...rest }, ref) {
    const showClear = Boolean(onClear && value && String(value).length > 0);
    return (
      <div className={`nt-search ${className}`.trim()}>
        <Search aria-hidden />
        <input ref={ref} className="nt-input" type="search" value={value} {...rest} />
        {showClear ? (
          <button
            type="button"
            className="nt-search-clear"
            aria-label="Clear"
            onClick={onClear}
          >
            <X size={14} aria-hidden />
          </button>
        ) : null}
      </div>
    );
  },
);
