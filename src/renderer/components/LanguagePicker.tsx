import { useId, useMemo, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { LanguageProfileDto } from '@shared/schemas/language-profile';
import {
  formatLanguagePickerLabel,
  formatLanguagePickerStacked,
  groupLanguageProfilesByRegion,
  REGION_GROUP_LABELS_VI,
  REGION_GROUP_ORDER,
  searchLanguageProfiles,
} from '@shared/constants/language-profile';
import { getLanguageProfile } from '@shared/constants/language-profile';
import { ListboxPopover } from './overlay';
import { SearchInput } from './ui/SearchInput';

export interface LanguagePickerProps {
  value: string;
  onChange: (code: string) => void;
  languages: LanguageProfileDto[];
  /** AUTO option — source language only. */
  allowAuto?: boolean;
  autoLabel?: string;
  disabled?: boolean;
  'aria-label'?: string;
  /** Recent language codes to show at top. */
  recentCodes?: string[];
  placeholder?: string;
  /** compact: single line; stacked: international + native · code */
  labelVariant?: 'compact' | 'stacked';
}

interface ListSection {
  key: string;
  label: string;
  items: LanguageProfileDto[];
}

export function LanguagePicker({
  value,
  onChange,
  languages,
  allowAuto = false,
  autoLabel = 'AUTO',
  disabled = false,
  'aria-label': ariaLabel,
  recentCodes = [],
  placeholder = 'Chọn ngôn ngữ…',
  labelVariant = 'compact',
}: LanguagePickerProps) {
  const listId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const selected = useMemo(() => {
    if (allowAuto && value.toUpperCase() === 'AUTO') {
      return null;
    }
    return languages.find((l) => l.code === value) ?? getLanguageProfile(value);
  }, [allowAuto, value, languages]);

  const filtered = useMemo(
    () => searchLanguageProfiles(languages, query),
    [languages, query],
  );

  const sections = useMemo((): ListSection[] => {
    const out: ListSection[] = [];
    const filteredCodes = new Set(filtered.map((l) => l.code));

    if (!query.trim() && recentCodes.length > 0) {
      const recentItems = recentCodes
        .map((code) => languages.find((l) => l.code === code))
        .filter((l): l is LanguageProfileDto => !!l && filteredCodes.has(l.code));
      if (recentItems.length > 0) {
        out.push({ key: 'recent', label: 'Gần đây', items: recentItems });
      }
    }

    if (!query.trim()) {
      const grouped = groupLanguageProfilesByRegion(filtered);
      for (const group of REGION_GROUP_ORDER) {
        const items = grouped.get(group) ?? [];
        if (items.length === 0) continue;
        out.push({
          key: group,
          label: REGION_GROUP_LABELS_VI[group],
          items,
        });
      }
    } else {
      out.push({ key: 'all', label: 'Tất cả ngôn ngữ', items: filtered });
    }

    return out;
  }, [filtered, languages, query, recentCodes]);

  const displayLabel = useMemo(() => {
    if (allowAuto && value.toUpperCase() === 'AUTO') return autoLabel;
    if (!selected) return placeholder;
    return formatLanguagePickerLabel(selected);
  }, [allowAuto, autoLabel, placeholder, selected, value]);

  const direction = selected?.direction ?? 'ltr';

  const pick = (code: string) => {
    onChange(code);
    setOpen(false);
    setQuery('');
  };

  const renderOptionLabel = (lang: LanguageProfileDto) => {
    if (labelVariant === 'stacked') {
      const stacked = formatLanguagePickerStacked(lang);
      return (
        <span className="language-picker-option-stacked">
          <span className="language-picker-option-intl">{stacked.internationalName}</span>
          <span className="language-picker-option-native">{stacked.nativeLine}</span>
        </span>
      );
    }
    return (
      <span className="language-picker-option-label">
        {formatLanguagePickerLabel(lang)}
      </span>
    );
  };

  const triggerContent = (() => {
    if (allowAuto && value.toUpperCase() === 'AUTO') {
      return <span className="language-picker-value">{autoLabel}</span>;
    }
    if (!selected) {
      return <span className="language-picker-value">{placeholder}</span>;
    }
    if (labelVariant === 'stacked') {
      const stacked = formatLanguagePickerStacked(selected);
      return (
        <span className="language-picker-value-stacked">
          <span className="language-picker-intl">{stacked.internationalName}</span>
          <span className="language-picker-native">{stacked.nativeLine}</span>
        </span>
      );
    }
    return <span className="language-picker-value">{displayLabel}</span>;
  })();

  return (
    <div className="language-picker">
      <button
        ref={triggerRef}
        type="button"
        className="language-picker-trigger nt-input"
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={listId}
        disabled={disabled}
        dir={direction}
        onClick={() => {
          if (disabled) return;
          setOpen((v) => !v);
        }}
      >
        {triggerContent}
        <ChevronDown size={14} aria-hidden className="language-picker-chevron" />
      </button>
      <ListboxPopover
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setQuery('');
        }}
        anchorRef={triggerRef}
        id={listId}
        className="language-picker-menu"
        matchAnchorWidth={false}
        minWidth={300}
        preferredWidth={380}
        maxHeight={320}
      >
        <SearchInput
          autoFocus
          value={query}
          placeholder="Tìm: japan, 日本, ja, nhật…"
          aria-label="Tìm ngôn ngữ"
          onChange={(e) => {
            setQuery(e.target.value);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              setOpen(false);
              setQuery('');
            }
          }}
        />
        <div className="language-picker-list">
          {allowAuto && !query.trim() ? (
            <button
              type="button"
              role="option"
              aria-selected={value.toUpperCase() === 'AUTO'}
              className={`language-picker-option${value.toUpperCase() === 'AUTO' ? ' is-selected' : ''}`}
              onClick={() => {
                pick('AUTO');
              }}
            >
              {autoLabel}
            </button>
          ) : null}
          {sections.map((section) => (
            <div key={section.key} className="language-picker-section">
              <div className="language-picker-section-label">{section.label}</div>
              {section.items.map((lang) => (
                <button
                  key={lang.code}
                  type="button"
                  role="option"
                  aria-selected={lang.code === value}
                  dir={lang.direction}
                  className={`language-picker-option${lang.code === value ? ' is-selected' : ''}`}
                  onClick={() => {
                    pick(lang.code);
                  }}
                >
                  {renderOptionLabel(lang)}
                  {lang.aiSupportTier === 'EXPERIMENTAL' ? (
                    <span className="language-picker-tier muted">thử nghiệm</span>
                  ) : null}
                </button>
              ))}
            </div>
          ))}
          {sections.every((s) => s.items.length === 0) ? (
            <p className="muted language-picker-empty">Không tìm thấy ngôn ngữ.</p>
          ) : null}
        </div>
      </ListboxPopover>
    </div>
  );
}
