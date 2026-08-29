import { useEffect, useState } from 'react';
import { Tabs } from '../ui/Tabs';
import type { SettingsTab } from './settings-tabs';

export interface SettingsNavItem {
  id: SettingsTab;
  label: string;
}

interface SettingsNavProps {
  items: SettingsNavItem[];
  value: SettingsTab;
  onChange: (id: SettingsTab) => void;
}

function useCompactSettingsNav(): boolean {
  const [compact, setCompact] = useState(() =>
    typeof window !== 'undefined'
      ? window.matchMedia('(max-width: 1366px)').matches
      : false,
  );

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 1366px)');
    const handler = () => {
      setCompact(mq.matches);
    };
    mq.addEventListener('change', handler);
    return () => {
      mq.removeEventListener('change', handler);
    };
  }, []);

  return compact;
}

export function SettingsNav({ items, value, onChange }: SettingsNavProps) {
  const compact = useCompactSettingsNav();

  if (compact) {
    return (
      <nav className="settings-side-nav" aria-label="Settings">
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`settings-side-nav__item ${item.id === value ? 'active' : ''}`}
            aria-current={item.id === value ? 'page' : undefined}
            onClick={() => {
              onChange(item.id);
            }}
          >
            {item.label}
          </button>
        ))}
      </nav>
    );
  }

  return (
    <Tabs
      items={items}
      value={value}
      onChange={(id) => {
        onChange(id as SettingsTab);
      }}
    />
  );
}
