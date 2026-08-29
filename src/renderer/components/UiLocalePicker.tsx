import { useId, useMemo, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { UiLocaleCode, UiLocalePreference } from '@shared/types/ui-locale';
import { UI_LOCALE_CATALOG, formatUiLocaleStacked } from '../i18n/ui-locale-catalog';
import { useT } from '../i18n';
import { ListboxPopover } from './overlay';

export interface UiLocalePickerProps {
  value: UiLocalePreference;
  onChange: (preference: UiLocalePreference) => void;
  disabled?: boolean;
  'aria-label'?: string;
}

type PickerOption =
  | { kind: 'system'; preference: 'system' }
  | { kind: 'locale'; preference: UiLocaleCode; entry: (typeof UI_LOCALE_CATALOG)[number] };

export function UiLocalePicker({
  value,
  onChange,
  disabled = false,
  'aria-label': ariaLabel,
}: UiLocalePickerProps) {
  const t = useT();
  const listId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);

  const options = useMemo((): PickerOption[] => {
    return [
      { kind: 'system', preference: 'system' },
      ...UI_LOCALE_CATALOG.map(
        (entry): PickerOption => ({ kind: 'locale', preference: entry.code, entry }),
      ),
    ];
  }, []);

  const triggerLabel = useMemo(() => {
    if (value === 'system') {
      return {
        internationalName: t('settings.uiLocaleSystemShort'),
        nativeLine: t('settings.uiLocaleSystem'),
      };
    }
    return formatUiLocaleStacked(value);
  }, [t, value]);

  const pick = (preference: UiLocalePreference) => {
    onChange(preference);
    setOpen(false);
  };

  return (
    <div className="language-picker ui-locale-picker">
      <button
        ref={triggerRef}
        type="button"
        className="language-picker-trigger nt-input"
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={listId}
        disabled={disabled}
        onClick={() => {
          if (disabled) return;
          setOpen((v) => !v);
        }}
      >
        <span className="language-picker-value-stacked">
          <span className="language-picker-intl">{triggerLabel.internationalName}</span>
          <span className="language-picker-native">{triggerLabel.nativeLine}</span>
        </span>
        <ChevronDown size={14} aria-hidden className="language-picker-chevron" />
      </button>
      <ListboxPopover
        open={open}
        onOpenChange={setOpen}
        anchorRef={triggerRef}
        id={listId}
        className="language-picker-menu ui-locale-picker-menu"
        matchAnchorWidth={false}
        minWidth={280}
        preferredWidth={340}
        maxHeight={240}
      >
        <div className="language-picker-list">
          {options.map((option) => {
            const selected = option.preference === value;
            if (option.kind === 'system') {
              return (
                <button
                  key="system"
                  type="button"
                  role="option"
                  aria-selected={selected}
                  className={`language-picker-option${selected ? ' is-selected' : ''}`}
                  onClick={() => {
                    pick('system');
                  }}
                >
                  <span className="language-picker-option-stacked">
                    <span className="language-picker-option-intl">
                      {t('settings.uiLocaleSystemShort')}
                    </span>
                    <span className="language-picker-option-native">
                      {t('settings.uiLocaleSystem')}
                    </span>
                  </span>
                </button>
              );
            }
            const stacked = formatUiLocaleStacked(option.entry.code);
            return (
              <button
                key={option.entry.code}
                type="button"
                role="option"
                aria-selected={selected}
                className={`language-picker-option${selected ? ' is-selected' : ''}`}
                onClick={() => {
                  pick(option.entry.code);
                }}
              >
                <span className="language-picker-option-stacked">
                  <span className="language-picker-option-intl">{stacked.internationalName}</span>
                  <span className="language-picker-option-native">{stacked.nativeLine}</span>
                </span>
              </button>
            );
          })}
        </div>
      </ListboxPopover>
    </div>
  );
}
