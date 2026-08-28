import { forwardRef, type ReactNode } from 'react';
import { Search, X } from 'lucide-react';
import type { InputHTMLAttributes } from 'react';

interface SearchInputProps extends InputHTMLAttributes<HTMLInputElement> {
  onClear?: () => void;
  /** Trailing control inside the search field (e.g. filter icon). */
  trailingAction?: ReactNode;
}

export const SearchInput = forwardRef<HTMLInputElement, SearchInputProps>(
  function SearchInput({ className = '', value, onClear, trailingAction, ...rest }, ref) {
    const showClear = Boolean(onClear && value && String(value).length > 0);
    const hasTrailing = Boolean(trailingAction || showClear);
    return (
      <div className={`nt-search ${hasTrailing ? 'nt-search--has-trailing' : ''} ${className}`.trim()}>
        <Search aria-hidden />
        <input ref={ref} className="nt-input" type="search" value={value} {...rest} />
        {trailingAction ? <div className="nt-search-trailing">{trailingAction}</div> : null}
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
